/**
 * 数学公式 DOM 适配模块：
 * 集中处理 KaTeX 及其常见源码属性的边界定位、LaTeX 提取和分隔符生成。
 */

const KATEX_SELECTOR = '.katex';
const KATEX_DISPLAY_SELECTOR = '.katex-display';
const MATH_SOURCE_ATTRIBUTE_SELECTOR =
  '[data-math-source], [data-tex], [data-latex], [data-math]';
const MATH_ELEMENT_SELECTOR = [
  KATEX_DISPLAY_SELECTOR,
  KATEX_SELECTOR,
  MATH_SOURCE_ATTRIBUTE_SELECTOR,
].join(', ');
const TEX_ANNOTATION_SELECTOR = 'annotation[encoding="application/x-tex" i]';

/**
 * 判断元素是否为行内数学公式根节点。
 *
 * @param {HTMLElement} element 待判断元素。
 * @returns {boolean}
 */
export function isInlineMathElement(element: HTMLElement): boolean {
  if (!isMathElement(element)) return false;
  return !isDisplayMathElement(element);
}

/**
 * 判断元素是否为块级数学公式根节点。
 *
 * @param {HTMLElement} element 待判断元素。
 * @returns {boolean}
 */
export function isDisplayMathElement(element: HTMLElement): boolean {
  if (element.classList.contains('katex-display')) return true;
  if (element.closest(KATEX_DISPLAY_SELECTOR)) return true;
  if (element.querySelector(KATEX_DISPLAY_SELECTOR)) return true;

  const displayValue =
    element.getAttribute('data-display') ?? element.getAttribute('data-display-mode');
  if (displayValue === 'true' || displayValue === 'display' || displayValue === 'block') {
    return true;
  }

  return element.hasAttribute('data-math') && element.tagName.toLowerCase() === 'div';
}

/**
 * 判断元素是否为扩展能够识别的数学公式节点。
 *
 * @param {HTMLElement} element 待判断元素。
 * @returns {boolean}
 */
export function isMathElement(element: HTMLElement): boolean {
  return element.matches(MATH_ELEMENT_SELECTOR);
}

/**
 * 从公式容器读取 LaTeX 真值。
 * 优先使用 KaTeX annotation，并兼容部分页面使用的源码属性。
 *
 * @param {ParentNode} container 公式容器或其上层节点。
 * @returns {string}
 */
export function extractLatexFromMathContainer(container: ParentNode): string {
  const annotation = container.querySelector<HTMLElement>(TEX_ANNOTATION_SELECTOR);
  const annotationText = normalizeMathText(annotation?.textContent ?? '');
  if (annotationText) return annotationText;

  const ownSource = container instanceof HTMLElement ? readLatexSourceAttribute(container) : '';
  if (ownSource) return ownSource;

  const sourceElement = container.querySelector<HTMLElement>(MATH_SOURCE_ATTRIBUTE_SELECTOR);
  const nestedSource = sourceElement ? readLatexSourceAttribute(sourceElement) : '';
  if (nestedSource) return nestedSource;

  if (container instanceof HTMLElement && container.classList.contains('katex')) {
    return normalizeMathText(container.getAttribute('aria-label') ?? '');
  }

  return '';
}

/**
 * 从选区端点向上查找应当作为原子整体复制的公式边界。
 * 块级公式优先返回 `.katex-display`，行内公式返回公式根节点。
 *
 * @param {Node} node 选区端点节点。
 * @returns {HTMLElement | null}
 */
export function findMathCopyBoundary(node: Node): HTMLElement | null {
  const element = getContainingElement(node);
  const sourceWrapper = element?.closest<HTMLElement>(MATH_SOURCE_ATTRIBUTE_SELECTOR);
  if (sourceWrapper) return sourceWrapper;

  const katex = element?.closest<HTMLElement>(KATEX_SELECTOR);
  if (katex) return katex.closest<HTMLElement>(KATEX_DISPLAY_SELECTOR) ?? katex;
  return null;
}

/**
 * 获取容器中最外层的公式根节点，避免块级 KaTeX 与其内部 `.katex` 被重复转换。
 *
 * @param {ParentNode} container 待扫描容器。
 * @returns {HTMLElement[]}
 */
export function findTopLevelMathElements(container: ParentNode): HTMLElement[] {
  const candidates = Array.from(container.querySelectorAll<HTMLElement>(MATH_ELEMENT_SELECTOR));
  return candidates.filter((element) => {
    const parentMath = element.parentElement?.closest<HTMLElement>(MATH_ELEMENT_SELECTOR);
    return !parentMath || !containsNode(container, parentMath);
  });
}

/**
 * 使用 Markdown 数学分隔符包裹 LaTeX。
 *
 * @param {string} latex 原始 LaTeX。
 * @param {boolean} display 是否为块级公式。
 * @returns {string}
 */
export function wrapLatexForMarkdown(latex: string, display: boolean): string {
  return display ? `$$${latex}$$` : `$${latex}$`;
}

/**
 * 将任意 DOM 节点归一为可执行 closest 查询的元素。
 *
 * @param {Node} node DOM 节点。
 * @returns {Element | null}
 */
function getContainingElement(node: Node): Element | null {
  if (node.nodeType === Node.ELEMENT_NODE) return node as Element;
  return node.parentElement;
}

/**
 * 按优先级读取元素上的 LaTeX 源码属性。
 *
 * @param {HTMLElement} element 公式元素。
 * @returns {string}
 */
function readLatexSourceAttribute(element: HTMLElement): string {
  const source =
    element.getAttribute('data-math-source') ??
    element.getAttribute('data-tex') ??
    element.getAttribute('data-latex') ??
    element.getAttribute('data-math') ??
    '';
  return normalizeMathText(source);
}

/**
 * 判断父节点容器是否包含目标节点。
 *
 * @param {ParentNode} container 父节点容器。
 * @param {Node} node 目标节点。
 * @returns {boolean}
 */
function containsNode(container: ParentNode, node: Node): boolean {
  if (container instanceof Node) return container.contains(node);
  return false;
}

/**
 * 统一公式源码中的换行与空格字符。
 *
 * @param {string} input 原始公式文本。
 * @returns {string}
 */
function normalizeMathText(input: string): string {
  return input
    .replace(/\u00a0/g, ' ')
    .replace(/\u200b/g, '')
    .replace(/\r\n?/g, '\n')
    .trim();
}
