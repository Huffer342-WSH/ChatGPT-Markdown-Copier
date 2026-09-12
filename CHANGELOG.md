# Changelog

## 0.3.0 — 2026-09-12

### 新增

- 支持选中回复中的公式并复制为 LaTeX；部分选中时扩展到完整公式，行内使用 `$...$`，块级使用 `$$...$$`。感谢 [@Kemoralocy](https://github.com/Kemoralocy) 的 [PR #1](https://github.com/Huffer342-WSH/ChatGPT-Markdown-Copier/pull/1)。
- 增加公式 DOM 和选区复制回归测试。
- 增加 `pnpm dev:edge` 命令与日常 Edge 浏览器调试说明。
- 正式版本发布后自动上传 Edge Add-ons 程序包并提交审核；预发布版本仅发布到 GitHub。

### 修复

- 兼容新版 ChatGPT 的 `data-math-source` 公式源属性，保留旧版 KaTeX annotation 兼容能力。
- 避免将包含公式的普通正文容器整体识别为块级公式，导致正文丢失。
- Windows 专用构建依赖改为可选依赖，兼容 Ubuntu 发布环境。

### 说明

- 普通文字和可编辑区域保留原生复制行为；公式源码不完整时回退原生复制。
- Edge 自动提审成功不代表已上架，最终上架仍需微软审核。
