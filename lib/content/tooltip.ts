/**
 * Tooltip 交互模块：
 * 负责在 hover/focus 时动态挂载提示层、计算定位，并在离开时清理。
 */

import { t } from '../i18n';

const TOOLTIP_OFFSET_PX = 8;
const DEFAULT_TOOLTIP_TEXT = '复制 Markdown';
const TOOLTIP_RETRY_INTERVAL_MS = 40;
const TOOLTIP_MAX_DEFER_MS = 240;

let activeTooltipWrapper: HTMLDivElement | null = null;
let activeTooltipAnchor: HTMLButtonElement | null = null;
let activeTooltipResizeHandler: (() => void) | null = null;
let pendingShowTimer: number | null = null;
let pendingShowAnchor: HTMLButtonElement | null = null;
let pendingShowStartedAt = 0;

/**
 * Tooltip 显示参数。
 */
export interface ShowTooltipOptions {
  /**
   * 当页面存在外部 tooltip（如 ChatGPT 原生）时，是否延后显示。
   * 默认值：true。
   */
  deferIfExternalVisible?: boolean;
}

/**
 * 显示仿原版 tooltip（追加到 body 末尾）。
 *
 * @param {HTMLButtonElement} button tooltip 锚点按钮。
 * @param {ShowTooltipOptions} [options] 显示策略参数。
 * @returns {void}
 */
export function showTooltip(button: HTMLButtonElement, options: ShowTooltipOptions = {}): void {
  const { deferIfExternalVisible = true } = options;
  cancelPendingShow();

  if (deferIfExternalVisible && hasExternalTooltipVisible()) {
    scheduleDeferredShow(button);
    return;
  }

  mountTooltip(button);
}

/**
 * 实际挂载 tooltip 节点并完成定位。
 *
 * @param {HTMLButtonElement} button tooltip 锚点按钮。
 * @returns {void}
 */
function mountTooltip(button: HTMLButtonElement): void {
  clearActiveTooltip();

  const tooltipText = button.dataset.tooltip ?? t('mdCopyButtonIdle', DEFAULT_TOOLTIP_TEXT);
  const tooltipId = `md-copy-tooltip-${Math.random().toString(36).slice(2, 10)}`;

  const wrapper = document.createElement('div');
  wrapper.setAttribute('data-radix-popper-content-wrapper', '');
  wrapper.setAttribute('data-md-copy-tooltip', '1');
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
 * 延迟显示 tooltip：当外部 tooltip 尚未消失时进行轮询重试。
 *
 * @param {HTMLButtonElement} button tooltip 锚点按钮。
 * @returns {void}
 */
function scheduleDeferredShow(button: HTMLButtonElement): void {
  pendingShowAnchor = button;
  pendingShowStartedAt = Date.now();

  const retry = () => {
    if (pendingShowAnchor !== button) return;
    if (!isButtonInteractive(button)) {
      cancelPendingShow(button);
      return;
    }

    const elapsed = Date.now() - pendingShowStartedAt;
    if (elapsed < TOOLTIP_MAX_DEFER_MS && hasExternalTooltipVisible()) {
      pendingShowTimer = window.setTimeout(retry, TOOLTIP_RETRY_INTERVAL_MS);
      return;
    }

    cancelPendingShow(button);
    mountTooltip(button);
  };

  pendingShowTimer = window.setTimeout(retry, TOOLTIP_RETRY_INTERVAL_MS);
}

/**
 * 检查页面是否存在非本插件的 tooltip。
 *
 * @returns {boolean}
 */
function hasExternalTooltipVisible(): boolean {
  const wrappers = document.querySelectorAll<HTMLDivElement>('div[data-radix-popper-content-wrapper]');
  for (const wrapper of wrappers) {
    if (wrapper.getAttribute('data-md-copy-tooltip') === '1') continue;
    if (wrapper.querySelector('[role="tooltip"]')) return true;
  }
  return false;
}

/**
 * 判断按钮是否仍处于交互状态（hover 或 focus）。
 *
 * @param {HTMLButtonElement} button 目标按钮。
 * @returns {boolean}
 */
function isButtonInteractive(button: HTMLButtonElement): boolean {
  return button.matches(':hover') || document.activeElement === button;
}

/**
 * 取消待显示任务。
 *
 * @param {HTMLButtonElement} [button] 可选锚点按钮；传入时仅在锚点匹配时取消。
 * @returns {void}
 */
function cancelPendingShow(button?: HTMLButtonElement): void {
  if (button && pendingShowAnchor !== button) return;
  if (pendingShowTimer !== null) {
    window.clearTimeout(pendingShowTimer);
    pendingShowTimer = null;
  }
  pendingShowAnchor = null;
  pendingShowStartedAt = 0;
}

/**
 * 清理当前已挂载的 tooltip（不处理待显示任务）。
 *
 * @param {HTMLButtonElement} [button] 可选锚点按钮；传入时仅在锚点匹配时执行清理。
 * @returns {void}
 */
function clearActiveTooltip(button?: HTMLButtonElement): void {
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
 * 隐藏 tooltip。
 *
 * @param {HTMLButtonElement} [button] 可选锚点按钮；传入时仅在锚点匹配时执行隐藏。
 * @returns {void}
 */
export function hideTooltip(button?: HTMLButtonElement): void {
  cancelPendingShow(button);
  clearActiveTooltip(button);
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
