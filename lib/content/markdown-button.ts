/**
 * Markdown 按钮 UI 模块：
 * 负责按钮创建、状态切换、图标资源加载与样式注入。
 */

import { hideTooltip, refreshTooltipText, showTooltip } from './tooltip';
import { t } from '../i18n';

export type ButtonState = 'idle' | 'loading' | 'success' | 'error';

const ICON_MAIN_URL =
  (globalThis as { chrome?: { runtime?: { getURL?: (path: string) => string } } }).chrome?.runtime?.getURL?.(
    'md-copy-main.svg',
  ) ?? '/md-copy-main.svg';
const ICON_CHECK_URL =
  (globalThis as { chrome?: { runtime?: { getURL?: (path: string) => string } } }).chrome?.runtime?.getURL?.(
    'md-copy-check.svg',
  ) ?? '/md-copy-check.svg';
const BUTTON_TEXT_IDLE = '复制 Markdown';
const BUTTON_TEXT_LOADING = '正在准备 Markdown';
const BUTTON_TEXT_SUCCESS = 'Markdown 已复制';
const BUTTON_TEXT_ERROR = '复制失败，点击重试';

/**
 * 创建 Markdown 复制按钮。
 *
 * @param {HTMLButtonElement} officialButton 官方复制按钮，用于复用样式与定位。
 * @returns {HTMLButtonElement}
 */
export function createMarkdownButton(officialButton: HTMLButtonElement): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `${officialButton.className} md-copy-button`;
  const idleText = t('mdCopyButtonIdle', BUTTON_TEXT_IDLE);
  button.setAttribute('aria-label', idleText);
  button.dataset.tooltip = idleText;
  button.dataset.state = 'idle';

  const iconWrap = document.createElement('span');
  iconWrap.className = 'flex items-center justify-center touch:w-10 h-8 w-8 md-copy-icon-wrap';
  iconWrap.append(createIcon(false), createIcon(true));
  button.append(iconWrap);

  button.addEventListener('mouseenter', () => showTooltip(button, { deferIfExternalVisible: true }));
  button.addEventListener('mouseleave', () => hideTooltip(button));
  button.addEventListener('focus', () => showTooltip(button, { deferIfExternalVisible: false }));
  button.addEventListener('blur', () => hideTooltip(button));
  return button;
}

/**
 * 更新按钮状态（默认/加载/成功/失败）。
 *
 * @param {HTMLButtonElement} button 目标按钮。
 * @param {ButtonState} state 目标状态。
 * @returns {void}
 */
export function setButtonState(button: HTMLButtonElement, state: ButtonState): void {
  button.dataset.state = state;

  if (state === 'idle') {
    const idleText = t('mdCopyButtonIdle', BUTTON_TEXT_IDLE);
    button.setAttribute('aria-label', idleText);
    button.dataset.tooltip = idleText;
    refreshTooltipText(button);
    return;
  }
  if (state === 'loading') {
    button.setAttribute('aria-label', t('mdCopyButtonLoading', BUTTON_TEXT_LOADING));
    button.dataset.tooltip = t('mdCopyButtonLoadingTooltip', `${BUTTON_TEXT_LOADING}...`);
    refreshTooltipText(button);
    return;
  }
  if (state === 'success') {
    const successText = t('mdCopyButtonSuccess', BUTTON_TEXT_SUCCESS);
    button.setAttribute('aria-label', successText);
    button.dataset.tooltip = successText;
    refreshTooltipText(button);
    window.setTimeout(() => {
      if (button.dataset.state === 'success') {
        setButtonState(button, 'idle');
      }
    }, 1200);
    return;
  }

  const errorText = t('mdCopyButtonError', BUTTON_TEXT_ERROR);
  button.setAttribute('aria-label', errorText);
  button.dataset.tooltip = errorText;
  refreshTooltipText(button);
  window.setTimeout(() => {
    if (button.dataset.state === 'error') {
      setButtonState(button, 'idle');
    }
  }, 2000);
}

/**
 * 注入按钮样式。
 *
 * @returns {void}
 */
export function installMarkdownButtonStyles(): void {
  if (document.getElementById('md-copy-extension-style')) return;

  const style = document.createElement('style');
  style.id = 'md-copy-extension-style';
  style.textContent = `
    .md-copy-button {
      position: relative;
      transition: background-color .15s ease, color .15s ease, transform .12s ease;
    }
    .md-copy-button .md-copy-icon-wrap {
      position: relative;
    }
    .md-copy-button .md-copy-icon {
      position: absolute;
      opacity: 1;
      transform: scale(1);
      transition: opacity .14s ease, transform .14s ease;
    }
    .md-copy-button .md-copy-icon-check {
      opacity: 0;
      transform: scale(0.85);
    }
    .md-copy-button:hover {
      background: rgba(100, 116, 139, .14);
      color: var(--text-primary, #111827);
    }
    .md-copy-button[data-state="success"] .md-copy-icon-main {
      opacity: 0;
      transform: scale(0.82);
    }
    .md-copy-button[data-state="success"] .md-copy-icon-check {
      opacity: 1;
      transform: scale(1);
    }
    .md-copy-button[data-state="loading"] {
      opacity: 0.75;
      animation: md-copy-pulse 0.9s ease-in-out infinite;
    }
    .md-copy-button[data-state="success"] {
      color: #166534;
      background: rgba(22, 101, 52, .12);
    }
    .md-copy-button[data-state="error"] {
      color: #b91c1c;
      background: rgba(185, 28, 28, .12);
    }
    @keyframes md-copy-pulse {
      0% { transform: scale(1); }
      50% { transform: scale(0.96); }
      100% { transform: scale(1); }
    }
  `;
  document.head.appendChild(style);
}

/**
 * 创建按钮图标。
 *
 * @param {boolean} isCheck 是否创建成功态勾选图标。
 * @returns {HTMLImageElement}
 */
function createIcon(isCheck: boolean): HTMLImageElement {
  const img = document.createElement('img');
  img.className = `md-copy-icon ${isCheck ? 'md-copy-icon-check' : 'md-copy-icon-main'}`;
  img.width = 18;
  img.height = 18;
  img.alt = '';
  img.setAttribute('aria-hidden', 'true');
  img.src = isCheck ? ICON_CHECK_URL : ICON_MAIN_URL;
  return img;
}
