// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createMathSelectionClipboardPayload,
  handleMathSelectionCopy,
} from './selection-copy';

const DISPLAY_LATEX = String.raw`H = \begin{pmatrix} 1 & 0.5 \\ 0.5 & 1 \end{pmatrix}`;

beforeEach(() => {
  document.body.replaceChildren();
  window.getSelection()?.removeAllRanges();
});

describe('createMathSelectionClipboardPayload', () => {
  it('局部选择块级公式时复制完整 LaTeX', () => {
    const contentRoot = createAssistantContent();
    const formula = createKatexFormula(DISPLAY_LATEX, true, 'H=(1 0.5; 0.5 1)');
    contentRoot.append(formula.root);

    const selection = selectText(formula.visualText, 5, 8);
    const payload = createMathSelectionClipboardPayload(selection);

    expect(payload?.textPlain).toBe(`$$${DISPLAY_LATEX}$$`);
    expect(payload?.textHtml).toContain('katex-display');
    expect(payload?.textHtml).toContain('application/x-tex');
    expect(selection.toString()).toBe('0.5');
  });

  it('保留文字与行内公式的原始顺序', () => {
    const contentRoot = createAssistantContent();
    const paragraph = document.createElement('p');
    const before = document.createTextNode('Before ');
    const formula = createKatexFormula(String.raw`x^2`, false, 'x2');
    const after = document.createTextNode(' after');
    paragraph.append(before, formula.root, after);
    contentRoot.append(paragraph);

    const selection = selectRange(before, 0, after, after.length);
    const payload = createMathSelectionClipboardPayload(selection);

    expect(payload?.textPlain).toBe('Before $x^2$ after');
  });

  it('普通文字选区返回 null 以保留原生复制', () => {
    const contentRoot = createAssistantContent();
    const text = document.createTextNode('plain text');
    contentRoot.append(text);

    const selection = selectText(text, 0, text.length);

    expect(createMathSelectionClipboardPayload(selection)).toBeNull();
  });

  it('公式缺少 TeX annotation 时返回 null', () => {
    const contentRoot = createAssistantContent();
    const formula = createKatexFormula('', true, 'broken');
    formula.root.querySelector('annotation')?.remove();
    contentRoot.append(formula.root);

    const selection = selectText(formula.visualText, 0, formula.visualText.length);

    expect(createMathSelectionClipboardPayload(selection)).toBeNull();
  });

  it('可编辑区域内的公式选区返回 null', () => {
    const contentRoot = createAssistantContent();
    const editable = document.createElement('div');
    editable.setAttribute('contenteditable', 'true');
    const formula = createKatexFormula(String.raw`x+y`, false, 'x+y');
    editable.append(formula.root);
    contentRoot.append(editable);

    const selection = selectText(formula.visualText, 0, formula.visualText.length);

    expect(createMathSelectionClipboardPayload(selection)).toBeNull();
  });

  it('不依赖 ChatGPT 易变的 assistant 与 prose 选择器', () => {
    const content = document.createElement('div');
    content.className = 'markdown';
    const formula = createKatexFormula(String.raw`y = x^2`, false, 'y=x2');
    content.append(formula.root);
    document.body.append(content);

    const selection = selectText(formula.visualText, 2, 3);

    expect(createMathSelectionClipboardPayload(selection)?.textPlain).toBe('$y = x^2$');
  });

  it('annotation 缺失时可从 data-latex 恢复源码', () => {
    const formula = createKatexFormula('', false, 'xk+1');
    formula.root.querySelector('annotation')?.remove();
    formula.root.setAttribute('data-latex', String.raw`x^{k+1}`);
    document.body.append(formula.root);

    const selection = selectText(formula.visualText, 1, 2);

    expect(createMathSelectionClipboardPayload(selection)?.textPlain).toBe(String.raw`$x^{k+1}$`);
  });

  it('支持新版 ChatGPT 的 data-math-source 外层包装', () => {
    const formula = createKatexFormula('', true, 'H=(1 0.5; 0.5 1)');
    formula.root.querySelector('annotation')?.remove();
    const wrapper = document.createElement('span');
    wrapper.setAttribute('role', 'math');
    wrapper.setAttribute('data-math-source', DISPLAY_LATEX);
    wrapper.style.display = 'block';
    wrapper.append(formula.root);
    document.body.append(wrapper);

    const selection = selectText(formula.visualText, 5, 8);

    expect(createMathSelectionClipboardPayload(selection)?.textPlain).toBe(
      `$$${DISPLAY_LATEX}$$`,
    );
  });
});

describe('handleMathSelectionCopy', () => {
  it('成功转换后同时写入 text/plain 与 text/html 并阻止后续覆盖', () => {
    const contentRoot = createAssistantContent();
    const formula = createKatexFormula(String.raw`q = 0.1`, false, 'q=0.1');
    contentRoot.append(formula.root);
    selectText(formula.visualText, 0, formula.visualText.length);

    const clipboard = new Map<string, string>();
    const preventDefault = vi.fn();
    const stopImmediatePropagation = vi.fn();
    const event = {
      clipboardData: {
        setData(type: string, value: string) {
          clipboard.set(type, value);
        },
      },
      preventDefault,
      stopImmediatePropagation,
    } as unknown as ClipboardEvent;

    handleMathSelectionCopy(event);

    expect(clipboard.get('text/plain')).toBe('$q = 0.1$');
    expect(clipboard.get('text/html')).toContain('katex');
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(stopImmediatePropagation).toHaveBeenCalledOnce();
  });
});

/**
 * 创建符合 ChatGPT 关键结构的 assistant 正文容器。
 *
 * @returns {HTMLElement}
 */
function createAssistantContent(): HTMLElement {
  const turn = document.createElement('section');
  turn.dataset.turn = 'assistant';
  const contentRoot = document.createElement('div');
  contentRoot.className = 'markdown prose';
  turn.append(contentRoot);
  document.body.append(turn);
  return contentRoot;
}

/**
 * 创建带 MathML annotation 与视觉分支的最小 KaTeX DOM。
 *
 * @param {string} latex LaTeX 真值。
 * @param {boolean} display 是否为块级公式。
 * @param {string} visualText 视觉分支文本。
 * @returns {{ root: HTMLElement; visualText: Text }}
 */
function createKatexFormula(
  latex: string,
  display: boolean,
  visualText: string,
): { root: HTMLElement; visualText: Text } {
  const katex = document.createElement('span');
  katex.className = 'katex';

  const mathml = document.createElement('span');
  mathml.className = 'katex-mathml';
  const math = document.createElement('math');
  const semantics = document.createElement('semantics');
  const annotation = document.createElement('annotation');
  annotation.setAttribute('encoding', 'application/x-tex');
  annotation.textContent = latex;
  semantics.append(annotation);
  math.append(semantics);
  mathml.append(math);

  const html = document.createElement('span');
  html.className = 'katex-html';
  html.setAttribute('aria-hidden', 'true');
  const visualTextNode = document.createTextNode(visualText);
  html.append(visualTextNode);
  katex.append(mathml, html);

  if (!display) return { root: katex, visualText: visualTextNode };

  const displayRoot = document.createElement('span');
  displayRoot.className = 'katex-display';
  displayRoot.append(katex);
  return { root: displayRoot, visualText: visualTextNode };
}

/**
 * 选择同一文本节点中的指定范围。
 *
 * @param {Text} textNode 文本节点。
 * @param {number} start 起始偏移。
 * @param {number} end 结束偏移。
 * @returns {Selection}
 */
function selectText(textNode: Text, start: number, end: number): Selection {
  return selectRange(textNode, start, textNode, end);
}

/**
 * 创建并安装跨节点选区。
 *
 * @param {Node} startNode 起始节点。
 * @param {number} startOffset 起始偏移。
 * @param {Node} endNode 结束节点。
 * @param {number} endOffset 结束偏移。
 * @returns {Selection}
 */
function selectRange(
  startNode: Node,
  startOffset: number,
  endNode: Node,
  endOffset: number,
): Selection {
  const selection = window.getSelection();
  if (!selection) throw new Error('Selection API unavailable');

  const range = document.createRange();
  range.setStart(startNode, startOffset);
  range.setEnd(endNode, endOffset);
  selection.removeAllRanges();
  selection.addRange(range);
  return selection;
}
