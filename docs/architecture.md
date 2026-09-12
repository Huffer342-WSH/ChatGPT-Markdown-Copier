# 架构与实现说明

本扩展面向 ChatGPT 回复，提供整条回复复制、选区 Markdown 复制和行内代码选中功能。源码与扩展资源统一放在 `src/`，测试位于 `tests/`。本文按功能说明行为、实现和代码入口。

## 1. 回复复制按钮

每条助手回复显示“复制回复”和“复制 Markdown”两个按钮。原来的官方按钮被隐藏，但节点和事件处理器仍保留，供扩展调用。

### 挂载与页面更新

内容脚本在 `document_start` 安装选区复制和行内代码交互监听；正文可用后初始化语言、样式和按钮。通过 `MutationObserver` 扫描后续生成的回复，以官方复制按钮为锚点识别助手消息，并用标记防止重复挂载。

代码定位：[content.ts](../src/entrypoints/content.ts) 的 `bootstrapContentScript`、`enhanceExistingButtons`；[message-root.ts](../src/lib/content/message-root.ts) 负责助手消息识别；[markdown-button.ts](../src/lib/content/markdown-button.ts) 和 [tooltip.ts](../src/lib/content/tooltip.ts) 负责按钮状态与提示。

### 原样复制

“复制回复”直接触发隐藏官方按钮的 `click()`，不转换文本。扩展观察官方按钮的 `aria-label` 判断是否显示复制成功，五秒内没有成功反馈则显示失败。此状态来自官方 UI，不是读取剪贴板进行核验。

代码定位：[content.ts](../src/entrypoints/content.ts) 的 `handleOriginalCopy`。

### Markdown 复制

“复制 Markdown”复用官方生成的文本，只修正代码区域外的行内公式分隔符，将符合规则的 `\(...\)` 转为 `$...$`。围栏代码、缩进代码和反引号代码片段跳过转换。

内容脚本运行在隔离环境，不能直接包装页面使用的剪贴板函数，因此通过 DOM 事件请求 MAIN 环境脚本处理：临时包装 `navigator.clipboard.writeText` 和 `write`，触发官方按钮，转换捕获到的纯文本参数，再调用原 API。若官方写入多种格式，只修改 `text/plain`。

包装只存在于官方点击的同步调用栈中，调用返回后立即恢复。剪贴板 Promise 的完成结果通过事件回传给按钮。同一回复的两个按钮共用忙碌锁，避免复制操作重叠。

代码定位：[content.ts](../src/entrypoints/content.ts) 的 `handleMarkdownCopy`；[official-copy.content.ts](../src/entrypoints/official-copy.content.ts) 的 `handleOfficialCopy`；[official-markdown.ts](../src/lib/official-markdown.ts) 的 `normalizeOfficialMarkdown`。

边界：官方若异步发起写入、提前绑定剪贴板函数或改用其他复制方式，Markdown 模式可能无法捕获。整条回复复制不经过 DOM 序列化器。

## 2. 选区 Markdown 复制

用户选中正文并触发复制时，扩展从选区恢复 Markdown。操作只处理克隆的 Range 和 DOM，不改写页面正文，也不改变屏幕上的选区。

流程为：检查单一非空选区及编辑区域 → 判断是否直接复制代码 → 将公式端点扩展到完整公式 → 克隆选区并补回格式祖先 → 分别生成纯文本和 HTML → 在同步 `copy` 事件中写入剪贴板。

成功接管后取消默认复制并阻止后续监听器覆盖结果。未满足接管条件或无法提取必要公式源码时，保留原生复制。普通无格式文字通常不需要扩展处理。

代码定位：[selection-copy.ts](../src/lib/selection-copy.ts) 的 `handleMathSelectionCopy`、`createMathSelectionClipboardPayload` 和 `cloneSelectionWithContext`；[markdown.ts](../src/lib/markdown.ts) 的 `serializeSelectionDomToMarkdown`。函数名中的 Math 是历史命名，当前已包含非公式格式恢复。

### 标题、强调、链接与引用

`Range.cloneContents()` 不保留共同祖先本身，因此会补回选区所在的标题、强调、链接等格式外壳，但不复制祖先的其他正文。随后由 DOM 序列化器输出 Markdown。

代码定位：[selection-copy.ts](../src/lib/selection-copy.ts) 的 `cloneSelectionWithContext`；[markdown.ts](../src/lib/markdown.ts) 的 `serializeNodeAsBlock`、`serializeNodeAsInline`、`serializeBlockquote`。

### 列表

同一列表项内部的文字选区不补外层序号或项目符号；跨列表项或显式选择完整列表结构时保留层级。克隆有序列表时恢复首个选中项的原编号，序列化时按父项标记宽度缩进续行、子列表和代码块。

代码定位：[selection-copy.ts](../src/lib/selection-copy.ts) 的列表项边界判断及 `cloneSelectionWithContext`；[markdown.ts](../src/lib/markdown.ts) 的 `serializeList`、`getOrderedListItemNumbers`。

### 代码

默认开启“代码内复制不带反引号”。当两个选区端点位于同一个 `pre` 或行内 `code` 内时，直接复制 Range 的文字，保留原始空白；HTML 分支使用对应代码元素包裹文字。

关闭设置，或选区跨出代码段时，进入通常的序列化流程，保留 Markdown 代码标记。代码块序列化负责提取正文、识别语言、过滤工具栏节点，并处理已有的 CodeMirror 等 DOM 结构。

代码定位：[selection-copy.ts](../src/lib/selection-copy.ts) 的代码内选区分支；[markdown.ts](../src/lib/markdown.ts) 的 `serializePreBlock`、`serializeInlineCode` 及代码提取辅助函数。

## 3. 公式与 Word 富文本复制

选区只触及公式的一部分时，复制完整公式，不尝试反推任意子表达式。公式源码优先读取 KaTeX 的 `annotation[encoding="application/x-tex"]`，并兼容 `data-math-source` 等源码属性；行内公式输出 `$...$`，块级公式输出 `$$...$$`。

同一次选区复制同时写入 `text/plain` 和 `text/html`：前者是 Markdown，后者用于富文本粘贴。HTML 中的公式用本地 KaTeX 转成独立 Presentation MathML，去掉依赖网页样式的 KaTeX 布局；转换失败则保留可见 LaTeX。粘贴目标及其粘贴选项决定采用哪种格式。

代码定位：[math.ts](../src/lib/math.ts) 的 `findMathCopyBoundary`、`extractLatexFromMathContainer`、`wrapLatexForMarkdown`；[selection-copy.ts](../src/lib/selection-copy.ts) 的 `expandRangeToFormulaBoundaries`、`replaceMathWithLatex`、`serializeFragmentHtml`；[clipboard-math.ts](../src/lib/clipboard-math.ts) 负责富文本公式转换。

用户已反馈 Word 桌面版公式粘贴可用；自动化测试验证转换结构，不能代表所有 Office 版本的实际粘贴效果。上述富文本转换属于选区复制，整条回复按钮仍复用官方输出。

## 4. 表格复制

表格按选区范围决定输出：

| 选区 | 纯文本输出 |
| --- | --- |
| 一个单元格内部 | 单元格文本，不补表格或强调标记 |
| 多个单元格或多行，不含表头 | Markdown 管道行，不虚构表头 |
| 多行且包含真实表头 | 表头、分隔线和数据行 |

无表头管道行不保证被 Markdown 渲染器识别为表格。HTML 分支保留行列结构，添加内联边框、黑字白底，并通过底色和加粗区分表头，供 Word、Excel 等软件使用；Excel 的实际导入效果需手工验证。

代码定位：[selection-copy.ts](../src/lib/selection-copy.ts) 的单元格判断、`serializeCellText`、`styleClipboardTables`；[markdown.ts](../src/lib/markdown.ts) 的 `serializeTable`。

## 5. 单击选中行内代码

默认开启。单击助手回复中的行内代码，使用 `Range.selectNodeContents()` 选中整段文字，不写入剪贴板。用户随后自行复制，复制时是否保留反引号由另一个独立设置决定。

事件委托自动覆盖新增回复。多行代码块、链接、交互控件、编辑区域、修饰键点击、拖动和已有非空选区不会触发全文选择。

代码定位：[inline-code-selection.ts](../src/lib/content/inline-code-selection.ts) 的 `installInlineCodeSelection`；初始化入口为 [content.ts](../src/entrypoints/content.ts)。

## 6. 设置页与工具栏弹窗

两个入口共用同一套 UI：每项一行名称、感叹号说明按钮和开关。点击感叹号展开说明；修改立即保存，成功不显示额外提示，失败显示错误信息。

| 设置键 | 默认值 | 作用 |
| --- | --- | --- |
| `selectInlineCodeOnClick` | 开启 | 单击行内代码选中全文 |
| `copyCodeWithoutMarkers` | 开启 | 同一代码段内复制省略反引号或围栏 |

设置使用 `chrome.storage.local` 保存在本机，通过 `storage.onChanged` 同步到已打开的页面。订阅先于初始读取，并通过修订计数避免旧读取结果覆盖新变更；删除设置恢复默认开启。

代码定位：[popup.html](../src/entrypoints/popup.html)、[options.html](../src/entrypoints/options.html) 为入口；[page.ts](../src/lib/settings/page.ts) 和 [page.css](../src/lib/settings/page.css) 为共用界面；[storage.ts](../src/lib/settings/storage.ts) 管理键名及订阅。

## 7. 语言与静态资源

回复按钮的文案由 i18next 加载，跟随 ChatGPT 页面的 `html lang`，语言变化后刷新按钮。浏览器扩展名称、描述使用浏览器要求的 `_locales` 目录。设置页目前按 `navigator.language` 选择内部的中英文文案，尚未合并到上述语言资源。

代码定位：[web-i18n.ts](../src/lib/web-i18n.ts)、[页面语言资源](../src/locales/web/)、[扩展语言资源](../src/public/_locales/)、[设置页文案](../src/lib/settings/page.ts)。[i18n.ts](../src/lib/i18n.ts) 保留浏览器文案读取封装。

扩展母图标位于 [src/assets/icon.png](../src/assets/icon.png)，构建时生成各尺寸图标；回复按钮图标位于 [md-copy-icons.svg](../src/lib/content/md-copy-icons.svg)。根目录 `assets/` 存放说明文档使用的截图与演示视频。

## 8. 构建、测试与发布

[WXT 配置](../wxt.config.ts) 设置 `srcDir: 'src'`、`publicDir: 'src/public'`，自动发现入口并复制静态资源。权限包括 `clipboardWrite` 和 `storage`，目标站点为 `https://chatgpt.com/*`。后台入口目前没有业务逻辑。

构建插件将 JavaScript 产物中的 Unicode 非字符转为转义形式，避免扩展加载时出现“不是 UTF-8 编码格式”的错误。

| 命令 | 产物目录 |
| --- | --- |
| `pnpm build` | `.output/chrome-mv3` |
| `pnpm build:edge` | `.output/edge-mv3` |
| `pnpm build:edge:dev` | `.output/edge-mv3-dev` |

应更新浏览器实际加载的目录，再重新加载扩展并刷新页面。持续开发服务与单次构建不要同时写入同一个输出目录。

测试结构、运行命令和覆盖边界见 [测试说明](../tests/README.md)。Vitest 测试主要在本地 DOM 环境验证转换及交互，不替代真实网页、系统剪贴板或 Office 粘贴检查。

发布流程按标签构建、测试和生成 GitHub Release；稳定版继续上传 Edge 包并创建提审。提审成功不等于已上架。代码定位：[工作流目录](../.github/workflows/)、[publish-edge.mjs](../scripts/publish-edge.mjs)；操作说明见 [Edge 发布文档](edge-publishing.md)。

## 排查入口

| 现象 | 优先检查 |
| --- | --- |
| 回复按钮缺失或重复 | 挂载扫描、官方按钮选择器、助手识别 |
| 原样复制正常，Markdown 按钮失败 | MAIN 桥接与官方剪贴板调用时机 |
| 选区多复制内容或丢失格式 | Range 边界、祖先补壳、对应 DOM 序列化规则 |
| 公式 Markdown 正常，Word 异常 | HTML 剪贴板、MathML 转换及目标软件粘贴方式 |
| 设置保存后不生效 | 本机设置订阅、实际加载目录及页面是否已更新内容脚本 |

修改功能时同步维护对应小节及代码链接；验证记录和版本变更分别放在测试说明、CHANGELOG 中，避免本文变成历史操作记录。
