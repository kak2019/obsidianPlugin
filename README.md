# 笔记助手

在 Obsidian 侧边栏里用对话修改当前笔记。提问时先在本机检索库里的 Markdown，再交给小米 MiMo 回答。Embedding 是可选的语义补充。

## 会发送哪些数据

- 提问、当前笔记和检索到的笔记片段会发送到你填写的 **MiMo** 地址。
- 本地全文索引留在本机，不会为此把整库笔记发出去。
- 如果另外建立了 Embedding 索引，笔记片段会发送到你填写的 **Embedding** 地址。
- 问答模式打开 **联网** 后，MiMo 会额外做网页搜索。搜索按次计费（小米文档：国内约 ¥16 / 1000 次，一轮可能按关键词多次计费）。使用前要在 MiMo 控制台开通联网服务插件。
- API Key 只保存在本机插件数据里，不会写进笔记。

## 设置

打开 **Settings → Community plugins → 笔记助手**：

- **MiMo API Key**、**MiMo Base URL**、**对话模型**。默认地址是 `https://api.xiaomimimo.com/v1`。模型可以选 `mimo-v2.6-pro`、`mimo-v2.6-flash`、`mimo-v2.6-pro-ultraspeed`。
- **Embedding API Key**、**Embedding Base URL**、**Embedding 模型名**。这组是可选的。Base URL 填到 `/v1` 为止，不要带 `/embeddings`。
- **检索条数**：每次提问最多带上多少段相关笔记。
- **重建索引**：只在你想用向量补充检索时需要。本地全文检索会在打开插件后自动覆盖库里的 Markdown。

## 使用

1. 点击功能区图标，或运行命令 **打开对话**。
2. **问答**：输入问题。回答会带上本机检索到的相关笔记；打开 **联网** 后还会列出网页来源。回答下面可以 **插入光标处**、**替换选区** 或 **追加到文末**。
3. **修改当前笔记**：先打开要改的笔记，再说明怎么改。确认预览后，点 **覆盖整篇笔记** 才会整篇替换。点 **放弃** 则不改文件。

当前笔记超过约 3 万字时，只会把前 3 万字发给模型。

## 开发

需要 Obsidian 1.7.2 或更高版本，以及 Node.js 18 或更高版本。

```bash
npm install
npm run dev
```

把 `main.js`、`manifest.json` 和 `styles.css` 复制到库的 `.obsidian/plugins/note-assistant/`，然后在 **Settings → Community plugins** 里启用。
