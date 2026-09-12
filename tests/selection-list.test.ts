// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import html from './fixtures/structured-list.html?raw';
import expected from './fixtures/structured-list.md?raw';
import { createMathSelectionClipboardPayload } from '../src/lib/selection-copy';

beforeEach(() => { document.body.innerHTML = html; });
afterEach(() => {
  window.getSelection()?.removeAllRanges();
  document.body.replaceChildren();
});

/**
 * 安装指定文本边界的本地选区，运行生产复制流程；不读取系统剪贴板。
 * @param {Node} start 首个文本节点。
 * @param {Node} end 最后一个文本节点。
 * @param {number} startOffset 起点字符偏移。
 * @param {number} endOffset 终点字符偏移。
 * @returns {ReturnType<typeof createMathSelectionClipboardPayload>} Markdown 与 HTML。
 */
function copyRange(start: Node, end: Node, startOffset = 0, endOffset = end.textContent!.length): ReturnType<typeof createMathSelectionClipboardPayload> {
  const range = document.createRange();
  range.setStart(start, startOffset);
  range.setEnd(end, endOffset);
  const selection = window.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
  return copySelection(selection);
}

/**
 * 调用生产入口，统一验证正文、选区边界及选择方向不变。
 * @param {Selection} selection 已安装的选区。
 * @returns {ReturnType<typeof createMathSelectionClipboardPayload>} 复制结果。
 */
function copySelection(selection: Selection): ReturnType<typeof createMathSelectionClipboardPayload> {
  const beforeHtml = document.body.innerHTML;
  const range = selection.getRangeAt(0);
  const before = [range.startContainer, range.startOffset, range.endContainer, range.endOffset,
    selection.anchorNode, selection.anchorOffset, selection.focusNode, selection.focusOffset];
  const payload = createMathSelectionClipboardPayload(selection);
  expect(document.body.innerHTML).toBe(beforeHtml);
  const after = selection.getRangeAt(0);
  const actual = [after.startContainer, after.startOffset, after.endContainer, after.endOffset,
    selection.anchorNode, selection.anchorOffset, selection.focusNode, selection.focusOffset];
  actual.forEach((value, index) => expect(value).toBe(before[index]));
  return payload;
}

describe('Edge 真实 DOM 精简样本：嵌套列表选区复制', () => {
  it('保留完整序号、混合列表缩进和格式，且不扩大选区', () => {
    const title = document.querySelector('h3')!.firstChild!;
    const last = document.querySelector('ol ol li:last-child p')!.firstChild!;
    const payload = copyRange(title, last);
    // Git 在 Windows 检出时可能将样本转为 CRLF，仅统一预期文本的换行符。
    expect(payload?.textPlain).toBe(expected.replace(/\r\n/g, '\n').trimEnd());
    expect(window.getSelection()?.getRangeAt(0).startContainer).toBe(title);
    expect(window.getSelection()?.getRangeAt(0).endContainer).toBe(last);
    expect(payload?.textHtml).toContain('<em><strong>粗斜体</strong></em>');
  });

  it('只选第二个外层列表项时保留原始编号 2，不带入第一个列表项', () => {
    const start = document.querySelector('code')!.firstChild!;
    const last = document.querySelector('ol ol li:last-child p')!.firstChild!;
    expect(copyRange(start, last)?.textPlain).toBe('2. `行内代码`\n   1. 多级编号\n   2. 第二项');
  });

  it('只选嵌套列表项中的部分文字时，不添加任何外层编号', () => {
    const text = document.querySelector('ol ol li:last-child p')!.firstChild!;
    const payload = copyRange(text, text, 1);
    expect(payload?.textPlain).toBe('二项');
    expect(payload?.textHtml).not.toMatch(/<(?:ol|ul|li)\b/);
    expect(window.getSelection()!.toString()).toBe('二项');
  });

  it('单个列表项内跨格式选择时，保留强调但不保留列表祖先', () => {
    const paragraph = document.querySelector('ul li:last-child p')!;
    const start = paragraph.querySelector('strong')!.firstChild!;
    const end = paragraph.querySelector('em strong')!.firstChild!;
    const payload = copyRange(start, end);
    expect(payload?.textPlain).toBe('**粗体**、*斜体*、***粗斜体***');
    expect(payload?.textHtml).not.toMatch(/<(?:ol|ul|li)\b/);
  });

  it('显式选择完整列表项节点内容时仍保留编号', () => {
    const item = document.querySelector('.markdown > ol > li:last-child')!;
    const selection = window.getSelection()!;
    const range = document.createRange();
    range.selectNodeContents(item);
    selection.addRange(range);
    expect(copySelection(selection)?.textPlain).toBe('2. `行内代码`\n   1. 多级编号\n   2. 第二项');
  });

  it('反向选择同一项内部文字时，仍不带序号且不改变选择方向', () => {
    const text = document.querySelector('ol ol li:last-child p')!.firstChild!;
    const selection = window.getSelection()!;
    selection.setBaseAndExtent(text, 3, text, 1);
    const payload = copySelection(selection);
    expect(payload?.textPlain).toBe('二项');
    expect(payload?.textHtml).not.toMatch(/<(?:ol|ul|li)\b/);
  });

  it('两个列表项之间的部分文字选择仍保留列表结构', () => {
    const first = document.querySelector('ul li:first-child p')!.firstChild!;
    const last = document.querySelector('ul li:last-child strong')!.firstChild!;
    expect(copyRange(first, last, 2, 1)?.textPlain).toBe('1. \n   - 子项\n   - **粗**');
  });

  it('单项中的行内代码默认不带反引号和外层序号', () => {
    const code = document.querySelector('code')!.firstChild!;
    expect(copyRange(code, code, 1, 3)?.textPlain).toBe('内代');
  });
});

describe('合成边界样本：列表编号与公式组合', () => {
  it.each([
    ['start="9"', '<li>甲</li><li>乙<ul><li>子项</li></ul></li>', '9. 甲\n10. 乙\n    - 子项'],
    ['reversed', '<li>甲</li><li>乙</li><li>丙</li>', '3. 甲\n2. 乙\n1. 丙'],
    ['start="4"', '<li>甲</li><li value="8">乙</li><li>丙</li>', '4. 甲\n8. 乙\n9. 丙'],
  ])('保留列表属性 %s 对编号和缩进的影响', (attributes, items, markdown) => {
    document.body.innerHTML = `<div class="markdown"><ol ${attributes}>${items}</ol></div>`;
    const list = document.querySelector('ol')!;
    const range = document.createRange();
    range.selectNodeContents(list);
    const selection = window.getSelection()!;
    selection.addRange(range);
    expect(copySelection(selection)?.textPlain).toBe(markdown);
  });

  it('同一项内局部选择公式，仍复制完整公式但不补列表编号', () => {
    document.body.innerHTML = '<div class="markdown"><ol><li><span data-math-source="x^2"><span class="katex">x2</span></span></li></ol></div>';
    const text = document.querySelector('.katex')!.firstChild!;
    const payload = copyRange(text, text, 1, 2);
    expect(payload?.textPlain).toBe('$x^2$');
    expect(payload?.textHtml).toContain('<msup>');
    expect(payload?.textHtml).toContain('application/x-tex');
    expect(payload?.textHtml).not.toMatch(/<(?:ol|ul|li)\b/);
  });

  it('可编辑列表项中的局部文字保持原生复制', () => {
    const item = document.querySelector('ul li:first-child')!;
    item.setAttribute('contenteditable', 'true');
    const text = item.querySelector('p')!.firstChild!;
    expect(copyRange(text, text, 1, 3)).toBeNull();
  });

  it('不接管回复正文之外的列表局部文字', () => {
    document.querySelector('.markdown')!.removeAttribute('class');
    const text = document.querySelector('code')!.firstChild!;
    expect(copyRange(text, text, 1, 3)).toBeNull();
  });
});
