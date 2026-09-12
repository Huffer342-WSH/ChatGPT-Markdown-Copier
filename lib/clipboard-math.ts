import { renderToString } from 'katex';
import {
  extractLatexFromMathContainer,
  findTopLevelMathElements,
  isDisplayMathElement,
  wrapLatexForMarkdown,
} from './math';

/**
 * 将剪贴板副本中的 KaTeX 布局替换为独立 MathML，避免依赖网页 CSS 或隐藏的视觉分支。
 * 转换失败时输出可见 LaTeX，不让公式静默丢失；不修改 Markdown 分支或原页面。
 * @param {HTMLElement} container 剪贴板 HTML 副本。
 * @returns {void}
 */
export function replaceClipboardMath(container: HTMLElement): void {
  for (const formula of findTopLevelMathElements(container)) {
    const latex = extractLatexFromMathContainer(formula);
    if (!latex) continue;
    const display = isDisplayMathElement(formula);
    try {
      const parsed = container.ownerDocument.createElement('div');
      parsed.innerHTML = renderToString(latex, {
        output: 'mathml',
        displayMode: display,
        throwOnError: true,
        trust: false,
        strict: 'ignore',
        maxExpand: 1000,
      });
      const math = parsed.querySelector('math');
      if (!math) throw new Error('MathML output missing');
      math.setAttribute('xmlns', 'http://www.w3.org/1998/Math/MathML');
      math.setAttribute('display', display ? 'block' : 'inline');
      formula.replaceWith(math);
    } catch {
      const fallback = container.ownerDocument.createElement(display ? 'div' : 'span');
      fallback.textContent = wrapLatexForMarkdown(latex, display);
      formula.replaceWith(fallback);
    }
  }
}
