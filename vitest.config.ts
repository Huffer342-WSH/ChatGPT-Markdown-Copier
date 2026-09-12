import type { ViteUserConfig } from 'vitest/config';

/** 持续测试配置：统一收集 tests/，使用线程池兼容受限 Windows 环境。 */
export default {
  test: {
    include: ['tests/**/*.test.ts'],
    pool: 'threads',
    clearMocks: true,
    restoreMocks: true,
  },
} satisfies ViteUserConfig;
