# 架构与实现说明

## 项目概览

本项目是一个面向 `https://chatgpt.com/*` 的 Chrome 扩展。
它在 ChatGPT 官方回复操作区旁追加一个“复制 Markdown”按钮，用于将 assistant 回复内容复制为更适合二次使用的 Markdown 文本。

当前实现选择了一个非常直接的路线：

- 不调用 ChatGPT 私有接口
- 不依赖页面外部服务
- 直接从当前页面 DOM 读取内容并序列化为 Markdown

这样做的优点是实现简单、可控、依赖少；代价是需要持续适配 ChatGPT DOM 结构变化。

## 设计目标

项目当前优先级如下：

1. 复制结果正确
2. 数学公式和代码块不失真
3. 按钮注入稳定，不错位、不重复
4. 结构简单，便于随 ChatGPT UI 变化持续维护

这意味着在实现取舍上，项目更偏向“稳定可维护”，而不是“抽象最完美”。

## 目录结构

```text
entrypoints/
  content.ts              # 内容脚本入口：观察 DOM、注入按钮、触发复制流程
  background.ts           # 背景脚本入口：当前仅保留最小壳层

lib/
  markdown.ts             # DOM -> Markdown 序列化核心
  i18n.ts                 # 扩展壳层 i18n 读取封装（chrome.i18n）
  web-i18n.ts             # 页面注入文案 i18n（i18next + html lang）
  content/
    markdown-button.ts    # Markdown 按钮创建、状态管理、样式注入
    tooltip.ts            # tooltip 挂载、定位、销毁与文案刷新
    message-root.ts       # assistant 消息根节点定位与调试日志

src/
  locales/web/
    en.json               # 页面注入文案（英文）
    zh_CN.json            # 页面注入文案（简体中文）

public/
  md-copy-main.svg        # 按钮默认图标
  md-copy-check.svg       # 按钮成功态图标
  _locales/
    en/messages.json      # 扩展壳层文案（英文）
    zh_CN/messages.json   # 扩展壳层文案（简体中文）

assets/
  icon.png                # 扩展母图标（由 @wxt-dev/auto-icons 自动生成多尺寸图标）

docs/
  architecture.md         # 当前文档
```

## 模块职责

### `entrypoints/content.ts`

内容脚本主入口，负责把各模块串起来。

主要职责：

- 在 `document_idle` 时机注入
- 安装按钮样式
- 通过 `MutationObserver` 监听 ChatGPT SPA 页面变化
- 扫描官方复制按钮，并在 assistant 回复中追加 Markdown 按钮
- 处理点击事件，执行“定位消息 -> 序列化 -> 写入剪贴板 -> 更新状态”的主流程

这是编排层，不应堆积过多具体序列化规则或复杂 DOM 细节。

### `lib/content/message-root.ts`

负责从“官方复制按钮”反查到当前 assistant 消息的根节点。

它同时承担两类职责：

- 正常路径下的消息根节点定位
- 选择器失效时的调试日志输出

当前实现不是只依赖一个选择器，而是按多个结构线索回退匹配。这是适配 ChatGPT UI 变化的重要缓冲层。

### `lib/markdown.ts`

项目的核心业务模块，负责把 ChatGPT 消息 DOM 序列化为 Markdown。

当前支持的重点结构包括：

- 段落
- 标题
- 无序 / 有序列表
- 引用块
- 代码块
- 表格
- 链接
- 行内代码
- 行内公式与块级公式

这部分是最容易因修复一个场景而影响另一个场景的模块，后续修改需要格外关注回归风险。

### `lib/content/markdown-button.ts`

负责 Markdown 按钮自身的 UI 行为。

当前覆盖：

- 按钮节点创建
- 图标挂载
- 状态切换
- 样式注入

按钮状态目前分为：

- `idle`
- `loading`
- `success`
- `error`

### `lib/content/tooltip.ts`

负责 tooltip 的显示、隐藏、重定位和文案同步。

当前实现是一个轻量级 DOM tooltip，而不是依赖外部 UI 库。这样做是为了降低体积和维护成本，同时尽量贴近 ChatGPT 原生交互。

### `lib/i18n.ts`

负责扩展壳层（浏览器侧）文案读取：

- 调用 `chrome.i18n.getMessage`
- 用于 `manifest` 与未来扩展页（popup/options）文案场景

### `lib/web-i18n.ts`

负责页面注入文案读取（与浏览器语言解耦）：

- 使用 `i18next` 加载 `src/locales/web/*.json`
- 从 `html[lang]` 解析语言，并强制 `changeLanguage(...)`
- 当前映射规则：`zh-* => zh_CN`，其余回退 `en`
- 支持监听 `html lang` 变化后实时刷新已注入按钮文案

### `entrypoints/background.ts`

当前没有核心业务逻辑，只保留最小背景脚本壳层，便于扩展能力时继续演进。

## 核心流程

一次完整复制流程如下：

1. 内容脚本在 `chatgpt.com` 页面注入
2. 扫描官方复制按钮
3. 识别哪些按钮属于 assistant 回复
4. 在按钮旁插入 Markdown 按钮
5. 用户点击 Markdown 按钮
6. 从按钮位置反查当前消息根节点
7. 从消息 DOM 中提取正文区域
8. 将 DOM 序列化为 Markdown
9. 写入系统剪贴板
10. 更新按钮状态，并通过 tooltip / 图标反馈结果

其中最关键的两个步骤是：

- 正确定位当前 assistant 消息
- 正确将 DOM 转换为 Markdown

## DOM 适配策略

由于 ChatGPT 是 SPA，且页面结构会持续演化，当前实现采用以下策略：

- 使用 `MutationObserver` 监听页面变化，而不是只在首次加载时扫描
- 以官方复制按钮为锚点进行增强，而不是自行寻找整条消息挂载点
- assistant 识别和消息根节点定位使用多条回退路径，而不是绑定单一 DOM 结构
- 定位失败时输出调试日志，帮助后续快速修复选择器失效

当前会用到的关键 DOM 线索包括：

- `button[data-testid="copy-turn-action-button"]`
- `section[data-turn="assistant"]`
- `[data-message-author-role="assistant"]`
- `.markdown.prose`
- `article`
- `.agent-turn`
- `div.group`

这些选择器不是稳定协议，只是当前版本下的经验路径。后续如果 ChatGPT UI 变化，优先考虑增加兼容分支，而不是立即替换掉旧逻辑。

## Markdown 序列化策略

当前序列化器的原则是“尽量使用页面真实渲染结构中的可信信息”。

### 正文区域提取

序列化前会先尝试定位正文区域，避免把按钮、工具栏等 UI 区域带入结果。

当前优先顺序大致是：

1. `.markdown.prose`
2. `article` 内的 `.markdown.prose`
3. `article`
4. 整个消息根节点

### 数学公式

数学公式是当前最重要的兼容场景。

实现原则：

- 不直接信任屏幕上可见文本
- 优先从 KaTeX 的 `annotation[encoding="application/x-tex"]` 中读取 LaTeX 真值
- 行内公式输出为 `$...$`
- 块级公式输出为 `$$ ... $$`

这样可以避免复制结果丢失公式界定符，或把渲染后的视觉文本错误当作源文本。

### 代码块

代码块是第二优先级场景。

当前实现重点处理了以下问题：

- 尽量保留原始换行
- 尽量识别 fenced code block 的语言标签
- 优先从 ChatGPT 当前代码块结构中恢复代码正文
- 过滤代码块内部的按钮、图标等 UI 节点
- 避免语言标签被错误拼入代码正文开头

由于 ChatGPT 代码块结构可能随编辑器实现调整而变化，这部分后续需要持续关注。

### 其他结构

当前还支持常见 Markdown 结构的基础转换：

- 标题
- 列表
- 引用块
- 表格
- 链接
- 行内代码

表格目前按 GFM 形式输出。

## 扩展配置

项目使用 WXT 构建。

当前关键配置位于 [`wxt.config.ts`](../wxt.config.ts)：

- `default_locale`: `en`
- `name`: `__MSG_extName__`
- `description`: `__MSG_extDescription__`
- `host_permissions`: `https://chatgpt.com/*`
- `permissions`: `clipboardWrite`
- `web_accessible_resources`: 暴露 `md-copy-main.svg` 与 `md-copy-check.svg`

图标资源由内容脚本通过 `chrome.runtime.getURL(...)` 获取，因此资源路径和配置需保持同步。

## 当前已知边界

当前实现有一些明确边界：

- 主要面向 assistant 回复，不处理 user 消息
- 依赖 ChatGPT 当前 DOM 结构，不保证对历史或实验性 UI 100% 通用
- 复制逻辑完全基于 DOM，因此结果质量受页面实际渲染结构影响
- 尚未建立自动化回归测试，当前验证仍以手工检查和构建通过为主

## 后续维护建议

### 当按钮不显示时

优先检查：

- 官方复制按钮选择器是否变化
- assistant 消息结构是否变化
- `MutationObserver` 是否仍能覆盖页面更新场景

### 当复制结果错误时

优先判断问题属于哪一层：

- 消息根节点找错了
- 正文区域提取不对
- 某类 DOM 结构的序列化规则失效
- ChatGPT 渲染结构发生变化

### 当准备改动序列化器时

建议至少回归以下内容：

- 行内公式
- 块级公式
- 带语言标记的代码块
- 表格
- 链接
- 列表
- 引用块

## 文档维护约定

如果以下内容发生变化，应同步更新本文件：

- 模块职责调整
- 核心复制流程变化
- DOM 适配策略变化
- 构建配置或权限变化
- 明确新增的重要边界或风险点

本文档的目标不是记录每一行实现细节，而是帮助维护者快速理解：

- 这个项目现在是怎么工作的
- 哪些模块最关键
- 后续问题最可能出在哪
- 改动时应该优先注意什么
