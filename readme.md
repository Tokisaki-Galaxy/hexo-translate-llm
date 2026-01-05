<p align="center">
  <a href="https://www.npmjs.com/package/hexo-translate-llm">
    <img src="https://img.shields.io/badge/Hexo-Translate--LLM-blue?style=for-the-badge&logo=hexo" alt="Hexo Translate LLM">
  </a>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/hexo-translate-llm"><img src="https://img.shields.io/npm/v/hexo-translate-llm?style=flat-square&color=CB3837&logo=npm" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/hexo-translate-llm"><img src="https://img.shields.io/npm/dm/hexo-translate-llm?style=flat-square&color=orange" alt="npm downloads"></a>
  <a href="https://github.com/Tokisaki-Galaxy/hexo-translate-llm"><img src="https://img.shields.io/github/stars/Tokisaki-Galaxy/hexo-translate-llm?style=flat-square&logo=github" alt="github stars"></a>
  <img src="https://img.shields.io/badge/license-Apache--2.0-blue?style=flat-square" alt="license">
  <img src="https://img.shields.io/badge/LLM-DeepSeek-green?style=flat-square" alt="LLM">
</p>

<p align="center">
  <a href="#hexo-llm-translate-插件">中文文档</a> | <a href="#hexo-llm-translate-plugin">English</a>
</p>

# Hexo LLM Translate Plugin

An AI-powered translation plugin for Hexo blog posts. It automatically switches between Chinese and English versions based on the user's language, ensuring stability through caching and concurrency control.

**Demo**: [https://tokisaki.top](https://tokisaki.top)

## 🚀 Features
- **Content Hash Caching**: Avoids redundant requests by hitting the cache for identical content (supports local and Neon PostgreSQL remote sync).
- **Custom Models & Endpoints**: Configurable `model` and `endpoint`, supporting DeepSeek and other mainstream LLMs.
- **Concurrency Control**: Built-in rate limiter to prevent API throttling.
- **Automatic Retry**: Automatically backs off and retries on failed requests to improve success rates.
- **SEO & Display Optimization**: Injects both Chinese and English content, automatically switching based on browser language.
- **Hexo Tag Safety**: Automatically handles `{% %}` tags to prevent translation from breaking Hexo rendering.
- **Title Synchronization**: Automatically switches the page `title`, `<h1>` article headers, and homepage/listing page titles based on the user's language.

## 📦 Installation
```bash
npm install hexo-translate-llm
```
NPM: [https://www.npmjs.com/package/hexo-translate-llm](https://www.npmjs.com/package/hexo-translate-llm)

## ⚙️ Configuration
Add the following to your Hexo root `_config.yml`:
```yaml
llm_translation:
  enable: true
  model: deepseek-ai/DeepSeek-V3.2   # Optional, default as shown
  endpoint: https://api.siliconflow.cn/v1/chat/completions # Optional
  max_concurrency: 2                 # Max concurrent requests
  single_timeout: 120                # Timeout per request (seconds)
```

Set environment variables (recommended using `.env`):
```bash
LLM_API_KEY=your_api_key
# Optional: Enable remote DB sync for cache
# DATABASE_URL=postgres://...
```

## 📖 Usage
- **Auto Translation**: Once enabled, posts with `layout: post` will be translated unless `no_translate: true` is set.
- **Smart Refresh**: Re-calculates hash and refreshes cache when content (including title) changes.
- **Cache Management**: Cache files are stored in `node_modules/.cache/ai-translate-cache.json` by default.

## 🛠️ Workflow
1. **Trigger**: `before_post_render` filter is triggered before Hexo rendering.
2. **Validation**: Calculates content hash; uses cache if it matches.
3. **Translation**: Calls API via rate limiter with timeout and retry logic.
4. **Injection**: Wraps results in dual-language versions and injects switching scripts/styles.
5. **Persistence**: Automatically saves cache on exit.

## ❓ FAQ
- **API Key Missing**: If `LLM_API_KEY` is not set, the plugin skips translation with a warning.
- **Rate Limited**: Lower `max_concurrency` or increase timeout.
- **Title Mismatch**: If the theme modifies the title, the plugin falls back to overwriting the Chinese title.

## 📄 License
Apache 2.0

---

# Hexo LLM Translate 插件

<p align="right"><a href="#hexo-llm-translate-plugin">English</a></p>

AI 自动翻译 Hexo 博文的插件，按语言自动切换显示中/英双版本，并通过缓存与并发控制提升稳定性。

**示例网站**: [https://tokisaki.top](https://tokisaki.top)

## 🚀 特性
- **内容哈希缓存**：避免重复请求，相同内容直接命中缓存（支持本地与 Neon PostgreSQL 远程同步）。
- **自定义模型与端点**：可配置 `model` 与 `endpoint`，默认支持 `DeepSeek` 等主流 LLM。
- **并发队列控制**：内置限流器，防止 API 并发超限导致熔断。
- **自动重试机制**：请求失败自动退避重试，提升翻译成功率。
- **SEO/展示优化**：注入中英双份内容，并根据浏览器语言自动切换显示。
- **Hexo 标签安全**：自动处理 `{% %}` 标签，防止翻译过程破坏 Hexo 渲染。
- **标题同步**：自动根据用户语言切换页面 `title`、文章页面的 `<h1>` 标题，以及首页/列表页的文章标题。

## 📦 安装
```bash
npm install hexo-translate-llm
```
NPM 地址：[https://www.npmjs.com/package/hexo-translate-llm](https://www.npmjs.com/package/hexo-translate-llm)

## ⚙️ 配置
在 Hexo 根目录的 `_config.yml` 增加：
```yaml
llm_translation:
  enable: true
  model: deepseek-ai/DeepSeek-V3.2   # 可选，默认如左
  endpoint: https://api.siliconflow.cn/v1/chat/completions # 可选
  max_concurrency: 2                 # 并发上限
  single_timeout: 120                # 单次请求超时时间（秒）
```

设置环境变量（建议使用 `.env`）：
```bash
LLM_API_KEY=你的密钥
# 可选：启用远程数据库同步缓存
# DATABASE_URL=postgres://...
```

## 📖 使用
- **自动翻译**：启用后，对 `layout: post` 且未设置 `no_translate: true` 的文章自动翻译。
- **智能刷新**：当内容（含标题）变化时，会重新计算哈希并刷新缓存。
- **缓存管理**：缓存文件默认存储于 `node_modules/.cache/ai-translate-cache.json`。

## 🛠️ 工作流程
1. **触发**：Hexo 渲染前触发 `before_post_render` 过滤器。
2. **校验**：计算内容哈希，命中缓存则直接复用。
3. **翻译**：通过限流器调用 API，并负责超时与重试。
4. **注入**：将翻译结果封装为中英双版本，注入切换脚本与样式。
5. **持久化**：退出时自动保存缓存。

## ❓ 常见问题
- **找不到密钥**：未设置 `LLM_API_KEY` 时插件会跳过翻译并提示警告。
- **并发/速率受限**：调低 `max_concurrency` 或提升超时时间。
- **标题不匹配**：主题若修改了 title，插件会回退为直接覆盖中文标题。

## 📄 许可证
Apache 2.0
