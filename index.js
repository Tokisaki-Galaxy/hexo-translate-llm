/**
 * AI 自动翻译插件
 * feat: hash 缓存，避免重复翻译
 * feat: 支持自定义模型和端点
 * feat: 优化SEO
 * feat: 串行排队，防止 API 并发超限
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

try { require('dotenv').config(); } catch (e) {}
const config = hexo.config.llm_translation;
const API_KEY = process.env.LLM_API_KEY;

// 缓存文件路径：利用 node_modules/.cache 绕过 Vercel 的构建清理
const CACHE_DIR = path.join(process.cwd(), 'node_modules', '.cache');
if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
const CACHE_FILE = path.join(CACHE_DIR, 'ai-translate-cache.json');

// 加载缓存
let cache = {};
if (fs.existsSync(CACHE_FILE)) {
    try {
        cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
    } catch (e) { cache = {}; }
}

const saveCache = () => fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));

// --- 并发控制 ---
// 降低并发至 2，增加稳定性，防止 API 熔断
let activeCount = 0;
const waitingQueue = [];

const runWithLimit = async (fn) => {
    if (activeCount >= config.max_concurrency || 2) {
        await new Promise(resolve => waitingQueue.push(resolve));
    }
    activeCount++;
    try {
        return await fn();
    } finally {
        activeCount--;
        if (waitingQueue.length > 0) {
            const nextResolve = waitingQueue.shift();
            nextResolve();
        }
    }
};

const fetchWithRetry = async (url, options, retries = 2) => {
    for (let i = 0; i <= retries; i++) {
        try {
            const controller = new AbortController();
            const timeout = options.timeout;
            const timeoutId = setTimeout(() => controller.abort(), timeout);
            
            const response = await fetch(url, { ...options, signal: controller.signal });
            clearTimeout(timeoutId);
            
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return await response.json();
        } catch (err) {
            if (i === retries) throw err;
            const delay = (i + 1) * 2000 + Math.random() * 1000;
            console.warn(`[AI Translate] Retry ${i + 1}/${retries} after ${Math.round(delay)}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
};

hexo.extend.filter.register('before_post_render', async (data) => {
    // 健壮性检查：确保 data 及其属性存在
    if (!data || !data.content || !config || !config.enable || !API_KEY || data.layout !== 'post' || data.no_translate) {
        return data;
    }

    // 计算内容 Hash，判断是否需要重新翻译
    const contentHash = crypto.createHash('md5').update(data.content + (data.title || '')).digest('hex');
    const model = config.model || 'deepseek-ai/DeepSeek-V3.2';

    // 缓存命中逻辑
    if (cache[data.source] && cache[data.source].hash === contentHash && cache[data.source].model === model) {
        const cached = cache[data.source];
        data.title = cached.translatedTitle;
        data.content = cached.wrappedContent;
        hexo.log.info(`[AI Translate] Cache Hit: ${data.title}`);
        return data;
    }

    // --- 并发控制 ---
    return runWithLimit(async () => {
        const endpoint = config.endpoint || 'https://api.siliconflow.cn/v1/chat/completions';

        try {
            // 强化 Prompt，严禁 AI 输出任何解释性文字
            const prompt = `You are a professional technical translator.
            1. Translate the following Markdown content to English.
            2. DO NOT translate code blocks, technical identifiers, or Hexo tags like {% ... %}.
            3. Maintain all Markdown formatting.
            4. Also translate the title provided.
            5. Output ONLY the translated text. NO explanations, NO notes, NO meta-comments.
            Format your response as: [TITLE_START]translated title[TITLE_END][CONTENT_START]translated content[CONTENT_END]`;

            const result = await fetchWithRetry(endpoint, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
                timeout: (config.single_timeout || 120) * 1000,
                body: JSON.stringify({
                    model: model,
                    messages: [
                        { role: 'system', content: prompt },
                        { role: 'user', content: `Title: ${data.title}\n\nContent: ${data.content}` }
                    ]
                })
            });

            const raw = result.choices?.[0]?.message?.content;

            if (raw) {
                const translatedTitle = raw.match(/\[TITLE_START\](.*?)\[TITLE_END\]/s)?.[1] || data.title;
                let translatedContent = raw.match(/\[CONTENT_START\](.*?)\[CONTENT_END\]/s)?.[1] || "";

                if (translatedContent) {
                    // 安全过滤：将非正常的 {% 替换为 HTML 实体，防止被误认为 Hexo 标签导致构建崩溃
                    translatedContent = translatedContent.replace(/\{%(?!\s*(raw|endraw|image|link|code|quote))/g, '&#123;%');

                    const titleScript = `<script>window._zh_title = ${JSON.stringify(data.title)};</script>\n\n`;

                    // 封装内容，注意空行以确保 Markdown 渲染
                    const wrappedContent = `${titleScript}
<div class="zh-content">

${data.content}

</div>
<div class="en-content">

${translatedContent}

</div>`;

                    // 更新数据并存入缓存
                    cache[data.source] = {
                        hash: contentHash,
                        model: model,
                        translatedTitle: translatedTitle,
                        wrappedContent: wrappedContent
                    };
                    saveCache();

                    data.title = translatedTitle;
                    data.content = wrappedContent;
                    hexo.log.info(`[AI Translate] Success: ${data.title}`);
                }
            }
        } catch (error) {
            hexo.log.error(`[AI Translate] Skip "${data.title}": ${error.message}`);
        }
        return data; // 无论成功失败，必须返回 data，防止 Hexo 报错
    });
});

// 注入 CSS 和 JS
hexo.extend.injector.register('head_end', `
<style>
    .zh-content { display: none; }
    .en-content { display: block; }
    html[lang^="zh"] .en-content { display: none !important; }
    html[lang^="zh"] .zh-content { display: block !important; }
</style>
`, 'default');

hexo.extend.injector.register('head_begin', `
<script>
(function() {
    var userLang = navigator.language || navigator.userLanguage;
    if (userLang && userLang.startsWith('zh')) {
        document.documentElement.setAttribute('lang', 'zh-CN');
        window.addEventListener('DOMContentLoaded', function() {
            if (window._zh_title) document.title = document.title.replace(/.*(?= |$)/, window._zh_title);
        });
    } else {
        document.documentElement.setAttribute('lang', 'en');
    }
})();
</script>
`, 'default');
