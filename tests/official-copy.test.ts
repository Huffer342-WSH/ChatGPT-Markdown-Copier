// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let button: HTMLButtonElement;
let results: string[];
let listener: EventListener;
let writeText: ReturnType<typeof vi.fn<(text: string) => Promise<void>>>;
let clipboard: { writeText: (text: string) => Promise<void> };

beforeEach(async () => {
  vi.resetModules();
  // 只替代 WXT 入口包装及浏览器剪贴板；被测事件处理和转换使用生产代码。
  vi.stubGlobal('defineContentScript', (definition: unknown) => definition);
  writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);
  clipboard = Object.create({ writeText });
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: clipboard });
  button = document.createElement('button');
  button.dataset.testid = 'copy-turn-action-button';
  button.dataset.mdCopyEnhanced = '1';
  document.body.replaceChildren(button);
  results = [];
  button.addEventListener('md-copy-official-result', (event) => results.push((event as CustomEvent<string>).detail));
  const registration = vi.spyOn(document, 'addEventListener');
  const entry = await import('../entrypoints/official-copy.content');
  entry.default.main({} as never);
  listener = registration.mock.calls.find(([type]) => type === 'md-copy-official-request')![1] as EventListener;
});

afterEach(() => {
  document.removeEventListener('md-copy-official-request', listener);
  Reflect.deleteProperty(navigator, 'clipboard');
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

/** 通过真实 DOM 事件进入生产桥接，再等待写入 Promise 的反馈微任务。 */
async function requestCopy(): Promise<void> {
  button.dispatchEvent(new Event('md-copy-official-request', { bubbles: true }));
  await Promise.resolve();
}

describe('官方复制桥接（本地模拟剪贴板，非跨执行环境验证）', () => {
  it('转换本次官方输出，等待实际写入任务完成后才报告成功', async () => {
    let complete!: () => void;
    writeText.mockImplementation(() => new Promise<void>((resolve) => { complete = resolve; }));
    button.addEventListener('click', () => { void clipboard.writeText(String.raw`这里 \(A\)。`); });
    await requestCopy();
    expect(writeText).toHaveBeenCalledExactlyOnceWith('这里 $A$。');
    expect(results).toEqual([]);
    expect(Object.hasOwn(clipboard, 'writeText')).toBe(false);
    complete();
    await Promise.resolve();
    expect(results).toEqual(['success']);
  });

  it('复制完成后恢复方法，之后的普通复制不被转换', async () => {
    button.addEventListener('click', () => { void clipboard.writeText(String.raw`\(A\)`); });
    await requestCopy();
    expect(clipboard.writeText).toBe(writeText);
    await clipboard.writeText(String.raw`\(B\)`);
    expect(writeText.mock.calls.map(([text]) => text)).toEqual(['$A$', String.raw`\(B\)`]);
  });

  it('恢复剪贴板原先的自有属性描述符', async () => {
    Object.defineProperty(clipboard, 'writeText', { value: writeText, configurable: true, writable: false, enumerable: false });
    const descriptor = Object.getOwnPropertyDescriptor(clipboard, 'writeText');
    button.addEventListener('click', () => { void clipboard.writeText(String.raw`\(A\)`); });
    await requestCopy();
    expect(Object.getOwnPropertyDescriptor(clipboard, 'writeText')).toEqual(descriptor);
  });

  it('写入拒绝时报告错误，并恢复方法', async () => {
    writeText.mockRejectedValue(new Error('permission denied'));
    button.addEventListener('click', () => { void clipboard.writeText('text').catch(() => {}); });
    await requestCopy();
    expect(results).toEqual(['error']);
    expect(clipboard.writeText).toBe(writeText);
    expect(Object.hasOwn(clipboard, 'writeText')).toBe(false);
  });

  it('点击未写入时报告不支持，不将其他后续写入作为本次成功', async () => {
    await requestCopy();
    await clipboard.writeText(String.raw`\(later\)`);
    expect(results).toEqual(['unsupported']);
    expect(writeText).toHaveBeenCalledExactlyOnceWith(String.raw`\(later\)`);
  });

  it('不接管未标记的按钮', async () => {
    button.removeAttribute('data-md-copy-enhanced');
    const click = vi.fn();
    button.addEventListener('click', click);
    await requestCopy();
    expect(click).not.toHaveBeenCalled();
    expect(writeText).not.toHaveBeenCalled();
    expect(results).toEqual([]);
  });
});
