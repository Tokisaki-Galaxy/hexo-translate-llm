# hexo-translate-llm

基于大语言模型（LLM）的 Hexo 自动翻译插件。

## 中文说明

### 特性
- **AI 自动翻译**：使用 LLM（如 DeepSeek）自动将文章翻译为英文。
- **Hash 缓存**：基于内容 Hash 的缓存机制，避免重复翻译，节省 API 消耗。缓存存储在 `node_modules/.cache`。
- **并发控制**：内置队列管理，默认并发数为 2，防止触发 API 频率限制。
- **SEO 优化**：自动注入 `lang` 属性，并根据浏览器语言自动切换中英文显示。
- **高度可定制**：支持自定义 API 端点、模型名称及超时时间。

### 安装
```bash
npm install hexo-translate-llm
```

### 配置
在 Hexo 的 `_config.yml` 中添加：
```yaml
llm_translation:
  enable: true
  model: "deepseek-ai/DeepSeek-V3.2" # 默认模型
  endpoint: "https://api.siliconflow.cn/v1/chat/completions" # API 端点
  single_timeout: 120 # 单篇文章翻译超时时间（秒）
```

在项目根目录创建 `.env` 文件并配置 API Key：
```env
LLM_API_KEY=your_api_key_here
```

### 使用
插件会自动处理所有 `layout: post` 的文章。如果你不想翻译某篇文章，在 Front-matter 中设置：
```yaml
no_translate: true
```

---

## English Description

### Features
- **AI Translation**: Automatically translates Hexo posts to English using LLMs.
- **Hash Caching**: Uses content hashing to prevent redundant API calls. Caches are stored in `node_modules/.cache`.
- **Concurrency Control**: Built-in queue management ([`MAX_CONCURRENCY`](index.js)) to prevent API rate limiting.
- **SEO Friendly**: Injects language attributes and handles display switching via browser language detection.
- **Customizable**: Supports custom API endpoints, models, and timeout settings.

### Installation
```bash
npm install hexo-translate-llm
```

### Configuration
Add the following to your Hexo `_config.yml`:
```yaml
llm_translation:
  enable: true
  model: "deepseek-ai/DeepSeek-V3.2"
  endpoint: "https://api.siliconflow.cn/v1/chat/completions"
  single_timeout: 120
```

Create a `.env` file in your root directory:
```env
LLM_API_KEY=your_api_key_here
```

### Usage
The plugin automatically processes all posts. To skip translation for a specific post, add this to its Front-matter:
```yaml
no_translate: true
```
