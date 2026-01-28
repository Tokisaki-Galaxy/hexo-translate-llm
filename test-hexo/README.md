# 测试 Hexo 环境

这是一个用于测试 `hexo-translate-llm` 插件的最小 Hexo 博客环境。

## 使用方法

### 1. 安装依赖

```bash
cd test-hexo
npm install
```

### 2. 启动开发服务器

```bash
npm run server
# 或者使用 debug 模式
npm run dev
```

访问 http://localhost:4000 查看博客。

### 3. 测试翻译功能

1. 在项目根目录创建 `.env` 文件，添加 API 密钥：
   ```
   LLM_API_KEY=your_api_key_here
   ```

2. 修改 `_config.yml` 中的 `llm_translation.enable` 为 `true`

3. 重新生成博客：
   ```bash
   npm run clean
   npm run build
   ```

### 4. 构建静态文件

```bash
npm run build
```

生成的文件在 `public` 目录中。

## 测试文章

目前包含 3 篇中文测试文章：

1. **探索人工智能的未来发展趋势** - 关于 AI 技术发展
2. **健康饮食的重要性与实践建议** - 关于健康生活方式
3. **远程工作的优势与挑战分析** - 关于远程办公模式

## 注意事项

- 此测试环境不会被打包进 npm 发布包中
- `node_modules/`、`public/`、`db.json` 等生成文件已被 `.gitignore` 忽略
- 插件通过 `file:..` 链接到父目录，修改插件代码后重启服务器即可生效
