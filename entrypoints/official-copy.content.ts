import { normalizeOfficialMarkdown } from '../lib/official-markdown';

/** 页面主环境桥接：只接管扩展主动触发的官方按钮同步复制调用。 */
export default defineContentScript({
  matches: ['https://chatgpt.com/*'],
  runAt: 'document_start',
  world: 'MAIN',
  main() {
    document.addEventListener('md-copy-official-request', handleOfficialCopy);
  },
});

/**
 * 临时包装剪贴板写入，并调用原按钮；调用返回后立即恢复，避免影响其他操作。
 * 异步提交的 ClipboardItem 内容仍可转换，但写入方法必须在点击调用栈内被调用。
 * @param {Event} event 从隔离环境发来的按钮事件。
 * @returns {void}
 */
function handleOfficialCopy(event: Event): void {
  const button = event.target;
  if (!(button instanceof HTMLButtonElement) ||
      !button.matches('button[data-testid="copy-turn-action-button"][data-md-copy-enhanced="1"]')) return;
  const clipboard = navigator.clipboard;
  if (!clipboard) return;
  const originalText = clipboard.writeText;
  const originalWrite = clipboard.write;
  const textDescriptor = Object.getOwnPropertyDescriptor(clipboard, 'writeText');
  const writeDescriptor = Object.getOwnPropertyDescriptor(clipboard, 'write');
  let intercepted = false;
  let installed = false;

  /** @param {string} state 本次操作结果。 */
  const report = (state: string): void => {
    button.dispatchEvent(new CustomEvent('md-copy-official-result', { detail: state }));
  };
  /** @param {Promise<void>} pending 浏览器真实写入任务。 @returns {Promise<void>} */
  const track = (pending: Promise<void>): Promise<void> => {
    intercepted = true;
    void pending.then(() => report('success'), () => report('error'));
    return pending;
  };
  try {
    Object.defineProperty(clipboard, 'writeText', {
      configurable: true,
      value: (text: string) => track(originalText.call(clipboard,
        normalizeOfficialMarkdown(text))),
    });
    if (originalWrite) Object.defineProperty(clipboard, 'write', {
      configurable: true,
      value: (items: ClipboardItem[]) => track(originalWrite.call(clipboard, items.map((item) => {
        const entries = Object.fromEntries(item.types.map((type) => [type,
          type === 'text/plain'
            ? item.getType(type).then(async (blob) => new Blob(
              [normalizeOfficialMarkdown(await blob.text())], { type },
            ))
            : item.getType(type),
        ]));
        return new ClipboardItem(entries, { presentationStyle: item.presentationStyle });
      }))),
    });
    installed = true;
    button.click();
  } catch (error) {
    report('error');
    console.warn('[MD-COPY] official copy bridge failed', error);
  } finally {
    if (textDescriptor) Object.defineProperty(clipboard, 'writeText', textDescriptor);
    else delete (clipboard as Partial<Clipboard>).writeText;
    if (writeDescriptor) Object.defineProperty(clipboard, 'write', writeDescriptor);
    else delete (clipboard as Partial<Clipboard>).write;
    if (installed && !intercepted) report('unsupported');
  }
}
