/**
 * Markdown 按钮 UI 模块：
 * 负责按钮创建、状态切换、图标资源加载与样式注入。
 */

import { hideTooltip, refreshTooltipText, showTooltip } from './tooltip';
import { t } from '../i18n';
import markdownButtonStyles from './markdown-button.css?raw';
import markdownButtonIconsSprite from './md-copy-icons.svg?raw';

export type ButtonState = 'idle' | 'loading' | 'success' | 'error';
const SVG_NS = 'http://www.w3.org/2000/svg';
const SPRITE_CONTAINER_ID = 'md-copy-icons-sprite';
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
    }, 2000);
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
  const styleHost = document.head ?? document.documentElement;
  if (!styleHost) return;

  const style = document.createElement('style');
  style.id = 'md-copy-extension-style';
  style.textContent = markdownButtonStyles;
  styleHost.appendChild(style);
  ensureSpriteInjected();
}

/**
 * 创建按钮图标。
 *
 * @param {boolean} isCheck 是否创建成功态勾选图标。
 * @returns {SVGSVGElement}
 */
function createIcon(isCheck: boolean): SVGSVGElement {
  const symbolId = isCheck ? 'md-copy-check' : 'md-copy-main';
  const spriteHref = `#${symbolId}`;
  const icon = document.createElementNS(SVG_NS, 'svg');
  icon.setAttribute('xmlns', SVG_NS);
  icon.setAttribute('viewBox', '0 0 20 20');
  icon.setAttribute('width', '18');
  icon.setAttribute('height', '18');
  icon.setAttribute('aria-hidden', 'true');
  icon.classList.add('icon', 'md-copy-icon', isCheck ? 'md-copy-icon-check' : 'md-copy-icon-main');
  const use = document.createElementNS(SVG_NS, 'use');
  use.setAttribute('href', spriteHref);
  use.setAttribute('xlink:href', spriteHref);
  icon.append(use);
  return icon;
}

/**
 * 注入 SVG sprite 定义，避免跨域 use 引用导致的安全限制。
 *
 * @returns {void}
 */
function ensureSpriteInjected(): void {
  if (document.getElementById(SPRITE_CONTAINER_ID)) return;
  const host = document.body ?? document.documentElement;
  if (!host) return;

  const temp = document.createElement('div');
  temp.innerHTML = markdownButtonIconsSprite.trim();
  const sprite = temp.firstElementChild;
  if (!(sprite instanceof SVGSVGElement)) return;

  sprite.id = SPRITE_CONTAINER_ID;
  sprite.setAttribute('aria-hidden', 'true');
  sprite.style.position = 'absolute';
  sprite.style.width = '0';
  sprite.style.height = '0';
  sprite.style.overflow = 'hidden';
  sprite.style.pointerEvents = 'none';
  host.prepend(sprite);
}
