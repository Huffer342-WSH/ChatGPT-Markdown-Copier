import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  manifest: {
    default_locale: 'en',
    name: '__MSG_extName__',
    description: '__MSG_extDescription__',
    host_permissions: ['https://chatgpt.com/*'],
    permissions: ['clipboardWrite'],
    web_accessible_resources: [
      {
        resources: ['md-copy-main.svg', 'md-copy-check.svg'],
        matches: ['https://chatgpt.com/*'],
      },
    ],
  },
});
