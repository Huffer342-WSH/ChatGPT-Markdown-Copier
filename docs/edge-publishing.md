# Edge 商店自动提审

正式标签触发 `.github/workflows/release.yml`：测试、类型检查、构建、打包和 GitHub Release 成功后，独立的 `edge-store` job 使用同一构建产物上传并提交审核。预发布标签不会提交商店。

## 首次配置

在 Partner Center 的 Microsoft Edge → Publish API 创建新版 API 凭据，然后在 GitHub 仓库 Settings → Secrets and variables → Actions 配置：

| 类型 | 名称 | 内容 |
| --- | --- | --- |
| Secret | `EDGE_CLIENT_ID` | Publish API 的 Client ID |
| Secret | `EDGE_API_KEY` | Publish API 的 API key |
| Variable | `EDGE_PRODUCT_ID` | 产品 GUID，本项目为 `0090d707-a0c7-4af1-ba73-78ae057fb29c` |

密钥不要存入仓库或日志。到期前在 Partner Center 更新密钥，并同步 GitHub Secret。

## 发布流程

1. 更新 `package.json` 版本，并完成代码验证与提交。
2. 推送与版本一致的正式标签，例如 `v0.2.2`。商店版本必须高于已发布版本。
3. 工作流验证 ZIP 中 `manifest.json` 的版本与标签一致，且仅有一个 Chrome ZIP。
4. 脚本上传并轮询操作状态，成功后提交当前产品草稿并轮询提审状态。
5. Actions Summary 保存上传与提审操作 ID。`Succeeded` 表示提交创建成功，不表示审核通过或已上架；最终状态以 Partner Center 为准。

提审会提交产品的当前草稿，执行期间避免在后台同时修改草稿。描述、截图和隐私等元数据仍需在 Partner Center 维护，未完成的项目可能阻止提审。

商店 job 使用独立并发组，运行中的任务不取消；不要同时推送多个正式版本标签，GitHub 并发组不保证待执行版本的先后顺序。

## 失败处理

- 缺少凭据、版本不匹配时，在上传前失败。
- POST 不自动重试；请求超时或工作流中断后，先在 Partner Center 核对草稿与审核状态，避免重复提交。
- 修正问题后可重跑失败 job，复用同一次运行保存的构建产物；已在审核中的版本不应重新上传。
- 当前实现没有更新商店元数据，也没有自动查询最终上架状态。

官方参考：[更新 API](https://learn.microsoft.com/en-us/microsoft-edge/extensions/update/api/using-addons-api)、[API 状态与错误说明](https://learn.microsoft.com/en-us/microsoft-edge/extensions/update/api/addons-api-reference)。
