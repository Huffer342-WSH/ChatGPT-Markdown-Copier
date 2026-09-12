# 真实 ChatGPT 兼容性检查

使用 Playwright 自带 Chromium 加载 `.output/chrome-mv3`，访问固定公开分享页，操作真实复制事件并读取剪贴板。没有替换官方函数、伪造 copy 事件或导入生产转换算法作为预期。

## Windows 开发

```powershell
pnpm install --frozen-lockfile
$env:HTTPS_PROXY = 'http://127.0.0.1:7890' # 浏览器下载需要代理时设置
pnpm exec playwright install chromium
pnpm exec wxt build                     # 测试前生成当前版本扩展，修改源码后重新生成
$env:E2E_PROXY = 'http://127.0.0.1:7890' # Chromium 访问代理，不写死在 CI
pnpm test:e2e
```

默认无头运行；可设置 `$env:E2E_HEADED = '1'` 打开可见浏览器调试。每次使用临时浏览器资料目录，结束后删除，不读取个人账号或登录凭据。测试会写入系统剪贴板，运行期间不要并行复制其他内容。

## Ubuntu 验证

独立安装 Linux 依赖，不复用 Windows 的 node_modules：

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install --with-deps chromium
pnpm exec wxt build
pnpm test:e2e
```

必要时通过 `E2E_PROXY` 指定容器可达的代理地址；容器中的 127.0.0.1 不代表 Windows 主机。

### 项目专属 WSLC 容器

本机保留 `chatgpt-copy-validation`，使用 Ubuntu 24.04、Node 24.21.0、pnpm 10.14.0。源码和独立 Linux 依赖位于 `/workspace`，Chromium 缓存位于 `/root/.cache/ms-playwright`。容器通过 WSLC 会话内的 Docker 创建，没有使用 `--rm`。

```powershell
wslc system session run docker start chatgpt-copy-validation
wslc system session run docker exec -it chatgpt-copy-validation bash
# 不进入交互 shell 也可以重跑：
wslc system session run docker exec chatgpt-copy-validation pnpm test:e2e
```

本机 `wslc run` 创建流程曾超时，因此使用 `wslc system session run docker …` 管理这个容器。通过自动化终端调用 session run 时需要分配 TTY，否则可能返回 `ERROR_INVALID_HANDLE`。

WSLC 会话中的 `/etc/docker/daemon.json` 已配置 HTTP/HTTPS 代理 `http://127.0.0.1:7890`，保留 `features.cdi=true` 和 `no-proxy=localhost,127.0.0.1`。这只控制 Docker 拉取镜像；容器另设 `HTTP_PROXY`、`HTTPS_PROXY`、小写同名变量和 `E2E_PROXY`。本机桥接网络无法连接宿主代理，此专属容器使用 Docker host 网络，因此容器可以访问会话的 `127.0.0.1:7890`。这一设置不复制到 GitHub Actions。

Windows 目录挂载未成功，当前 `/workspace` 是源码归档副本，不会自动同步。重测新改动前需同步 `src/`、`tests/`、package.json、pnpm-lock.yaml、pnpm-workspace.yaml，以及 TypeScript、WXT、Vitest、Playwright 配置，再安装依赖并重新构建；不要复制 Windows 的 node_modules、个人 web-ext.config.ts 或浏览器登录目录。浏览器报告保存在容器的 `/workspace/playwright-report/`。

2026-09-13 已在该容器实测：Linux 独立构建、类型检查、64 项单元测试全部通过；Chromium 153.0.8010.12 / Playwright 1.63.0 无头运行真实分享页，30 个选区场景和两个复制按钮全部通过（10.9 秒）。未发现需要修改代码的跨平台差异。运行日志保留在 `/workspace/e2e-run.log`，安装日志为 `/workspace/browser-install.log`。本机通过代理访问成功不代表 GitHub 托管 runner 的网络也可访问。

## 覆盖和固定预期

样本：https://chatgpt.com/share/6aa56484-1d54-83ec-bde8-5e74912ac85b

`expected/reply-original.md` 和 `reply-markdown.md` 来自 2026-09-13 Windows 无头浏览器真实复制结果，已经逐段核对标题、列表、公式、表格及代码。测试读取固定文件，不自动更新预期，也不以两个按钮互相一致作为通过条件。只统一 CRLF/LF，保留空格和缩进。

一个串行场景包含按钮注入、两个完整回复按钮，以及 30 个选区检查：标题、列表内文字、跨嵌套编号、强调、行内代码、代码块、局部公式、单元格、无表头数据行、带表头表格。选区使用 Range 精确定位，再通过真实 Ctrl+C 触发复制；同时检查选区和原节点没有变化。公式及表格还检查 HTML 中的 MathML、边框属性和表头。

按钮通过真实 Enter 键激活。分享页底部输入浮层可能遮挡鼠标，因此此测试不证明鼠标点击的可达性。未覆盖鼠标拖选、登录后的会话、Word/Excel 实际粘贴和所有公式种类的局部选取。当前选区表格不保留列对齐；整条回复复制保留官方结果中的对齐标记。样本没有链接，链接行为仍由本地测试覆盖。

## 失败诊断与周期运行

2026-09-13 补充 12 个真实选区场景：加粗中间子串、反向嵌套列表、完整第二编号项、编号项局部文字、行内代码子串、代码第二行、加粗引用、删除线子串、局部根式、公式单元格、单行数据和单个表头。字符偏移跨文本节点定位，不假设代码高亮只有一个文本节点；复制前后同时检查选区文字和 anchor/focus 偏移。

完整选中嵌套列表第二项时曾发现外层空编号问题，已由独立提交 `00bec2a` 修复，测试保留原正确预期。最新 Windows 无头实跑：30 个选区场景和两个完整回复按钮均通过。内容软断言允许后续选区继续运行，但任何断言失败仍使整次运行失败。

继续补充的 8 个场景覆盖：两个完整标题、跨标题局部文字、反向跨强调和代码、两个数据单元格、数据行两端局部文字、不含公式的数据行、两个表头单元格、局部矩阵公式。复制前保存正文及选区端点的真实 DOM 节点引用，复制后核对整个回复 DOM、选中文字、Range 两端和 anchor/focus 方向；富文本中的公式数量也按固定预期精确检查。

`SITE_UNAVAILABLE` 表示网络或 HTTP 访问失败；`SITE_OR_SAMPLE_CHANGED` 表示正文未出现，可能是登录要求、挑战页或样本变化。两者均返回非零，不伪装成成功，也不能直接断言插件失效。正文加载后的断言失败需结合报告判断页面结构或复制行为变化。

每一步附加实际复制结果；失败保留页面 HTML、截图、控制台错误和 trace。运行 `pnpm exec playwright show-report` 查看报告。产物位于忽略提交的 `playwright-report/` 和 `test-results/`，不要使用个人登录资料运行此测试后公开上传诊断。

真实浏览器测试已合并到 `test.yml` CT 工作流的 `live-browser` 作业。推送和 PR 仅运行离线测试；真实浏览器测试每周日 02:23 UTC（北京时间 10:23）运行一次。手动运行 Tests 时勾选 `live_browser` 可立即执行，不改变固定周期。GitHub 的定时任务可能延迟或被丢弃；这里没有自动补跑机制。合并到默认分支后定时配置才生效，不发布扩展。Windows 和本机 Ubuntu 容器已实测通过；GitHub Actions 的真实站点检查尚未运行，不能由本机结果推断远端通过。
