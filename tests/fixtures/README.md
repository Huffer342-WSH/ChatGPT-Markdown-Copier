# 真实 DOM 样本

`structured-list.html` 提取自用户指定的 Edge ChatGPT 页面中“结构化文本”标题及其后列表（2026-09-12）。保留真实的 `ol/li/p/ul` 层级、换行、强调与代码标签；移除 `data-start`、`data-end`、`data-section-id` 等与复制无关的属性，外加本地测试所需的正文容器。

不保存整页 HTML、会话 URL、消息 ID、侧栏或账号信息。`structured-list.md` 是人工指定的期望输出，并非用被测序列化器生成。

`selection-list.test.ts` 通过 jsdom 的 Range 调用实际选区复制入口，验证完整列表和局部列表项；这是真实 DOM 样本的离线回归，不是系统剪贴板或浏览器指针选区测试。
