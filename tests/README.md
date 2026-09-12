# 测试与持续测试

所有自动化测试集中在 `tests/`。离线单元测试由根目录 `vitest.config.ts` 收集；真实 ChatGPT 浏览器测试由 `playwright.config.ts` 独立收集，运行方式与边界见 [e2e/README.md](e2e/README.md)。

```powershell
pnpm test        # 单次运行
pnpm test:watch  # 监听依赖文件变化并重跑相关测试；按 q 退出
pnpm test:ci     # CI 单次执行，失败返回非零退出码
pnpm compile    # 检查生产代码与测试的 TypeScript 类型
```

使用 threads 池，避免受限 Windows 环境无法创建 forks 子进程。GitHub Actions 的 `test.yml` 在分支推送、PR 和手动触发时运行 Windows / Linux 检查，无需账号凭证，不发布扩展。

## 当前覆盖

| 文件 | 项数 | 验证范围 | 价值与边界 |
| --- | ---: | --- | --- |
| `selection-copy.test.ts` | 9 | 选区扩展、公式源属性、文字顺序、原生回退、编辑区域、双 MIME 写入 | 仍在使用的功能；使用最小 DOM，不能证明视觉拖选或系统剪贴板正确 |
| `markdown.test.ts` | 4 | annotation、矩阵和源码属性的 DOM 序列化 | 选区复制复用的模块回归；不覆盖整条回复按钮主流程 |
| `selection-list.test.ts` | 14 | 完整/局部/跨项/反向选择，起始编号、倒序、显式编号、代码与公式、原生回退 | Edge 精简样本与明确区分的合成边界样本；统一验证正文和选区不变 |
| `selection-structure.test.ts` | 8 | 列表块顺序和代码、单元格/数据行/表头、同次复制的双 MIME 及表格边框样式 | 验证剪贴板数据及结构，不证明 Word/Excel 实际粘贴效果 |
| `clipboard-math.test.ts` | 9 | 页面中的八类公式生成独立 MathML、转换失败保留源码、Markdown 不变 | 使用实际 KaTeX 转换器，不模拟 Office 导入 |
| `official-markdown.test.ts` | 10 | 多个行内公式、反引号代码、不同围栏、缩进代码、CRLF、原有公式、不完整分隔符 | 直接断言输入与完整输出；已发现并固定嵌套开头造成的错误配对 |
| `official-copy.test.ts` | 6 | 写入内容、Promise 成功与拒绝、方法恢复、无写入及非目标按钮 | 运行真实桥接代码，模拟剪贴板；不证明 MAIN / ISOLATED 跨环境通信 |
| `content.test.ts` | 4 | 原样复制不依赖桥接、超时不移除按钮、执行锁、重复点击反馈计时 | 运行真实挂载和点击代码，模拟官方按钮及本地化；保护已发生过的回归 |

这些测试验证用户行为和输出约束，不以覆盖率数字或快照数量作为完成标准。

## 已验证及仍需真实浏览器验证的范围

- 本地 64 项通过；监听模式已验证修改测试文件时间戳后自动重跑对应的 10 项并通过。真实样本来源及精简规则见 [fixtures/README.md](fixtures/README.md)。
- 临时撤掉“同一列表项停止补壳”的判断，5 项测试按预期失败；恢复后全量通过，确认这些测试能够检测该回归。
- 真实 Edge 已验证原样复制、重复点击、Markdown 成功反馈、超时窗口后按钮仍存在，未发现扩展错误日志。
- 用户已确认：更新 Edge 实际加载的开发目录后，Word 桌面版公式粘贴问题已修复；这是用户实测反馈，不是自动化 Office 验证。
- 系统剪贴板正文未独立核验；应在本地文本编辑器对照原样与 Markdown 输出，确认公式转换且代码、矩阵不失真。不要将 jsdom 结果称为此项验证。
- `ClipboardItem` 富文本分支、跨执行环境和官方异步实现变化仍有覆盖空缺。应优先取得真实浏览器样本再补充相应测试，避免把模拟平台行为当作兼容性证据。
- CI 已配置，尚未在 GitHub 远端运行；本地 Windows 通过不代表 Linux 已通过。

新增测试应能说明要阻止的具体错误、固定输入和预期结果，或对应一个已复现的回归。只验证 mock 被调用、复制生产算法作为期望值、整页 HTML 快照均不作为新增目标。
