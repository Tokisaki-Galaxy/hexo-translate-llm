/**
 * AI 自动翻译插件
 * feat: hash 缓存，避免重复翻译
 * feat: 支持自定义模型和端点
 * feat: 优化SEO
 * feat: 串行排队，防止 API 并发超限
 */

const crypto = require('crypto');
const Storage = require('./lib/storage');
const { createConcurrencyLimiter } = require('./lib/concurrency');
const { translateContent, wrapContent } = require('./lib/translator');
const { registerInjectors } = require('./lib/injector');

try { require('dotenv').config(); } catch (e) {}
const config = hexo.config.llm_translation;
const API_KEY = process.env.LLM_API_KEY;

const storage = new Storage(hexo);
let loadPromise = null;

if (config && config.enable && !API_KEY) {
    hexo.log.warn('[AI Translate] LLM_API_KEY is missing. Translation will be skipped.');
}

// --- 并发控制 ---
const runWithLimit = createConcurrencyLimiter((config && config.max_concurrency) || 2);

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

        // 兼容性补全：如果旧缓存没有 originalTitle，则补全它并同步到存储
        if (!cached.originalTitle) {
            cached.originalTitle = originalTitle;
            // 异步保存，不阻塞当前渲染流程
            storage.save(data.source, cached).catch(err => {
                hexo.log.error(`[AI Translate] Failed to update legacy cache for ${data.source}: ${err.message}`);
            });
        }
        return data;
    }

    // --- 并发控制 ---
    return runWithLimit(async () => {
        const endpoint = config.endpoint || 'https://api.siliconflow.cn/v1/chat/completions';

        try {
            const originalTitle = data.title;
            const result = await translateContent({
                title: data.title,
                content: data.content,
                apiKey: API_KEY,
                endpoint,
                model,
                timeout: (config.single_timeout || 120) * 1000
            });

            if (result) {
                const { translatedTitle, translatedContent } = result;
                const wrappedContent = wrapContent(
                    data.content,
                    translatedContent,
                    originalTitle,
                    translatedTitle
                );

                // 更新数据并存入缓存
                await storage.save(data.source, {
                    hash: contentHash,
                    model: model,
                    originalTitle: originalTitle,
                    translatedTitle: translatedTitle,
                    wrappedContent: wrappedContent
                });

                data.title = translatedTitle;
                data.content = wrappedContent;
                // 记录标题映射用于首页/列表页
                globalTitlePairs.push({ zh: originalTitle, en: translatedTitle });
                hexo.log.info(`[AI Translate] Success: ${data.title}`);
            }
        } catch (error) {
            hexo.log.error(`[AI Translate] Skip "${data.title}": ${error.message}`);
        }
        return data; // 无论成功失败，必须返回 data，防止 Hexo 报错
    });
});

// 注入 CSS 和 JS
if (config && config.enable) {
    registerInjectors(hexo, globalTitlePairs, storage);
}

// 确保在 Hexo 退出时关闭数据库连接
hexo.on('exit', async () => {
    if (storage.close) {
        await storage.close();
    }
});
