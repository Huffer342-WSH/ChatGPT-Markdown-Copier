# 架构与实现说明

## 项目结构

```text
entrypoints/
  content.ts              # 内容脚本入口：观察 DOM、注入按钮、触发复制流程
  background.ts           # 背景脚本（当前无核心逻辑）

lib/
  markdown.ts             # DOM -> Markdown 序列化核心
  content/
    markdown-button.ts    # 按钮创建、状态管理、样式注入
    tooltip.ts            # tooltip 挂载/定位/销毁
    message-root.ts       # assistant 消息根节点定位与调试日志

public/
  md-copy-main.svg        # 默认图标
  md-copy-check.svg       # 成功勾选图标
  icon/*                  # 扩展图标
```

## 实现说明

- 内容脚本在 `document_idle` 注入
- 使用 `MutationObserver` 处理 ChatGPT SPA 场景
- 仅为 assistant turn 的官方复制按钮追加 Markdown 按钮
- 复制逻辑为 DOM-only：直接将消息 DOM 序列化为 Markdown
- 数学公式以 KaTeX annotation (`annotation[encoding="application/x-tex"]`) 为真值源
- 图标资源通过 `chrome.runtime.getURL(...)` 获取，并在 `wxt.config.ts` 中通过 `web_accessible_resources` 暴露
