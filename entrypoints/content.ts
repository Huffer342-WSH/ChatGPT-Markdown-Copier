/**
 * 内容脚本入口：负责监听 ChatGPT 页面变化、注入 Markdown 复制按钮，
 * 并串联“定位消息 -> DOM 序列化 -> 写入剪贴板”的主流程。
 */

import { createMarkdownButton, installMarkdownButtonStyles, setButtonState } from '../lib/content/markdown-button';
import { findMessageRoot, isAssistantTurnButton, logMarkdownCopyDebugDom } from '../lib/content/message-root';
import { serializeMessageDomToMarkdown } from '../lib/markdown';

const ENHANCED_ATTR = 'data-md-copy-enhanced';

export default defineContentScript({
  matches: ['https://chatgpt.com/*'],
  runAt: 'document_idle',
  main() {
    if (!isSupportedDocument()) return;
    installMarkdownButtonStyles();
    installObserver();
    enhanceExistingButtons();
  },
});

/**
 * 判断当前文档是否为可注入的 ChatGPT HTML 页面。
 *
 * @returns {boolean} 仅在标准 HTML 文档返回 true。
 */
function isSupportedDocument(): boolean {
  if (document.documentElement?.tagName !== 'HTML') return false;
  if (!document.body) return false;
  return document.contentType === 'text/html';
}

/**
 * 监听 DOM 变化，确保切换会话/新增回复后仍能注入按钮。
 *
 * @returns {void}
 */
function installObserver(): void {
  if (!document.body) return;
  const observer = new MutationObserver(() => {
    enhanceExistingButtons();
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

/**
 * 扫描官方复制按钮并在其旁边添加 Markdown 按钮。
 *
 * @returns {void}
 */
function enhanceExistingButtons(): void {
  const copyButtons = document.querySelectorAll<HTMLButtonElement>(
    `button[data-testid="copy-turn-action-button"]:not([${ENHANCED_ATTR}="1"])`,
  );

  for (const officialButton of copyButtons) {
    officialButton.setAttribute(ENHANCED_ATTR, '1');
    if (!isAssistantTurnButton(officialButton)) continue;

    const markdownButton = createMarkdownButton(officialButton);
    markdownButton.addEventListener('click', () => {
      void handleMarkdownCopy(markdownButton, officialButton);
    });
    officialButton.insertAdjacentElement('afterend', markdownButton);
  }
}

/**
 * 核心流程：
 * 1) 定位当前 assistant 消息 DOM
 * 2) 直接序列化为 Markdown
 * 3) 写入剪贴板
 *
 * @param {HTMLButtonElement} markdownButton 自定义 Markdown 按钮实例。
 * @param {HTMLButtonElement} officialButton 同一条消息对应的官方复制按钮。
 * @returns {Promise<void>}
 */
async function handleMarkdownCopy(
  markdownButton: HTMLButtonElement,
  officialButton: HTMLButtonElement,
): Promise<void> {
  setButtonState(markdownButton, 'loading');

  try {
    const messageRoot = findMessageRoot(officialButton);
    if (!messageRoot) {
      logMarkdownCopyDebugDom(officialButton);
      throw new Error('Cannot find assistant message root');
    }

    const finalMarkdown = serializeMessageDomToMarkdown(messageRoot);
    await navigator.clipboard.writeText(finalMarkdown);
    setButtonState(markdownButton, 'success');
  } catch (error) {
    console.warn('[MD-COPY] markdown copy failed', error);
    logMarkdownCopyDebugDom(officialButton);
    setButtonState(markdownButton, 'error');
  }
}
