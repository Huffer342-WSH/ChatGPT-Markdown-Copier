import { test as base, chromium, expect, type BrowserContext, type Page } from '@playwright/test';
import { access, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';

export const shareUrl = 'https://chatgpt.com/share/6aa56484-1d54-83ec-bde8-5e74912ac85b';

/** 启动加载实际构建产物的隔离 Chromium；保留失败诊断，不使用个人登录资料。 */
export const test = base.extend<{ livePage: Page }>({
  livePage: async ({}, use, testInfo) => {
    const extension = resolve('.output/chrome-mv3');
    await access(join(extension, 'manifest.json'));
    const profile = await mkdtemp(join(tmpdir(), 'md-copy-e2e-'));
    let context: BrowserContext | undefined;
    try {
      context = await chromium.launchPersistentContext(profile, {
        channel: 'chromium',
        headless: process.env.E2E_HEADED !== '1',
        viewport: { width: 1440, height: 1200 },
        locale: 'zh-CN',
        proxy: process.env.E2E_PROXY ? { server: process.env.E2E_PROXY } : undefined,
        args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
      });
      await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'https://chatgpt.com' });
      await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
      const page = context.pages()[0] ?? await context.newPage();
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', message => {
        if (message.type() === 'error' || message.text().includes('[MD-COPY]')) errors.push(message.text());
      });
      try {
        await use(page);
      } finally {
        await testInfo.attach('browser-errors', { body: errors.join('\n'), contentType: 'text/plain' });
        if (testInfo.status !== testInfo.expectedStatus) {
          await testInfo.attach('page', { body: await page.content(), contentType: 'text/html' });
          await testInfo.attach('screenshot', { body: await page.screenshot(), contentType: 'image/png' });
          const trace = testInfo.outputPath('trace.zip');
          await context.tracing.stop({ path: trace });
          await testInfo.attach('trace', { path: trace, contentType: 'application/zip' });
        } else {
          await context.tracing.stop();
        }
      }
    } finally {
      await context?.close();
      await rm(profile, { recursive: true, force: true });
    }
  },
});

/** 仅统一平台换行；保留空格、缩进和尾部换行用于发现格式回归。 */
export function normalizeNewlines(value: string): string {
  return value.replace(/\r\n/g, '\n');
}

/** 清空上次内容，确保接下来的读取不是陈旧剪贴板造成的假通过。 */
export async function resetClipboard(page: Page): Promise<void> {
  await page.evaluate(() => navigator.clipboard.writeText('__MD_COPY_E2E_PENDING__'));
}

/** 读取浏览器实际剪贴板的所有文本 MIME，不替换页面的写入方法。 */
export async function readClipboard(page: Page): Promise<Record<string, string>> {
  return page.evaluate(async () => {
    const result: Record<string, string> = {};
    for (const item of await navigator.clipboard.read()) {
      for (const type of item.types) {
        if (type.startsWith('text/')) result[type] = await (await item.getType(type)).text();
      }
    }
    return result;
  });
}

/** 等待新内容到达，避免把 UI 的成功动画作为复制正确性的证据。 */
export async function waitForCopy(page: Page): Promise<Record<string, string>> {
  await expect.poll(async () => (await readClipboard(page))['text/plain']).not.toBe('__MD_COPY_E2E_PENDING__');
  const payload = await readClipboard(page);
  expect(payload['text/plain']).toBeTruthy();
  return payload;
}

export { expect };
