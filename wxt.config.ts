import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  manifest: {
    name: 'ChatGPT Markdown Copier',
    description: 'Add a Markdown copy button for ChatGPT responses',
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
