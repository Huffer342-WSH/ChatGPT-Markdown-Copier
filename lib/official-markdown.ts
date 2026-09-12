/**
 * 修正官方复制文本中的行内数学分隔符，保留代码和其他 Markdown 原文。
 * 对嵌套列表中的围栏、缩进代码采用保守跳过策略。
 * @param {string} source 官方待复制文本。
 * @returns {string} 修正后的 Markdown。
 */
export function normalizeOfficialMarkdown(source: string): string {
  let fence = '';
  let inlineTicks = 0;
  return source.split(/(\r?\n)/).map((line) => {
    if (/^\r?\n$/.test(line)) return line;
    const marker = line.match(/^\s*(?:>\s*)*(?:[-+*]\s+|\d+[.)]\s+)?(`{3,}|~{3,})/);
    if (fence) {
      if (marker && marker[1][0] === fence[0] && marker[1].length >= fence.length &&
          line.slice((marker.index ?? 0) + marker[0].length).trim() === '') fence = '';
      return line;
    }
    if (marker && inlineTicks === 0) {
      fence = marker[1];
      return line;
    }
    if (/^(?: {4}|\t)/.test(line)) return line;
    let output = '';
    for (let i = 0; i < line.length;) {
      if (line[i] === '`') {
        const ticks = line.slice(i).match(/^`+/)![0];
        if (inlineTicks === 0) inlineTicks = ticks.length;
        else if (inlineTicks === ticks.length) inlineTicks = 0;
        output += ticks;
        i += ticks.length;
      } else if (!inlineTicks && line[i] === '\\') {
        if (line[i + 1] === '(') {
          let end = i + 2;
          while (end < line.length) {
            if (line[end] === '\\') {
              if (line[end + 1] === ')') break;
              end += 2;
            } else end++;
          }
          const body = line.slice(i + 2, end);
          // 嵌套开头、美元符号或反引号可能造成歧义，不跨公式猜测配对。
          if (end < line.length && body.trim() && !/[$`]/.test(body) && !body.includes('\\(')) {
            output += `$${body.trim()}$`;
            i = end + 2;
            continue;
          }
        }
        output += line.slice(i, i + 2);
        i += 2;
      } else output += line[i++];
    }
    return output;
  }).join('');
}
