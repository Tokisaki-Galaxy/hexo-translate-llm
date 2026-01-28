const fs = require('fs');
const path = require('path');

class Storage {
    constructor(hexo) {
        this.hexo = hexo;
        this.cacheDir = path.join(process.cwd(), 'node_modules', '.cache');
        this.cacheFile = path.join(this.cacheDir, 'ai-translate-cache.json');
        this.cache = {};
        this.dbUrl = process.env.DATABASE_URL;
        this.isDbEnabled = !!this.dbUrl;
        this.pool = null;
        this.isClosed = false;

        if (!fs.existsSync(this.cacheDir)) {
            fs.mkdirSync(this.cacheDir, { recursive: true });
        }

        // Load local cache synchronously for injector access
        this.loadLocalSync();

        if (this.isDbEnabled) {
            try {
                const { Pool } = require('pg');
                this.pool = new Pool({
                    connectionString: this.dbUrl,
                    ssl: { rejectUnauthorized: false } // Neon requires SSL
                });
                this.hexo.log.info('[AI Translate] Neon PostgreSQL storage enabled.');
            } catch (e) {
                this.hexo.log.warn('[AI Translate] Failed to initialize PostgreSQL. Falling back to local cache.');
                this.isDbEnabled = false;
            }
        }
    }

    /**
     * Synchronously load local cache file.
     * Called in constructor to ensure cache is available for injectors.
     */
    loadLocalSync() {
        if (fs.existsSync(this.cacheFile)) {
            try {
                this.cache = JSON.parse(fs.readFileSync(this.cacheFile, 'utf-8'));
            } catch (e) {
                this.cache = {};
            }
        }
    }

    async initDb() {
        if (!this.isDbEnabled) return;
        try {
            await this.pool.query(`
                CREATE TABLE IF NOT EXISTS hexo_translate_cache (
                    key TEXT PRIMARY KEY,
                    value JSONB,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            `);
        } catch (e) {
            this.hexo.log.error(`[AI Translate] DB Init Error: ${e.message}`);
            this.isDbEnabled = false;
        }
    }

    async load() {
        // 1. 尝试从本地加载 (may already be loaded via loadLocalSync)
        if (Object.keys(this.cache).length === 0 && fs.existsSync(this.cacheFile)) {
            try {
                this.cache = JSON.parse(fs.readFileSync(this.cacheFile, 'utf-8'));
            } catch (e) {
                this.cache = {};
            }
        }

        // 2. 如果启用了 DB，从远程同步
        if (this.isDbEnabled) {
            try {
                await this.initDb();
                const res = await this.pool.query('SELECT key, value FROM hexo_translate_cache');
                res.rows.forEach(row => {
                    this.cache[row.key] = row.value;
                });
                this.hexo.log.info(`[AI Translate] Synced ${res.rowCount} items from Neon DB.`);
            } catch (e) {
                this.hexo.log.error(`[AI Translate] DB Load Error: ${e.message}`);
            }
        }
        return this.cache;
    }

    async save(source, data) {
        this.cache[source] = data;
        
        // 保存到本地
        try {
            fs.writeFileSync(this.cacheFile, JSON.stringify(this.cache, null, 2));
        } catch (e) {
            this.hexo.log.error(`[AI Translate] Local Save Error: ${e.message}`);
        }

        // 保存到远程
        if (this.isDbEnabled && !this.isClosed) {
            try {
                await this.pool.query(`
                    INSERT INTO hexo_translate_cache (key, value, updated_at)
                    VALUES ($1, $2, CURRENT_TIMESTAMP)
                    ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = CURRENT_TIMESTAMP
                `, [source, data]);
            } catch (e) {
                if (!this.isClosed) {
                    this.hexo.log.error(`[AI Translate] DB Save Error: ${e.message}`);
                }
            }
        }
    }

    get(source) {
        return this.cache[source];
    }

    async close() {
        this.isClosed = true;
        if (this.pool) {
            await this.pool.end();
        }
    }
}

module.exports = Storage;
