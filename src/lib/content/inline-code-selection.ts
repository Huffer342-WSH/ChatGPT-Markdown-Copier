/** 单击回复中的行内代码时选择全文，不操作剪贴板或修改正文。 */
import { observeInlineCodeSetting } from '../settings/storage';

/** 安装事件委托，跟随开关状态；拖动和修饰键点击保留原行为。 */
export function installInlineCodeSelection(): void {
  let enabled = false;
  let gesture: { code: Element; x: number; y: number; dragged: boolean } | null = null;
  void observeInlineCodeSetting((value) => { enabled = value; }).catch((error) => {
    console.warn('[MD-COPY] Failed to load inline code setting', error);
  });
  /** 仅识别助手正文的非交互、非编辑行内代码。 */
  const findCode = (target: EventTarget | null): Element | null => {
    const code = target instanceof Element ? target.closest('code') : null;
    if (!code || !code.closest('[data-message-author-role="assistant"]') ||
        code.closest('pre,a,button,input,textarea,[role="button"],[role="textbox"],[contenteditable]:not([contenteditable="false"])')) return null;
    return code;
  };
  window.addEventListener('pointerdown', (event) => {
    const code = findCode(event.target);
    gesture = enabled && code && event.isPrimary && event.button === 0 &&
      !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey
      ? { code, x: event.clientX, y: event.clientY, dragged: false } : null;
  }, true);
  window.addEventListener('pointermove', (event) => {
    if (gesture && Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > 3) gesture.dragged = true;
  }, true);
  window.addEventListener('pointercancel', () => { gesture = null; }, true);
  window.addEventListener('click', (event) => {
    const current = gesture;
    gesture = null;
    if (!enabled || !current || current.dragged || event.defaultPrevented || event.detail !== 1 ||
        event.button !== 0 || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey ||
        findCode(event.target) !== current.code) return;
    const selection = window.getSelection();
    if (!selection || !selection.isCollapsed) return;
    const range = document.createRange();
    range.selectNodeContents(current.code);
    selection.removeAllRanges();
    selection.addRange(range);
  });
}
