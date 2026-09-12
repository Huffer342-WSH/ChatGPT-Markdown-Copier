/**
 * 内容脚本入口：负责监听 ChatGPT 页面变化、注入 Markdown 复制按钮，
 * 并通过页面主环境桥接复用官方复制结果。
 */

import {
  createMarkdownButton,
  createOriginalCopyButton,
  installMarkdownButtonStyles,
  refreshButtonLocale,
  setButtonState,
} from '../lib/content/markdown-button';
import { isAssistantTurnButton } from '../lib/content/message-root';
import { installMathSelectionCopy } from '../lib/selection-copy';
import { initWebI18n, syncWebLanguageFromHtml } from '../lib/web-i18n';

const ENHANCED_ATTR = 'data-md-copy-enhanced';
const MARKDOWN_BUTTON_SELECTOR = 'button.md-copy-button';
const activeCopies = new WeakSet<HTMLButtonElement>();

export default defineContentScript({
  matches: ['https://chatgpt.com/*'],
  runAt: 'document_start',
  main() {
    installMathSelectionCopy();
    runBootstrapWhenDocumentReady();
  },
});

/**
 * 等待正文 DOM 可用后再启动按钮与页面观察器。
 * 公式复制监听器已在 document_start 阶段单独安装，不受异步初始化影响。
 *
 * @returns {void}
 */
function runBootstrapWhenDocumentReady(): void {
  if (document.readyState === 'loading') {
    document.addEventListener(
      'DOMContentLoaded',
      () => {
        void bootstrapContentScript();
      },
      { once: true },
    );
    return;
  }

  void bootstrapContentScript();
}

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
 * 隐藏官方按钮，并排放置原样复制与 Markdown 按钮；保留原节点供页面调用。
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
    const originalCopyButton = createOriginalCopyButton(officialButton);
    markdownButton.addEventListener('click', () => {
      void handleMarkdownCopy(markdownButton, officialButton);
    });
    originalCopyButton.addEventListener('click', () => {
      handleOriginalCopy(originalCopyButton, officialButton);
    });
    officialButton.after(originalCopyButton, markdownButton);
    officialButton.style.setProperty('display', 'none', 'important');
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
 * 同步请求页面主环境执行官方复制，在浏览器确认写入后更新按钮。
 * 不读取系统剪贴板；未捕获时显示失败，保留原样复制入口。
 *
 * @param {HTMLButtonElement} markdownButton 自定义 Markdown 按钮实例。
 * @param {HTMLButtonElement} officialButton 同一条消息对应的官方复制按钮。
 * @returns {Promise<void>}
 */
async function handleMarkdownCopy(
  markdownButton: HTMLButtonElement,
  officialButton: HTMLButtonElement,
): Promise<void> {
  if (activeCopies.has(officialButton)) return;
  activeCopies.add(officialButton);
  setButtonState(markdownButton, 'loading');
  /** @param {string} state 主环境报告的结果或超时状态。 */
  const finish = (state: string): void => {
    window.clearTimeout(timer);
    activeCopies.delete(officialButton);
    officialButton.removeEventListener('md-copy-official-result', onResult);
    if (state === 'success') setButtonState(markdownButton, 'success');
    else {
      setButtonState(markdownButton, 'error');
      console.warn('[MD-COPY] Markdown bridge unavailable:', state);
    }
  };
  /** @param {Event} event 页面桥接结果。 */
  const onResult = (event: Event): void => {
    const state = (event as CustomEvent<unknown>).detail;
    if (state === 'success' || state === 'error' || state === 'unsupported') finish(state);
  };
  const timer = window.setTimeout(() => finish('timeout'), 5000);
  officialButton.addEventListener('md-copy-official-result', onResult);
  officialButton.dispatchEvent(new Event('md-copy-official-request', { bubbles: true }));
}

/**
 * 直接触发原按钮，不经过主环境桥接、不包装剪贴板；只观察官方成功提示。
 * 此反馈代表页面报告成功，不代表扩展读取并核验了系统剪贴板。
 * @param {HTMLButtonElement} visibleButton 可见的原样复制按钮。
 * @param {HTMLButtonElement} officialButton 隐藏的官方按钮。
 * @returns {void}
 */
function handleOriginalCopy(visibleButton: HTMLButtonElement, officialButton: HTMLButtonElement): void {
  if (activeCopies.has(officialButton)) return;
  activeCopies.add(officialButton);
  setButtonState(visibleButton, 'loading');
  let finished = false;
  /** @param {boolean} success 是否观察到官方成功提示。 */
  const finish = (success: boolean): void => {
    if (finished) return;
    finished = true;
    observer.disconnect();
    window.clearTimeout(timer);
    activeCopies.delete(officialButton);
    setButtonState(visibleButton, success ? 'success' : 'error');
  };
  /** 跟随官方成功提示，包括短时间内再次点击时官方仍保持成功的情况。 */
  const checkStatus = (): void => {
    if (/copied|已复制/i.test(officialButton.getAttribute('aria-label') ?? '')) finish(true);
  };
  const observer = new MutationObserver(checkStatus);
  observer.observe(officialButton, { attributes: true, attributeFilter: ['aria-label'], childList: true, subtree: true });
  const timer = window.setTimeout(() => finish(false), 5000);
  try {
    officialButton.click();
    checkStatus();
  } catch (error) {
    console.warn('[MD-COPY] original copy failed', error);
    finish(false);
  }
}
