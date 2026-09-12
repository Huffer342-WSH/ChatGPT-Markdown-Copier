// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// 本文件运行真实按钮挂载及点击流程，仅替代本地化初始化和 WXT 入口包装。
vi.mock('../src/lib/web-i18n', () => ({
  initWebI18n: async () => {},
  syncWebLanguageFromHtml: async () => {},
  tWeb: (_key: string, fallback: string) => fallback,
}));

let official: HTMLButtonElement;
let original: HTMLButtonElement;
let markdown: HTMLButtonElement;
let observers: MutationObserver[];
let windowListeners: ReturnType<typeof vi.spyOn>;

beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.stubGlobal('defineContentScript', (definition: unknown) => definition);
  observers = [];
  const NativeObserver = MutationObserver;
  vi.stubGlobal('MutationObserver', class extends NativeObserver {
    /** @param {MutationCallback} callback 真实观察回调；只记录实例以便测试清理。 */
    constructor(callback: MutationCallback) {
      super(callback);
      observers.push(this);
    }
  });
  windowListeners = vi.spyOn(window, 'addEventListener');
  document.body.innerHTML = '<section data-turn="assistant"><button data-testid="copy-turn-action-button" aria-label="复制回复"><svg></svg></button></section>';
  official = document.querySelector('button')!;
  const entry = await import('../src/entrypoints/content');
  entry.default.main({} as never);
  document.dispatchEvent(new Event('DOMContentLoaded'));
  await Promise.resolve();
  await Promise.resolve();
  original = document.querySelector<HTMLButtonElement>('[data-copy-mode="original"]')!;
  markdown = document.querySelector<HTMLButtonElement>('.md-copy-button:not([data-copy-mode])')!;
});

afterEach(() => {
  observers.forEach((observer) => observer.disconnect());
  for (const [type, callback, options] of windowListeners.mock.calls) {
    window.removeEventListener(type, callback, options);
  }
  document.body.replaceChildren();
  document.getElementById('md-copy-extension-style')?.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('双按钮交互回归（模拟官方事件，非真实网页）', () => {
  it('没有 MAIN 桥接时，原样复制仍直接触发官方按钮且只更新自己的反馈', async () => {
    const click = vi.fn(() => official.setAttribute('aria-label', '回复已复制'));
    official.addEventListener('click', click);
    const bridge = vi.fn();
    official.addEventListener('md-copy-official-request', bridge);
    original.click();
    await Promise.resolve();
    expect(click).toHaveBeenCalledOnce();
    expect(bridge).not.toHaveBeenCalled();
    expect(original.dataset.state).toBe('success');
    expect(markdown.dataset.state).toBe('idle');
    expect(official.style.display).toBe('none');
  });

  it('桥接超时保留两个按钮、显示错误并释放原样复制入口', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    markdown.click();
    await vi.advanceTimersByTimeAsync(5000);
    expect(markdown.dataset.state).toBe('error');
    expect(original.isConnected && markdown.isConnected).toBe(true);
    official.addEventListener('click', () => official.setAttribute('aria-label', '回复已复制'));
    original.click();
    expect(original.dataset.state).toBe('success');
  });

  it('一条回复复制未完成时，不并发触发另一个按钮', async () => {
    const click = vi.fn();
    official.addEventListener('click', click);
    markdown.click();
    original.click();
    expect(click).not.toHaveBeenCalled();
    official.dispatchEvent(new CustomEvent('md-copy-official-result', { detail: 'success' }));
    expect(markdown.dataset.state).toBe('success');
    original.click();
    expect(click).toHaveBeenCalledOnce();
  });

  it('连续点击重置反馈计时，不受上次成功计时器影响', async () => {
    official.addEventListener('click', () => official.setAttribute('aria-label', '回复已复制'));
    original.click();
    await vi.advanceTimersByTimeAsync(1500);
    original.click();
    await vi.advanceTimersByTimeAsync(600);
    expect(original.dataset.state).toBe('success');
    await vi.advanceTimersByTimeAsync(1400);
    expect(original.dataset.state).toBe('idle');
    expect(markdown.dataset.state).toBe('idle');
  });
});
