/**
 * 数学公式选区复制模块：
 * 仅在 ChatGPT 页面选区包含可恢复源码的数学公式时接管复制。
 */

import {
  extractLatexFromMathContainer,
  findMathCopyBoundary,
  findTopLevelMathElements,
  isDisplayMathElement,
  wrapLatexForMarkdown,
} from './math';

const EDITABLE_SELECTOR =
  'input, textarea, [contenteditable]:not([contenteditable="false"]), [role="textbox"]';
const BLOCK_TEXT_TAGS = new Set([
  'address',
  'article',
  'aside',
  'blockquote',
  'div',
  'footer',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'header',
  'li',
  'main',
  'nav',
  'ol',
  'p',
  'pre',
  'section',
  'table',
  'tr',
  'ul',
]);

export interface MathSelectionClipboardPayload {
  textPlain: string;
  textHtml: string;
}

let isSelectionCopyInstalled = false;

/**
 * 安装数学公式选区复制监听器。
 *
 * @returns {void}
 */
export function installMathSelectionCopy(): void {
  if (isSelectionCopyInstalled) return;
  window.addEventListener('copy', handleMathSelectionCopy, true);
  isSelectionCopyInstalled = true;
}

/**
 * 处理用户触发的复制事件；无法安全恢复公式时保留浏览器原生行为。
 *
 * @param {ClipboardEvent} event 复制事件。
 * @returns {void}
 */
export function handleMathSelectionCopy(event: ClipboardEvent): void {
  if (!event.clipboardData) return;

  const selection = window.getSelection();
  if (!selection) return;

  const payload = createMathSelectionClipboardPayload(selection);
  if (!payload) return;

  try {
    event.clipboardData.setData('text/plain', payload.textPlain);
    event.clipboardData.setData('text/html', payload.textHtml);
    event.preventDefault();
    event.stopImmediatePropagation();
  } catch (error) {
    console.warn('[MD-COPY] formula selection copy failed', error);
  }
}

/**
 * 根据当前选区生成数学感知的剪贴板内容。
 *
 * @param {Selection} selection 浏览器当前选区。
 * @returns {MathSelectionClipboardPayload | null}
 */
export function createMathSelectionClipboardPayload(
  selection: Selection,
): MathSelectionClipboardPayload | null {
  if (selection.isCollapsed || selection.rangeCount !== 1) return null;

  const sourceRange = selection.getRangeAt(0);
  if (isEditableNode(sourceRange.startContainer) || isEditableNode(sourceRange.endContainer)) {
    return null;
  }

  const expandedRange = sourceRange.cloneRange();
  expandRangeToFormulaBoundaries(expandedRange);

  const selectedFragment = expandedRange.cloneContents();
  const textHtml = serializeFragmentHtml(selectedFragment);
  const plainFragment = selectedFragment.cloneNode(true) as DocumentFragment;
  if (!replaceMathWithLatex(plainFragment)) return null;

  const textPlain = serializeFragmentText(plainFragment);
  if (!textPlain) return null;

  return { textPlain, textHtml };
}

/**
 * 将落在公式内部的选区端点扩展到完整公式边界。
 *
 * @param {Range} range 待扩展选区。
 * @returns {void}
 */
function expandRangeToFormulaBoundaries(range: Range): void {
  const startBoundary = findMathCopyBoundary(range.startContainer);
  const endBoundary = findMathCopyBoundary(range.endContainer);

  if (startBoundary) range.setStartBefore(startBoundary);

  if (endBoundary) range.setEndAfter(endBoundary);
}

/**
 * 判断节点是否处于用户可编辑区域，避免覆盖输入框复制行为。
 *
 * @param {Node} node 待判断节点。
 * @returns {boolean}
 */
function isEditableNode(node: Node): boolean {
  const element = getContainingElement(node);
  if (!element) return false;
  if (element.closest(EDITABLE_SELECTOR)) return true;
  return element instanceof HTMLElement && element.isContentEditable;
}

/**
 * 将选区克隆中的公式替换为 Markdown LaTeX 文本。
 * 任一公式缺少 annotation 或源码属性时整体失败，以便回退原生复制。
 *
 * @param {DocumentFragment} fragment 选区克隆。
 * @returns {boolean} 是否至少成功转换一个公式。
 */
function replaceMathWithLatex(fragment: DocumentFragment): boolean {
  const formulas = findTopLevelMathElements(fragment).map((element) => ({
    element,
    display: isDisplayMathElement(element),
  }));
  if (formulas.length === 0) return false;

  const replacements = formulas.map(({ element, display }) => {
    const latex = extractLatexFromMathContainer(element);
    return { element, latex, text: wrapLatexForMarkdown(latex, display) };
  });
  if (replacements.some(({ latex }) => !latex)) return false;

  for (const { element, text } of replacements) {
    element.replaceWith(element.ownerDocument.createTextNode(text));
  }

  return true;
}

/**
 * 将选区片段序列化为可放入 text/html 的 HTML。
 *
 * @param {DocumentFragment} fragment 选区克隆。
 * @returns {string}
 */
function serializeFragmentHtml(fragment: DocumentFragment): string {
  const container = fragment.ownerDocument.createElement('div');
  container.append(fragment.cloneNode(true));
  return container.innerHTML;
}

/**
 * 将已替换公式的选区片段序列化为纯文本，并保留常见块级换行。
 *
 * @param {DocumentFragment} fragment 选区克隆。
 * @returns {string}
 */
function serializeFragmentText(fragment: DocumentFragment): string {
  const raw = Array.from(fragment.childNodes).map(serializeTextNode).join('');
  return raw
    .replace(/\u00a0/g, ' ')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * 按浏览器纯文本复制语义近似序列化单个节点。
 *
 * @param {ChildNode} node 当前节点。
 * @returns {string}
 */
function serializeTextNode(node: ChildNode): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
  if (node.nodeType !== Node.ELEMENT_NODE) return '';

  const element = node as HTMLElement;
  const tag = element.tagName.toLowerCase();
  if (['button', 'script', 'style', 'svg'].includes(tag)) return '';
  if (tag === 'br') return '\n';

  const children = Array.from(element.childNodes).map(serializeTextNode).join('');
  if (tag === 'td' || tag === 'th') return `${children}\t`;
  if (BLOCK_TEXT_TAGS.has(tag)) return `\n${children}\n`;
  return children;
}

/**
 * 将任意 DOM 节点归一为可查询祖先的元素。
 *
 * @param {Node} node DOM 节点。
 * @returns {Element | null}
 */
function getContainingElement(node: Node): Element | null {
  if (node.nodeType === Node.ELEMENT_NODE) return node as Element;
  return node.parentElement;
}
