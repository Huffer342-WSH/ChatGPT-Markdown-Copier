/**
 * 内容脚本入口：负责监听 ChatGPT 页面变化、注入 Markdown 复制按钮，
 * 并串联“定位消息 -> DOM 序列化 -> 写入剪贴板”的主流程。
 */

import {
  createMarkdownButton,
  installMarkdownButtonStyles,
  refreshButtonLocale,
  setButtonState,
} from '../lib/content/markdown-button';
import { findMessageRoot, isAssistantTurnButton, logMarkdownCopyDebugDom } from '../lib/content/message-root';
import { serializeMessageDomToMarkdown } from '../lib/markdown';
import { initWebI18n, syncWebLanguageFromHtml } from '../lib/web-i18n';

const ENHANCED_ATTR = 'data-md-copy-enhanced';
const MARKDOWN_BUTTON_SELECTOR = 'button.md-copy-button';

export default defineContentScript({
  matches: ['https://chatgpt.com/*'],
  runAt: 'document_idle',
  main() {
    void bootstrapContentScript();
  },
});

/**
 * 内容脚本启动流程：
 * 先初始化页面 i18n，再安装按钮能力与监听器。
 *
 * @returns {Promise<void>}
 */
async function bootstrapContentScript(): Promise<void> {
  if (!isSupportedDocument()) return;
  await initWebI18n();
  installMarkdownButtonStyles();
  installObserver();
  installLangObserver();
  enhanceExistingButtons();
}

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
 * 监听 html lang 变化，实时切换注入文案语言。
 *
 * @returns {void}
 */
function installLangObserver(): void {
  const observer = new MutationObserver(() => {
    void handleHtmlLangChanged();
  });
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
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
 * 页面语言变化后的处理：
 * 同步 i18next 当前语言，并刷新已注入按钮文案。
 *
 * @returns {Promise<void>}
 */
async function handleHtmlLangChanged(): Promise<void> {
  await syncWebLanguageFromHtml();
  refreshEnhancedButtonsLocale();
}

/**
 * 刷新所有已注入按钮的本地化文案。
 *
 * @returns {void}
 */
function refreshEnhancedButtonsLocale(): void {
  const buttons = document.querySelectorAll<HTMLButtonElement>(MARKDOWN_BUTTON_SELECTOR);
  for (const button of buttons) {
    refreshButtonLocale(button);
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
