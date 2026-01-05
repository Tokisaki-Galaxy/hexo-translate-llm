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
const Storage = require('./lib/storage');

try { require('dotenv').config(); } catch (e) {}
const config = hexo.config.llm_translation;
const API_KEY = process.env.LLM_API_KEY;

const storage = new Storage(hexo);
let loadPromise = null;

if (config && config.enable && !API_KEY) {
    hexo.log.warn('[AI Translate] LLM_API_KEY is missing. Translation will be skipped.');
}

// --- 并发控制 ---
// 降低并发至 2，增加稳定性，防止 API 熔断
let activeCount = 0;
const waitingQueue = [];

const runWithLimit = async (fn) => {
    const limit = (config && config.max_concurrency) || 2;
    if (activeCount >= limit) {
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

// --- 全局标题映射，用于首页/列表页标题替换 ---
const globalTitlePairs = [];

hexo.extend.filter.register('before_post_render', async (data) => {
    // 健壮性检查：确保 data 及其属性存在
    if (!data || !data.content || !config || !config.enable || !API_KEY || data.layout !== 'post' || data.no_translate) {
        return data;
    }

    // 确保缓存已加载（使用 Promise 锁防止并发初始化）
    if (!loadPromise) {
        loadPromise = storage.load();
    }
    await loadPromise;

    // 计算内容 Hash，判断是否需要重新翻译
    const CACHE_VERSION = 'v1'; // 结构变更时修改此版本号
    const contentHash = crypto.createHash('md5')
        .update(data.content + (data.title || '') + CACHE_VERSION)
        .digest('hex');
    const model = config.model || 'deepseek-ai/DeepSeek-V3.2';

    // 缓存命中逻辑
    const cached = storage.get(data.source);
    if (cached && cached.hash === contentHash && cached.model === model) {
        const originalTitle = data.title; // 保存原始中文标题
        data.title = cached.translatedTitle;
        data.content = cached.wrappedContent;
        // 记录标题映射用于首页/列表页
        globalTitlePairs.push({ zh: originalTitle, en: cached.translatedTitle });
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
            2. DO NOT translate code blocks, technical identifiers, or Hexo tags (like {% note %}, {% tabs %}, {% codeblock %}, etc.). Keep ALL {% ... %} and {% ... %}...{% end... %} tag pairs EXACTLY as they are.
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
                const originalTitle = data.title; // 保存原始中文标题

                if (translatedContent) {
                    // 安全过滤：将非正常的 {% 替换为 HTML 实体，防止被误认为 Hexo 标签导致构建崩溃
                    // 允许所有格式正确的 Hexo 标签（如 note, tabs, codeblock 等），只转义畸形的 {% 序列
                    translatedContent = translatedContent.replace(/\{%(?!\s*\/?\w[\w-]*)/g, '&#123;%');

                    const titleScript = `<script>
window._zh_title = ${JSON.stringify(data.title)};
window._en_title = ${JSON.stringify(translatedTitle)};
if (!window._hexo_title_pairs) window._hexo_title_pairs = [];
window._hexo_title_pairs.push({zh: ${JSON.stringify(data.title)}, en: ${JSON.stringify(translatedTitle)}});
</script>\n\n`;

                    // 封装内容，注意空行以确保 Markdown 渲染
                    const wrappedContent = `${titleScript}
<div class="hexo-llm-zh">

${data.content}

</div>
<div class="hexo-llm-en">

${translatedContent}

</div>`;

                    // 更新数据并存入缓存
                    await storage.save(data.source, {
                        hash: contentHash,
                        model: model,
                        translatedTitle: translatedTitle,
                        wrappedContent: wrappedContent
                    });

                    data.title = translatedTitle;
                    data.content = wrappedContent;
                    // 记录标题映射用于首页/列表页
                    globalTitlePairs.push({ zh: originalTitle, en: translatedTitle });
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
if (config && config.enable) {
    hexo.extend.injector.register('head_end', `
<style>
    .hexo-llm-zh { display: none; }
    .hexo-llm-en { display: block; }
    html[lang^="zh"] .hexo-llm-en { display: none !important; }
    html[lang^="zh"] .hexo-llm-zh { display: block !important; }
</style>
`, 'default');

    // 注入全局标题映射脚本（在 body 末尾）
    hexo.extend.injector.register('body_end', () => {
        if (globalTitlePairs.length === 0) return '';
        return `<script>window._hexo_title_pairs = ${JSON.stringify(globalTitlePairs)};</script>`;
    }, 'default');

    hexo.extend.injector.register('head_begin', `
<script>
(function() {
    var userLang = navigator.language || navigator.userLanguage;
    if (userLang && userLang.startsWith('zh')) {
        document.documentElement.setAttribute('lang', 'zh-CN');
        window.addEventListener('DOMContentLoaded', function() {
            if (window._zh_title && window._en_title) {
                // 极其精准的探测：直接在当前标题中寻找英文标题并替换为中文
                if (document.title.includes(window._en_title)) {
                    document.title = document.title.replace(window._en_title, window._zh_title);
                } else {
                    // 兜底逻辑：如果主题对标题做了特殊处理（如截断），则直接替换
                    document.title = window._zh_title;
                }
                // 替换文章页面的 h1 标题
                var h1Elements = document.querySelectorAll('h1');
                h1Elements.forEach(function(h1) {
                    if (h1.textContent.trim() === window._en_title.trim()) {
                        h1.textContent = window._zh_title;
                    }
                });
            }
            // 替换首页或列表页中所有带有 data-zh-title 和 data-en-title 属性的标题元素
            var titleElements = document.querySelectorAll('[data-zh-title][data-en-title]');
            titleElements.forEach(function(el) {
                var zhTitle = el.getAttribute('data-zh-title');
                var enTitle = el.getAttribute('data-en-title');
                if (zhTitle && enTitle) {
                    // 替换元素内的文本内容
                    if (el.textContent.trim() === enTitle.trim()) {
                        el.textContent = zhTitle;
                    }
                    // 如果是链接元素，也检查其 title 属性
                    if (el.hasAttribute('title') && el.getAttribute('title').trim() === enTitle.trim()) {
                        el.setAttribute('title', zhTitle);
                    }
                }
            });
            // 替换首页/列表页中的文章标题（使用全局标题映射）
            if (window._hexo_title_pairs && window._hexo_title_pairs.length > 0) {
                // 创建英文到中文的映射
                var titleMap = {};
                window._hexo_title_pairs.forEach(function(pair) {
                    titleMap[pair.en.trim()] = pair.zh;
                });
                // 查找所有可能包含标题的元素（标题、链接等）
                var potentialTitleElements = document.querySelectorAll('h1, h2, h3, a.post-title, a.article-title, .post-title a, .article-title a, .post-title, .article-title, .entry-title, .entry-title a, a[rel="bookmark"], .card-title, .card-title a');
                potentialTitleElements.forEach(function(el) {
                    var text = el.textContent.trim();
                    if (titleMap[text]) {
                        el.textContent = titleMap[text];
                    }
                });
            }
        });
    } else {
        document.documentElement.setAttribute('lang', 'en');
    }
})();
</script>
`, 'default');
}

// 确保在 Hexo 退出时关闭数据库连接
hexo.on('exit', async () => {
    if (storage.close) {
        await storage.close();
    }
});
