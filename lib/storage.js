const fs = require('fs');
const path = require('path');

class Storage {
    constructor(hexo) {
        this.hexo = hexo;
        this.cacheDir = path.join(process.cwd(), 'node_modules', '.cache');
        this.cacheFile = path.join(this.cacheDir, 'ai-translate-cache.json');
        this.cache = {};
        this.localCacheLoaded = false;
        this.dbUrl = process.env.DATABASE_URL;
        this.isDbEnabled = !!this.dbUrl;
        this.pool = null;
        this.isClosed = false;

        if (!fs.existsSync(this.cacheDir)) {
            fs.mkdirSync(this.cacheDir, { recursive: true });
        }

        // Load local cache synchronously for injector access.
        // This is necessary because Hexo injectors are evaluated during plugin initialization,
        // before the async load() method is called in before_post_render filter.
        this._loadLocalCacheFile();

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
     * Load local cache file into memory.
     * @private
     */
    _loadLocalCacheFile() {
        if (!fs.existsSync(this.cacheFile)) {
            return;
        }
        try {
            this.cache = JSON.parse(fs.readFileSync(this.cacheFile, 'utf-8'));
            this.localCacheLoaded = true;
        } catch (e) {
            this.hexo.log.warn(`[AI Translate] Failed to parse local cache file: ${e.message}`);
            this.cache = {};
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
        // 1. Load from local cache file if not already loaded
        if (!this.localCacheLoaded) {
            this._loadLocalCacheFile();
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
