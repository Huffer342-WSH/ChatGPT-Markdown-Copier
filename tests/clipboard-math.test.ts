// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { createMathSelectionClipboardPayload } from '../src/lib/selection-copy';

afterEach(() => {
  window.getSelection()?.removeAllRanges();
  document.body.replaceChildren();
});

/**
 * 构造与当前网页相同的“仅 KaTeX HTML、无 MathML”输入，再运行实际选区复制。
 * @param {string} latex 从网页提取的公式源码。
 * @param {boolean} display 是否为块级公式。
 * @returns {{html: HTMLDivElement; markdown: string}} 两种剪贴板输出。
 */
function copyFormula(latex: string, display: boolean): { html: HTMLDivElement; markdown: string } {
  const root = document.createElement('div');
  root.className = 'markdown';
  const formula = document.createElement('span');
  formula.setAttribute('data-math-source', latex);
  formula.setAttribute('data-display', String(display));
  formula.innerHTML = '<span class="katex"><span class="katex-html" aria-hidden="true">visual only</span></span>';
  root.append(formula);
  document.body.replaceChildren(root);
  const before = root.outerHTML;
  const range = document.createRange();
  range.selectNodeContents(root);
  const selection = window.getSelection()!;
  selection.addRange(range);
  const payload = createMathSelectionClipboardPayload(selection)!;
  const html = document.createElement('div');
  html.innerHTML = payload.textHtml;
  expect(root.outerHTML).toBe(before);
  expect(html.querySelector('.katex,.katex-html,[aria-hidden="true"]')).toBeNull();
  return { html, markdown: payload.textPlain };
}

describe('Word 富文本公式：真实 KaTeX 转换，无 Office 模拟器', () => {
  it.each([
    ['分数', String.raw`\frac{1}{2}+\frac{1}{3}=\frac{5}{6}`, false, 'mfrac'],
    ['根式', String.raw`\sqrt{2},\quad \sqrt[3]{8}=2`, false, 'mroot'],
    ['上下标', String.raw`x^2,\ a_n,\ x_i^{\,2}`, false, 'msubsup'],
    ['求和', String.raw`\displaystyle \sum_{k=1}^{n}k=\frac{n(n+1)}2`, false, 'munderover'],
    ['积分', String.raw`\displaystyle \int_0^1x^2\,dx=\frac13`, false, 'msubsup'],
    ['矩阵', String.raw`\displaystyle A=\begin{pmatrix}1&2\\3&4\end{pmatrix}`, false, 'mtable'],
    ['分段函数', String.raw`f(x)=\begin{cases}x,&x\ge0\\-x,&x<0\end{cases}`, true, 'mtable'],
    ['多行推导', String.raw`\begin{aligned}(x+1)^2&=(x+1)(x+1)\\&=x^2+x+x+1\\&=x^2+2x+1\end{aligned}`, true, 'mtable'],
  ] as const)('%s 生成带命名空间的独立 MathML，Markdown 不变', (_name, latex, display, structure) => {
    const { html, markdown } = copyFormula(latex, display);
    const math = html.querySelector('math')!;
    expect(math.namespaceURI).toBe('http://www.w3.org/1998/Math/MathML');
    expect(math.getAttribute('xmlns')).toBe('http://www.w3.org/1998/Math/MathML');
    expect(math.getAttribute('display')).toBe(display ? 'block' : 'inline');
    expect(math.querySelector(structure)).not.toBeNull();
    expect(math.querySelector('annotation')?.textContent).toBe(latex);
    expect(html.querySelectorAll('math')).toHaveLength(1);
    expect(markdown).toBe(display ? `$$${latex}$$` : `$${latex}$`);
  });

  it('无法解析的公式保留可见 LaTeX，HTML 不再残留不可移植的布局', () => {
    const latex = String.raw`\unknowncommand{x}`;
    const { html, markdown } = copyFormula(latex, false);
    expect(html.querySelector('math')).toBeNull();
    expect(html.textContent).toBe(`$${latex}$`);
    expect(markdown).toBe(`$${latex}$`);
  });
});
