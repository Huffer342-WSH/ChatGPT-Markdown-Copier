/**
 * Tooltip 交互模块：
 * 负责在 hover/focus 时动态挂载提示层、计算定位，并在离开时清理。
 */

import { t } from '../i18n';

const TOOLTIP_OFFSET_PX = 8;
const DEFAULT_TOOLTIP_TEXT = '复制 Markdown';

let activeTooltipWrapper: HTMLDivElement | null = null;
let activeTooltipAnchor: HTMLButtonElement | null = null;
let activeTooltipResizeHandler: (() => void) | null = null;

/**
 * 显示仿原版 tooltip（追加到 body 末尾）。
 *
 * @param {HTMLButtonElement} button tooltip 锚点按钮。
 * @returns {void}
 */
export function showTooltip(button: HTMLButtonElement): void {
  hideTooltip();

  const tooltipText = button.dataset.tooltip ?? t('mdCopyButtonIdle', DEFAULT_TOOLTIP_TEXT);
  const tooltipId = `md-copy-tooltip-${Math.random().toString(36).slice(2, 10)}`;

  const wrapper = document.createElement('div');
  wrapper.setAttribute('data-radix-popper-content-wrapper', '');
  wrapper.style.position = 'fixed';
  wrapper.style.left = '0px';
  wrapper.style.top = '0px';
  wrapper.style.minWidth = 'max-content';
  wrapper.style.zIndex = '50';

  const content = document.createElement('div');
  content.setAttribute('data-side', 'bottom');
  content.setAttribute('data-align', 'center');
  content.setAttribute('data-state', 'delayed-open');
  content.className =
    'relative z-50 transition-opacity select-none px-2 py-1 rounded-lg overflow-hidden dark bg-black max-w-xs';
  content.style.color = 'var(--text-token-text-primary, #fff)';

  const row = document.createElement('div');
  row.className = 'flex items-center gap-1';
  const rowInner = document.createElement('div');
  const text = document.createElement('div');
  text.className = 'text-token-text-primary text-xs font-semibold whitespace-pre-wrap text-center';
  text.dataset.mdCopyTooltipText = '1';
  text.textContent = tooltipText;
  rowInner.appendChild(text);
  row.appendChild(rowInner);

  const sr = document.createElement('span');
  sr.id = tooltipId;
  sr.setAttribute('role', 'tooltip');
  sr.style.position = 'absolute';
  sr.style.border = '0';
  sr.style.width = '1px';
  sr.style.height = '1px';
  sr.style.padding = '0';
  sr.style.margin = '-1px';
  sr.style.overflow = 'hidden';
  sr.style.clip = 'rect(0px, 0px, 0px, 0px)';
  sr.style.whiteSpace = 'nowrap';
  sr.style.overflowWrap = 'normal';
  sr.textContent = tooltipText;

  content.append(row, sr);
  wrapper.appendChild(content);
  document.body.appendChild(wrapper);
  button.setAttribute('aria-describedby', tooltipId);

  activeTooltipWrapper = wrapper;
  activeTooltipAnchor = button;

  const reposition = () => {
    if (!activeTooltipWrapper || !activeTooltipAnchor) return;
    const rect = activeTooltipAnchor.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.bottom + TOOLTIP_OFFSET_PX;
    activeTooltipWrapper.style.transform = `translate(${x}px, ${y}px) translateX(-50%)`;
    activeTooltipWrapper.style.setProperty('--radix-popper-transform-origin', '50% 0px');
    activeTooltipWrapper.style.setProperty('--radix-popper-available-width', `${window.innerWidth - x}px`);
    activeTooltipWrapper.style.setProperty('--radix-popper-available-height', `${window.innerHeight - y}px`);
    activeTooltipWrapper.style.setProperty('--radix-popper-anchor-width', `${rect.width}px`);
    activeTooltipWrapper.style.setProperty('--radix-popper-anchor-height', `${rect.height}px`);
  };

  activeTooltipResizeHandler = reposition;
  reposition();
  window.addEventListener('scroll', reposition, true);
  window.addEventListener('resize', reposition, true);
}

/**
 * 隐藏 tooltip。
 *
 * @param {HTMLButtonElement} [button] 可选锚点按钮；传入时仅在锚点匹配时执行隐藏。
 * @returns {void}
 */
export function hideTooltip(button?: HTMLButtonElement): void {
  if (button && activeTooltipAnchor !== button) return;
  if (!activeTooltipWrapper) return;

  if (activeTooltipResizeHandler) {
    window.removeEventListener('scroll', activeTooltipResizeHandler, true);
    window.removeEventListener('resize', activeTooltipResizeHandler, true);
    activeTooltipResizeHandler = null;
  }

  if (activeTooltipAnchor) {
    activeTooltipAnchor.removeAttribute('aria-describedby');
  }

  activeTooltipWrapper.remove();
  activeTooltipWrapper = null;
  activeTooltipAnchor = null;
}

/**
 * 若 tooltip 正在显示且锚点匹配，实时更新文案。
 *
 * @param {HTMLButtonElement} button tooltip 锚点按钮。
 * @returns {void}
 */
export function refreshTooltipText(button: HTMLButtonElement): void {
  if (activeTooltipAnchor !== button || !activeTooltipWrapper) return;
  const nextText = button.dataset.tooltip ?? '';
  const textNode = activeTooltipWrapper.querySelector<HTMLElement>('[data-md-copy-tooltip-text]');
  if (textNode) textNode.textContent = nextText;
  const srNode = activeTooltipWrapper.querySelector<HTMLElement>('[role="tooltip"]');
  if (srNode) srNode.textContent = nextText;
}
