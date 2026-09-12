import { appendFileSync, readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const origin = 'https://api.addons.microsoftedge.microsoft.com';

/** 读取必要配置，缺失时在发起请求前停止。 */
function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`缺少配置：${name}`);
  return value;
}

/** 输出发布进度；不输出请求头或凭据。 */
function report(message) {
  console.log(message);
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${message}\n\n`);
  }
}

/** 校验版本和唯一 ZIP，确保提审的是当前正式标签对应的构建。 */
function loadPackage(tag) {
  if (!/^v?\d+\.\d+\.\d+(?:\.\d+)?$/.test(tag)) {
    throw new Error('商店仅接受 vX.Y.Z 或 X.Y.Z 形式的正式版本标签（可含第四段）。');
  }
  const files = readdirSync('.output/store').filter(name => name.endsWith('-chrome.zip'));
  if (files.length !== 1) throw new Error('必须恰好找到一个 Chrome ZIP。');
  const path = `.output/store/${files[0]}`;
  const manifest = JSON.parse(execFileSync('unzip', ['-p', path, 'manifest.json'], { encoding: 'utf8' }));
  if (manifest.version !== tag.replace(/^v/, '')) throw new Error('标签与 ZIP manifest.version 不一致。');
  return readFileSync(path);
}

/** 调用微软 API；POST 不自动重试，避免超时后重复上传或提审。 */
async function request(path, headers, method = 'GET', body) {
  const response = await fetch(`${origin}${path}`, {
    method, headers, body, redirect: 'error', signal: AbortSignal.timeout(120_000),
  });
  const expected = method === 'POST' ? 202 : 200;
  if (response.status !== expected) {
    throw new Error(`${method} 请求失败：HTTP ${response.status}；请检查 Partner Center 后再重试。`);
  }
  return response;
}

/** 读取操作 ID，仅使用末段标识符，避免向响应指定的其他主机发送凭据。 */
function operationId(response) {
  const location = response.headers.get('location');
  const id = location?.split('/').filter(Boolean).at(-1);
  if (!id || !/^[a-zA-Z0-9-]+$/.test(id)) throw new Error('响应缺少有效操作 ID，请先检查 Partner Center。');
  return id;
}

/** 有界轮询异步操作，失败或超时均停止，不能把已受理当作成功。 */
async function waitForOperation(path, headers, label) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const result = await (await request(path, headers)).json();
    if (result.status === 'Succeeded') return;
    if (result.status !== 'InProgress') {
      throw new Error(`${label}未成功；请使用日志中的操作 ID 在 Partner Center 排查。`);
    }
    await delay(10_000);
  }
  throw new Error(`${label}等待超时；请核对现有提交，不要直接重复提审。`);
}

/** 上传现有产品的新包并提交审核，不修改商店元数据。 */
async function main() {
  const product = required('EDGE_PRODUCT_ID');
  if (!/^[a-f0-9-]{36}$/i.test(product)) throw new Error('EDGE_PRODUCT_ID 必须为产品 GUID。');
  const headers = { Authorization: `ApiKey ${required('EDGE_API_KEY')}`, 'X-ClientID': required('EDGE_CLIENT_ID') };
  const tag = required('RELEASE_TAG');
  const zip = loadPackage(tag);
  const base = `/v1/products/${product}/submissions`;
  const upload = await request(`${base}/draft/package`, { ...headers, 'Content-Type': 'application/zip' }, 'POST', zip);
  const uploadId = operationId(upload);
  report(`上传操作 ID：${uploadId}`);
  await waitForOperation(`${base}/draft/package/operations/${uploadId}`, headers, '上传');
  const submission = await request(base, { ...headers, 'Content-Type': 'application/json' }, 'POST', JSON.stringify({ notes: `Release ${tag}` }));
  const publishId = operationId(submission);
  report(`提审操作 ID：${publishId}`);
  await waitForOperation(`${base}/operations/${publishId}`, headers, '提审');
  report('Edge 提交已创建成功；审核及最终上架结果请在 Partner Center 查看。');
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
