import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/auto-icons'],
  vite: () => ({
    plugins: [{
      name: 'escape-unicode-noncharacters',
      /** 将 Unicode 非字符转义，避免 Chromium 将内容脚本判为无效 UTF-8。 */
      generateBundle(_options, bundle) {
        for (const output of Object.values(bundle)) {
          if (output.type !== 'chunk') continue;
          output.code = output.code.replace(
            /[\uFDD0-\uFDEF\uFFFE\uFFFF]|[\uD800-\uDBFF][\uDFFE\uDFFF]/g,
            (value) => Array.from({ length: value.length }, (_, index) =>
              `\\u${value.charCodeAt(index).toString(16).padStart(4, '0')}`,
            ).join(''),
          );
        }
      },
    }],
  }),
  manifest: {
    default_locale: 'en',
    name: '__MSG_extName__',
    description: '__MSG_extDescription__',
    host_permissions: ['https://chatgpt.com/*'],
    permissions: ['clipboardWrite'],
  },
});
