// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createMathSelectionClipboardPayload, handleMathSelectionCopy } from '../lib/selection-copy';

beforeEach(() => { document.body.innerHTML = '<div class="markdown"></div>'; });
afterEach(() => {
  window.getSelection()?.removeAllRanges();
  document.body.replaceChildren();
});

/**
 * 装载最小结构并选取指定节点内容，保留生产 Range/复制实现。
 * @param {string} html 用例 DOM。
 * @param {string} selector 需要完整选择的节点。
 * @returns {Selection} 当前选区。
 */
function selectContent(html: string, selector: string): Selection {
  document.querySelector('.markdown')!.innerHTML = html;
  const range = document.createRange();
  range.selectNodeContents(document.querySelector(selector)!);
  const selection = window.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
  return selection;
}

const table = '<table><thead><tr><th>名称</th><th>数值</th></tr></thead><tbody>' +
  '<tr><td><strong>甲</strong></td><td>1</td></tr><tr><td>乙</td><td>2</td></tr></tbody></table>';

describe('审查回归：列表保留块结构与顺序', () => {
  it('子列表后面的段落不会移到子列表前面', () => {
    const selection = selectContent('<ol><li><p>前文</p><ul><li>子项</li></ul><p>后文</p></li></ol>', 'ol');
    expect(createMathSelectionClipboardPayload(selection)?.textPlain).toBe('1. 前文\n   - 子项\n\n   后文');
  });

  it('列表内代码保留语言、围栏、空行及代码缩进', () => {
    const selection = selectContent('<ol><li><p>代码：</p><pre><code class="language-js">const x = 1;\n\n  run(x);</code></pre><p>结束</p></li></ol>', 'ol');
    expect(createMathSelectionClipboardPayload(selection)?.textPlain)
      .toBe('1. 代码：\n\n   ```js\n   const x = 1;\n\n     run(x);\n   ```\n\n   结束');
  });
});

describe('表格选区和双格式剪贴板', () => {
  it('单个单元格只复制文本，不带强调标记、表格或表头', () => {
    const selection = selectContent(table, 'tbody td');
    const payload = createMathSelectionClipboardPayload(selection);
    expect(payload?.textPlain).toBe('甲');
    expect(payload?.textHtml).not.toMatch(/<(?:table|tr|td|th|thead|tbody)\b/);
    expect(payload?.textHtml).toBe('<strong>甲</strong>');
  });

  it('一个表头单元格也按文本处理', () => {
    const selection = selectContent(table, 'th');
    expect(createMathSelectionClipboardPayload(selection)?.textPlain).toBe('名称');
  });

  it('只复制数据行时不合成表头或分隔线，HTML 保留数据行', () => {
    const selection = selectContent(table, 'tbody');
    const payload = createMathSelectionClipboardPayload(selection);
    expect(payload?.textPlain).toBe('| **甲** | 1 |\n| 乙 | 2 |');
    const container = document.createElement('div');
    container.innerHTML = payload!.textHtml;
    expect(container.querySelector('th,thead')).toBeNull();
    expect(Array.from(container.querySelectorAll('td')).every((cell) => cell.style.backgroundColor === 'rgb(255, 255, 255)')).toBe(true);
    expect(container.querySelectorAll('tr').length).toBe(2);
    expect(Array.from(container.querySelectorAll('td')).map((cell) => cell.textContent)).toEqual(['甲', '1', '乙', '2']);
  });

  it('同一行的多个单元格输出管道行而非表头', () => {
    const selection = selectContent(table, 'tbody tr');
    expect(createMathSelectionClipboardPayload(selection)?.textPlain).toBe('| **甲** | 1 |');
  });

  it('选中表头和数据行时输出完整 GFM 表格', () => {
    const selection = selectContent(table, 'table');
    expect(createMathSelectionClipboardPayload(selection)?.textPlain)
      .toBe('| 名称 | 数值 |\n| --- | --- |\n| **甲** | 1 |\n| 乙 | 2 |');
  });

  it('同一次复制事件写入 Markdown 和 HTML 表格，且不改变页面或选区', () => {
    const selection = selectContent(table, 'table');
    const before = document.body.innerHTML;
    const range = selection.getRangeAt(0).cloneRange();
    const values = new Map<string, string>();
    const event = new Event('copy', { cancelable: true });
    Object.defineProperty(event, 'clipboardData', { value: {
      setData: (type: string, text: string) => { values.set(type, text); },
    } });
    handleMathSelectionCopy(event as ClipboardEvent);
    expect(event.defaultPrevented).toBe(true);
    expect(values.get('text/plain')).toBe('| 名称 | 数值 |\n| --- | --- |\n| **甲** | 1 |\n| 乙 | 2 |');
    const container = document.createElement('div');
    container.innerHTML = values.get('text/html')!;
    expect(container.querySelectorAll('tr').length).toBe(3);
    expect(container.querySelectorAll('th').length).toBe(2);
    expect(container.querySelectorAll('td').length).toBe(4);
    expect(container.querySelector('table')!.getAttribute('border')).toBe('1');
    for (const cell of container.querySelectorAll<HTMLElement>('th,td')) {
      expect(cell.style.borderWidth).toBe('1px');
      expect(cell.style.borderStyle).toBe('solid');
    }
    const header = container.querySelector('th')!;
    expect(header.style.fontWeight).toBe('bold');
    expect(header.style.backgroundColor).not.toBe(container.querySelector('td')!.style.backgroundColor);
    expect(document.body.innerHTML).toBe(before);
    expect(selection.getRangeAt(0).compareBoundaryPoints(Range.START_TO_START, range)).toBe(0);
    expect(selection.getRangeAt(0).compareBoundaryPoints(Range.END_TO_END, range)).toBe(0);
  });
});
