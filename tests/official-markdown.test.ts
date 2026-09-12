import { describe, expect, it } from 'vitest';
import { normalizeOfficialMarkdown } from '../lib/official-markdown';

describe('官方 Markdown 行内公式修正', () => {
  it('转换用户示例中的多个行内公式，保留其余文字', () => {
    expect(normalizeOfficialMarkdown(String.raw`说明：矩阵把数字按行和列排列，这里 \(A\) 是一个 \(2\times2\) 矩阵。`))
      .toBe(String.raw`说明：矩阵把数字按行和列排列，这里 $A$ 是一个 $2\times2$ 矩阵。`);
  });

  it('保留行内代码，只转换代码以外的公式', () => {
    expect(normalizeOfficialMarkdown('示例 `\\(A\\)` 和 ``代码 ` \\(B\\)``；正文 \\(C\\)。'))
      .toBe('示例 `\\(A\\)` 和 ``代码 ` \\(B\\)``；正文 $C$。');
  });

  it.each(['```scss', '~~~text', '> ```text', '- ```text'])('保留 %s 围栏内的内容，关闭后恢复转换', (opening) => {
    const closing = opening.replace(/(?:scss|text)$/, '').replace(/^- /, '  ');
    const source = [opening, String.raw`\(code\)`, closing, String.raw`\(text\)`].join('\n');
    const expected = [opening, String.raw`\(code\)`, closing, '$text$'].join('\n');
    expect(normalizeOfficialMarkdown(source)).toBe(expected);
  });

  it('短围栏不能提前关闭代码区域', () => {
    const source = ['````text', '```', String.raw`\(code\)`, '````', String.raw`\(text\)`].join('\n');
    expect(normalizeOfficialMarkdown(source))
      .toBe(['````text', '```', String.raw`\(code\)`, '````', '$text$'].join('\n'));
  });

  it('保留缩进代码和未关闭的围栏', () => {
    const source = ['    \\(A\\)', '\t\\(B\\)', '```', String.raw`\(C\)`].join('\n');
    expect(normalizeOfficialMarkdown(source)).toBe(source);
  });

  it('保持原有数学分隔符、代码格式和 CRLF 换行', () => {
    const source = ['$A$', '$$B$$', String.raw`\[C\]`, String.raw`\(D\)`, ''].join('\r\n');
    expect(normalizeOfficialMarkdown(source)).toBe(['$A$', '$$B$$', String.raw`\[C\]`, '$D$', ''].join('\r\n'));
  });

  it('不猜测缺失分隔符、转义反斜杠或有歧义的公式', () => {
    const source = String.raw`\(missing; \\(escaped\\); \(\); \(price $5\)`;
    expect(normalizeOfficialMarkdown(source)).toBe(source);
  });
});
