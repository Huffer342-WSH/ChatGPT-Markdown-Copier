// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest';
import { serializeMessageDomToMarkdown } from './markdown';

const INLINE_LATEX = String.raw`x^{k+1}=L_{\mathrm{cyc}}^{-1}R_{\mathrm{cyc}}x^k+L_{\mathrm{cyc}}^{-1}A^\top b`;
const DISPLAY_LATEX = String.raw`H = \begin{pmatrix} 1 & 0.5 \\ 0.5 & 1 \end{pmatrix}`;

beforeEach(() => {
  document.body.replaceChildren();
});

describe('serializeMessageDomToMarkdown 数学公式回归', () => {
  it('保留原有按钮对行内 KaTeX annotation 的转换', () => {
    const messageRoot = createMessageRoot();
    const paragraph = document.createElement('p');
    paragraph.append(
      document.createTextNode('更新公式：'),
      createKatexFormula(INLINE_LATEX, false),
      document.createTextNode('。'),
    );
    messageRoot.append(paragraph);

    expect(serializeMessageDomToMarkdown(messageRoot)).toBe(`更新公式：$${INLINE_LATEX}$。`);
  });

  it('保留原有按钮对块级矩阵公式的转换', () => {
    const messageRoot = createMessageRoot();
    messageRoot.append(createKatexFormula(DISPLAY_LATEX, true));

    expect(serializeMessageDomToMarkdown(messageRoot)).toBe(`$$\n${DISPLAY_LATEX}\n$$`);
  });

  it('annotation 缺失时使用 data-tex 源码而不是扁平视觉文本', () => {
    const messageRoot = createMessageRoot();
    const paragraph = document.createElement('p');
    const formula = createKatexFormula('', false);
    formula.querySelector('annotation')?.remove();
    formula.setAttribute('data-tex', INLINE_LATEX);
    paragraph.append(formula);
    messageRoot.append(paragraph);

    expect(serializeMessageDomToMarkdown(messageRoot)).toBe(`$${INLINE_LATEX}$`);
  });

  it('支持新版 ChatGPT 的 data-math-source 外层包装', () => {
    const messageRoot = createMessageRoot();
    const wrapper = document.createElement('span');
    wrapper.setAttribute('role', 'math');
    wrapper.setAttribute('data-math-source', DISPLAY_LATEX);
    wrapper.style.display = 'block';
    const formula = createKatexFormula('', true);
    formula.querySelector('annotation')?.remove();
    wrapper.append(formula);
    messageRoot.append(wrapper);

    expect(serializeMessageDomToMarkdown(messageRoot)).toBe(`$$\n${DISPLAY_LATEX}\n$$`);
  });
});

/**
 * 创建最小 ChatGPT Markdown 正文容器。
 *
 * @returns {HTMLElement}
 */
function createMessageRoot(): HTMLElement {
  const messageRoot = document.createElement('div');
  messageRoot.className = 'markdown prose';
  document.body.append(messageRoot);
  return messageRoot;
}

/**
 * 创建同时包含 MathML annotation 与视觉分支的 KaTeX 公式。
 *
 * @param {string} latex LaTeX 源码。
 * @param {boolean} display 是否为块级公式。
 * @returns {HTMLElement}
 */
function createKatexFormula(latex: string, display: boolean): HTMLElement {
  const katex = document.createElement('span');
  katex.className = 'katex';

  const mathml = document.createElement('span');
  mathml.className = 'katex-mathml';
  const annotation = document.createElement('annotation');
  annotation.setAttribute('encoding', 'application/x-tex');
  annotation.textContent = latex;
  mathml.append(annotation);

  const html = document.createElement('span');
  html.className = 'katex-html';
  html.setAttribute('aria-hidden', 'true');
  html.textContent = 'xk+1=Lcyc−1Rcycxk+Lcyc−1A⊤b';
  katex.append(mathml, html);

  if (!display) return katex;

  const displayRoot = document.createElement('span');
  displayRoot.className = 'katex-display';
  displayRoot.append(katex);
  return displayRoot;
}
