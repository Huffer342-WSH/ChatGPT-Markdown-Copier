/**
 * Markdown 选区复制模块：恢复回复选区的格式，并保留完整公式复制行为。
 */

import {
  extractLatexFromMathContainer,
  findMathCopyBoundary,
  findTopLevelMathElements,
  isDisplayMathElement,
  wrapLatexForMarkdown,
} from './math';
import { getOrderedListItemNumbers, serializeSelectionDomToMarkdown } from './markdown';
import { replaceClipboardMath } from './clipboard-math';

const EDITABLE_SELECTOR =
  'input, textarea, [contenteditable]:not([contenteditable="false"]), [role="textbox"]';
const CONTENT_SELECTOR = '.markdown, [data-message-author-role="assistant"]';
const FORMAT_SELECTOR = 'h1,h2,h3,h4,h5,h6,strong,b,em,i,del,s,a,code,pre,ul,ol,blockquote,table,hr';

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
 * 根据选区生成 Markdown；无公式时仅接管同一回复正文内的格式化内容。
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

  const startItem = getContainingElement(sourceRange.startContainer)?.closest('li');
  const endItem = getContainingElement(sourceRange.endContainer)?.closest('li');
  // 同一列表项内部的文字不补列表外壳；显式选取整个 li 节点内容则保留结构。
  const inlineItem = startItem && startItem === endItem &&
    (sourceRange.startContainer !== startItem || sourceRange.endContainer !== startItem) ? startItem : null;
  const selectedFragment = cloneSelectionWithContext(expandedRange, inlineItem);
  const cells = selectedFragment.querySelectorAll('td,th');
  const singleCell = cells.length === 1 &&
    !!getContainingElement(sourceRange.commonAncestorContainer)?.closest('table');
  if (singleCell) {
    // 单元格内选区仅保留内容，不补行、表头或整个表格。
    const contents = document.createDocumentFragment();
    contents.append(...Array.from(cells[0].childNodes));
    selectedFragment.replaceChildren(contents);
  }
  const formulas = findTopLevelMathElements(selectedFragment);
  if (formulas.length === 0) {
    const startContent = getContainingElement(sourceRange.startContainer)?.closest(CONTENT_SELECTOR);
    const endContent = getContainingElement(sourceRange.endContainer)?.closest(CONTENT_SELECTOR);
    if (!startContent || startContent !== endContent ||
        (!inlineItem && !singleCell && !selectedFragment.querySelector(FORMAT_SELECTOR))) return null;
  }
  const textHtml = serializeFragmentHtml(selectedFragment);
  const plainFragment = selectedFragment.cloneNode(true) as DocumentFragment;
  if (formulas.length > 0 && !replaceMathWithLatex(plainFragment)) return null;

  const textPlain = singleCell ? serializeCellText(plainFragment).trim() : serializeSelectionDomToMarkdown(plainFragment);
  if (!textPlain) return null;

  return { textPlain, textHtml };
}

/**
 * 单元格按文本复制，保留换行但不生成强调或列表标记。
 * @param {Node} node 经过公式替换的选区副本。
 * @returns {string} 单元格文本。
 */
function serializeCellText(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
  if (node instanceof Element) {
    if (node.matches('button,script,style,svg,[aria-hidden="true"]')) return '';
    if (node.tagName === 'BR') return '\n';
  }
  const text = Array.from(node.childNodes).map(serializeCellText).join('');
  return node instanceof Element && node.matches('p,div,pre') ? `${text}\n` : text;
}

/**
 * 克隆选中文字并补回共同祖先的格式外壳，不复制祖先的兄弟节点或其他正文。
 * Range.cloneContents 不包含共同祖先本身，因此仅选中 strong/code 内部文字时需要补壳。
 * @param {Range} range 已按公式边界调整的克隆选区。
 * @param {Element | null} inlineItem 局部文字所在的列表项，补壳到此即停止。
 * @returns {DocumentFragment} 包含必要上下文的选区片段。
 */
function cloneSelectionWithContext(range: Range, inlineItem: Element | null): DocumentFragment {
  const fragment = range.cloneContents();
  let ancestor = getContainingElement(range.commonAncestorContainer);
  const scope = ancestor?.closest(CONTENT_SELECTOR) ?? document.body;
  while (ancestor && ancestor !== inlineItem && !ancestor.matches(`${CONTENT_SELECTOR},body,html,section[data-turn]`)) {
    const shell = ancestor.cloneNode(false) as Element;
    shell.append(fragment);
    fragment.append(shell);
    ancestor = ancestor.parentElement;
  }
  // 克隆可能只包含列表中间的若干项；按原 DOM 的编号补齐 start，不能重新从 1 编号。
  const sourceLists = Array.from(scope.querySelectorAll<HTMLElement>('ol')).filter((list) => range.intersectsNode(list));
  const clonedLists = Array.from(fragment.querySelectorAll<HTMLElement>('ol'));
  if (sourceLists.length === clonedLists.length) {
    sourceLists.forEach((list, index) => {
      const items = Array.from(list.children).filter((child) => child.tagName.toLowerCase() === 'li');
      const firstSelected = items.findIndex((item) => range.intersectsNode(item));
      if (firstSelected >= 0) clonedLists[index].setAttribute('start', String(getOrderedListItemNumbers(list)[firstSelected]));
    });
  }
  return fragment;
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
  replaceClipboardMath(container);
  styleClipboardTables(container);
  return container.innerHTML;
}

/**
 * 为剪贴板副本添加独立于网页 CSS 的表格样式，便于 Word 等富文本软件粘贴。
 * 只突出原有 th 或 thead 中的单元格，不将数据行改成表头。
 * @param {HTMLElement} container 剪贴板 HTML 副本容器。
 * @returns {void}
 */
function styleClipboardTables(container: HTMLElement): void {
  for (const table of container.querySelectorAll<HTMLTableElement>('table')) {
    table.setAttribute('border', '1');
    table.setAttribute('cellspacing', '0');
    table.setAttribute('cellpadding', '6');
    table.style.borderCollapse = 'collapse';
    table.style.border = '1px solid #808080';
    table.style.color = '#000000';
    table.style.backgroundColor = '#ffffff';
    for (const cell of table.querySelectorAll<HTMLTableCellElement>('th,td')) {
      if (cell.closest('table') !== table) continue;
      const header = cell.tagName === 'TH' || cell.parentElement?.parentElement?.tagName === 'THEAD';
      cell.style.border = '1px solid #808080';
      cell.style.padding = '6px 8px';
      cell.style.verticalAlign = 'top';
      cell.style.color = '#000000';
      cell.style.backgroundColor = header ? '#e8edf3' : '#ffffff';
      if (header) cell.style.fontWeight = 'bold';
    }
  }
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
