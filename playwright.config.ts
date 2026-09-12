import { defineConfig } from '@playwright/test';

/** 真实站点兼容性测试独立运行，单 worker 避免争用系统剪贴板。 */
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.spec.ts',
  timeout: 180_000,
  expect: { timeout: 10_000 },
  workers: 1,
  retries: 0,
  outputDir: 'test-results',
  reporter: [['list'], ['html', { open: 'never' }]],
});
