/**
 * DOM -> Markdown 序列化模块：
 * 将 ChatGPT assistant 消息内容转换为 Markdown，并以 KaTeX annotation 作为数学公式真值源。
 */

/**
 * 将 assistant 消息 DOM 直接序列化为 Markdown。
 *
 * @param {HTMLElement} messageRoot assistant 消息根节点。
 * @returns {string}
 */
export function serializeMessageDomToMarkdown(messageRoot: HTMLElement): string {
  const contentRoot = extractMessageContentRoot(messageRoot);
  const blocks = serializeBlockChildren(contentRoot, 0);
  return tidyMarkdown(blocks.join('\n\n'));
}

/**
 * 优先定位正文区域，避免把操作按钮等区域带入结果。
 *
 * @param {HTMLElement} messageRoot assistant 消息根节点。
 * @returns {HTMLElement}
 */
function extractMessageContentRoot(messageRoot: HTMLElement): HTMLElement {
  const markdownRoot = messageRoot.querySelector<HTMLElement>('.markdown.prose');
  if (markdownRoot) return markdownRoot;

  const article = messageRoot.querySelector<HTMLElement>('article');
  if (article) {
    const articleMarkdown = article.querySelector<HTMLElement>('.markdown.prose');
    if (articleMarkdown) return articleMarkdown;
    return article;
  }

  return messageRoot;
}

/**
 * 序列化容器的直接子节点为块级 Markdown。
 *
 * @param {HTMLElement} container 待序列化容器。
 * @param {number} indent 当前缩进层级。
 * @returns {string[]}
 */
function serializeBlockChildren(container: HTMLElement, indent: number): string[] {
  const blocks: string[] = [];

  for (const node of Array.from(container.childNodes)) {
    const serialized = serializeNodeAsBlock(node, indent);
    if (!serialized) continue;
    blocks.push(serialized);
  }

  return blocks;
}

/**
 * 按块级规则处理单个节点。
 *
 * @param {ChildNode} node 当前节点。
 * @param {number} indent 当前缩进层级。
 * @returns {string | null}
 */
function serializeNodeAsBlock(node: ChildNode, indent: number): string | null {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = normalizeInlineText(node.textContent ?? '');
    return text || null;
  }

  if (node.nodeType !== Node.ELEMENT_NODE) return null;

  const el = node as HTMLElement;
  if (shouldSkipElement(el)) return null;

  if (isKatexDisplayElement(el)) {
    const latex = extractLatexFromKatexContainer(el);
    if (latex) return `$$\n${latex}\n$$`;
    const plain = normalizeInlineText(el.textContent ?? '');
    return plain || null;
  }

  const tag = el.tagName.toLowerCase();

  if (tag === 'p') {
    const content = serializeInlineChildren(el).trim();
    return content || null;
  }

  if (/^h[1-6]$/.test(tag)) {
    const level = Number(tag.slice(1));
    const content = serializeInlineChildren(el).trim();
    if (!content) return null;
    return `${'#'.repeat(level)} ${content}`;
  }

  if (tag === 'ul') {
    return serializeList(el, false, indent);
  }

  if (tag === 'ol') {
    return serializeList(el, true, indent);
  }

  if (tag === 'pre') {
    return serializePreBlock(el);
  }

  if (tag === 'blockquote') {
    return serializeBlockquote(el, indent);
  }

  if (tag === 'hr') {
    return '---';
  }

  if (tag === 'table') {
    return serializeTable(el);
  }

  if (tag === 'div' || tag === 'section' || tag === 'article') {
    const nested = serializeBlockChildren(el, indent);
    if (nested.length > 0) return nested.join('\n\n');
    const inline = serializeInlineChildren(el).trim();
    return inline || null;
  }

  if (tag === 'span') {
    const inline = serializeInlineChildren(el).trim();
    return inline || null;
  }

  const fallbackInline = serializeInlineChildren(el).trim();
  if (fallbackInline) return fallbackInline;

  const fallbackBlocks = serializeBlockChildren(el, indent);
  return fallbackBlocks.length > 0 ? fallbackBlocks.join('\n\n') : null;
}

/**
 * 序列化行内节点。
 *
 * @param {HTMLElement} container 行内容器。
 * @returns {string}
 */
function serializeInlineChildren(container: HTMLElement): string {
  let output = '';

  for (const node of Array.from(container.childNodes)) {
    output += serializeNodeAsInline(node);
  }

  return output;
}

/**
 * 按行内规则处理单个节点。
 *
 * @param {ChildNode} node 当前节点。
 * @returns {string}
 */
function serializeNodeAsInline(node: ChildNode): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return normalizeInlineText(node.textContent ?? '');
  }

  if (node.nodeType !== Node.ELEMENT_NODE) return '';

  const el = node as HTMLElement;
  if (shouldSkipElement(el)) return '';

  if (isKatexDisplayElement(el)) {
    const latex = extractLatexFromKatexContainer(el);
    if (latex) return `\n\n$$\n${latex}\n$$\n\n`;
    return normalizeInlineText(el.textContent ?? '');
  }

  if (isInlineKatexElement(el)) {
    const latex = extractLatexFromKatexContainer(el);
    if (latex) return `$${latex}$`;
    return normalizeInlineText(el.textContent ?? '');
  }

  const tag = el.tagName.toLowerCase();

  if (tag === 'br') return '\n';

  if (tag === 'a') {
    const text = serializeInlineChildren(el).trim() || normalizeInlineText(el.textContent ?? '');
    const href = (el.getAttribute('href') || '').trim();
    if (!href) return text;
    return `[${text}](${href})`;
  }

  if (tag === 'code' && !el.closest('pre')) {
    return `\`${escapeInlineCode(el.textContent ?? '')}\``;
  }

  if (tag === 'strong' || tag === 'b') {
    const text = serializeInlineChildren(el).trim();
    return text ? `**${text}**` : '';
  }

  if (tag === 'em' || tag === 'i') {
    const text = serializeInlineChildren(el).trim();
    return text ? `*${text}*` : '';
  }

  return serializeInlineChildren(el);
}

/**
 * 序列化列表（支持嵌套）。
 *
 * @param {HTMLElement} listEl 列表节点。
 * @param {boolean} ordered 是否有序列表。
 * @param {number} indent 当前缩进层级。
 * @returns {string}
 */
function serializeList(listEl: HTMLElement, ordered: boolean, indent: number): string {
  const lines: string[] = [];
  const marker = ordered ? '1. ' : '- ';

  const items = Array.from(listEl.children).filter((child) => child.tagName.toLowerCase() === 'li');
  for (const li of items) {
    const liElement = li as HTMLElement;
    const textParts: string[] = [];
    const nestedParts: string[] = [];

    for (const child of Array.from(liElement.childNodes)) {
      if (child.nodeType === Node.ELEMENT_NODE) {
        const childEl = child as HTMLElement;
        const childTag = childEl.tagName.toLowerCase();
        if (childTag === 'ul' || childTag === 'ol') {
          const nestedList = serializeList(childEl, childTag === 'ol', indent + 1);
          if (nestedList) nestedParts.push(nestedList);
          continue;
        }
      }

      const inline = serializeNodeAsInline(child);
      if (inline) textParts.push(inline);
    }

    const itemText = normalizeInlineText(textParts.join('')).trim();
    const prefix = `${'  '.repeat(indent)}${marker}`;
    lines.push(`${prefix}${itemText}`);
    for (const nested of nestedParts) {
      lines.push(nested);
    }
  }

  return lines.join('\n');
}

/**
 * 序列化代码块。
 *
 * @param {HTMLElement} preEl pre 节点。
 * @returns {string}
 */
function serializePreBlock(preEl: HTMLElement): string {
  const codeEl = preEl.querySelector<HTMLElement>('code');
  const codeText = normalizeCodeBlockText(codeEl?.textContent ?? preEl.textContent ?? '');
  const language = extractCodeLanguage(codeEl ?? preEl);
  const header = language ? `\`\`\`${language}` : '```';
  return `${header}\n${codeText}\n\`\`\``;
}

/**
 * 序列化引用块。
 *
 * @param {HTMLElement} blockquoteEl 引用块节点。
 * @param {number} indent 当前缩进层级。
 * @returns {string}
 */
function serializeBlockquote(blockquoteEl: HTMLElement, indent: number): string {
  const raw = serializeBlockChildren(blockquoteEl, indent).join('\n\n').trim();
  const content = raw || normalizeInlineText(blockquoteEl.textContent ?? '');
  if (!content) return '';
  return content
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n');
}

/**
 * 序列表格为 GFM 格式。
 *
 * @param {HTMLElement} tableEl 表格节点。
 * @returns {string}
 */
function serializeTable(tableEl: HTMLElement): string {
  const rows = Array.from(tableEl.querySelectorAll('tr')).map((row) => {
    return Array.from(row.querySelectorAll('th, td')).map((cell) => {
      const cloned = cell.cloneNode(true) as HTMLElement;
      const text = serializeInlineChildren(cloned).replace(/\n+/g, ' ').trim();
      return escapeTableCell(text);
    });
  });

  if (rows.length === 0) return '';

  const header = rows[0];
  const body = rows.slice(1);
  const divider = header.map(() => '---');

  const lines = [
    `| ${header.join(' | ')} |`,
    `| ${divider.join(' | ')} |`,
    ...body.map((row) => `| ${normalizeTableRow(row, header.length).join(' | ')} |`),
  ];

  return lines.join('\n');
}

/**
 * 判断是否为行内 katex。
 *
 * @param {HTMLElement} el 待判断元素。
 * @returns {boolean}
 */
function isInlineKatexElement(el: HTMLElement): boolean {
  return el.classList.contains('katex') && !el.closest('.katex-display');
}

/**
 * 判断是否为块级 katex。
 *
 * @param {HTMLElement} el 待判断元素。
 * @returns {boolean}
 */
function isKatexDisplayElement(el: HTMLElement): boolean {
  return el.classList.contains('katex-display');
}

/**
 * 从 katex 容器读取 LaTeX 真值。
 *
 * @param {HTMLElement} container katex 容器。
 * @returns {string}
 */
function extractLatexFromKatexContainer(container: HTMLElement): string {
  const annotation = container.querySelector<HTMLElement>(
    'annotation[encoding="application/x-tex"]',
  );
  return normalizeInlineText(annotation?.textContent ?? '');
}

/**
 * 过滤明显非正文节点。
 *
 * @param {HTMLElement} el 待判断元素。
 * @returns {boolean}
 */
function shouldSkipElement(el: HTMLElement): boolean {
  const tag = el.tagName.toLowerCase();
  if (['button', 'svg', 'nav', 'footer', 'script', 'style'].includes(tag)) return true;
  if (el.getAttribute('aria-hidden') === 'true') return true;
  if (el.closest('button')) return true;
  return false;
}

/**
 * 统一行内文本。
 *
 * @param {string} input 原始文本。
 * @returns {string}
 */
function normalizeInlineText(input: string): string {
  return input.replace(/\u00a0/g, ' ').replace(/\r\n?/g, '\n');
}

/**
 * 统一代码块文本（保留内部换行）。
 *
 * @param {string} input 原始文本。
 * @returns {string}
 */
function normalizeCodeBlockText(input: string): string {
  return input.replace(/\r\n?/g, '\n').replace(/\n$/, '');
}

/**
 * 行内 code 反引号转义。
 *
 * @param {string} input 原始文本。
 * @returns {string}
 */
function escapeInlineCode(input: string): string {
  return normalizeInlineText(input).replace(/`/g, '\\`');
}

/**
 * 提取 fenced code language。
 *
 * @param {HTMLElement} el 代码节点。
 * @returns {string}
 */
function extractCodeLanguage(el: HTMLElement): string {
  const classNames = `${el.className || ''}`;
  const match = classNames.match(/language-([a-zA-Z0-9_-]+)/);
  return match?.[1] ?? '';
}

/**
 * 表格单元格转义。
 *
 * @param {string} input 单元格文本。
 * @returns {string}
 */
function escapeTableCell(input: string): string {
  return input.replace(/\|/g, '\\|');
}

/**
 * 对齐表格行列数。
 *
 * @param {string[]} row 行数据。
 * @param {number} length 目标列数。
 * @returns {string[]}
 */
function normalizeTableRow(row: string[], length: number): string[] {
  const result = [...row];
  while (result.length < length) result.push('');
  return result.slice(0, length);
}

/**
 * Markdown 收尾清洗。
 *
 * @param {string} input 原始 Markdown。
 * @returns {string}
 */
function tidyMarkdown(input: string): string {
  return input
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
