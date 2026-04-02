# AGENTS

## 项目背景
- 本项目是一个面向 `https://chatgpt.com/*` 的 Chrome 扩展。
- 核心目标是在 ChatGPT 回复区域提供“复制 Markdown”能力。
- 项目优先关注用户可感知结果，尤其是数学公式、代码块等内容的复制正确性。

## 功能分布
- `entrypoints/`：扩展入口层，负责挂载内容脚本与背景脚本。
- `lib/`：核心复用逻辑，包含 Markdown 处理和内容脚本相关 UI 能力。
- `public/`：扩展静态资源，如图标。
- `docs/architecture.md`：项目架构、模块职责与实现说明。

## 工程约定
- 修改代码后必须执行：`pnpm build`。
- 新增或重写的函数/模块应补充 docstring，并遵循 JSDoc 规范。
- 注释与 docstring 默认使用中文（如无特殊要求）。

## 维护说明
- Agent 在必要时可以主动维护本文件，确保其与项目当前状态一致。
- 具体实现、模块细节和架构说明应优先维护在 `docs/architecture.md`，避免在本文件中堆积过多细节。
