/**
 * DOM -> Markdown 序列化模块：
 * 将 ChatGPT assistant 消息内容转换为 Markdown，并从公式源码节点恢复 LaTeX。
 */

import {
  extractLatexFromMathContainer,
  isDisplayMathElement,
  isInlineMathElement,
} from './math';

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
 * 序列化已裁剪且补齐格式上下文的选区，不重新查找整条消息或压缩代码空行。
 * @param {DocumentFragment} fragment 独立的选区 DOM。
 * @returns {string} 只含选区内容的 Markdown。
 */
export function serializeSelectionDomToMarkdown(fragment: DocumentFragment): string {
  const container = fragment.ownerDocument.createElement('div');
  container.append(fragment.cloneNode(true));
  return serializeBlockChildren(container, 0).join('\n\n').trim();
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
  let inline = '';

  for (const node of Array.from(container.childNodes)) {
    const block = node instanceof HTMLElement &&
      (node.matches('p,h1,h2,h3,h4,h5,h6,ul,ol,pre,blockquote,hr,table,div,section,article') || isDisplayMathElement(node));
    if (!block) {
      inline += serializeNodeAsInline(node);
      continue;
    }
    if (inline.trim()) blocks.push(inline.trim());
    inline = '';
    const serialized = serializeNodeAsBlock(node, indent);
    if (!serialized) continue;
    blocks.push(serialized);
  }
  if (inline.trim()) blocks.push(inline.trim());

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

  if (isDisplayMathElement(el)) {
    const latex = extractLatexFromMathContainer(el);
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

  if (isDisplayMathElement(el)) {
    const latex = extractLatexFromMathContainer(el);
    if (latex) return `\n\n$$\n${latex}\n$$\n\n`;
    return normalizeInlineText(el.textContent ?? '');
  }

  if (isInlineMathElement(el)) {
    const latex = extractLatexFromMathContainer(el);
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
    return serializeInlineCode(el.textContent ?? '');
  }

  if (tag === 'strong' || tag === 'b') {
    const text = serializeInlineChildren(el).trim();
    return text ? `**${text}**` : '';
  }

  if (tag === 'em' || tag === 'i') {
    const text = serializeInlineChildren(el).trim();
    return text ? `*${text}*` : '';
  }

  if (tag === 'del' || tag === 's') {
    const text = serializeInlineChildren(el).trim();
    return text ? `~~${text}~~` : '';
  }

  return serializeInlineChildren(el);
}

/**
 * 序列化列表，保留起始序号和显式编号，并按父项标记宽度缩进子列表。
 *
 * @param {HTMLElement} listEl 列表节点。
 * @param {boolean} ordered 是否有序列表。
 * @param {number} indent 当前缩进空格数。
 * @returns {string}
 */
function serializeList(listEl: HTMLElement, ordered: boolean, indent: number): string {
  const lines: string[] = [];
  const items = Array.from(listEl.children).filter((child) => child.tagName.toLowerCase() === 'li');
  const numbers = ordered ? getOrderedListItemNumbers(listEl) : [];
  for (const [index, li] of items.entries()) {
    const liElement = li as HTMLElement;
    const marker = ordered ? `${numbers[index]}. ` : '- ';
    const prefix = `${' '.repeat(indent)}${marker}`;
    const continuation = ' '.repeat(indent + marker.length);
    let emitted = false;
    let inline = '';
    /** @param {string} text 当前块内容。 */
    const emitBlock = (text: string): void => {
      if (!text.trim()) return;
      const parts = text.split('\n');
      if (emitted) lines.push('', `${continuation}${parts[0]}`);
      else lines.push(`${prefix}${parts[0]}`);
      lines.push(...parts.slice(1).map((line) => line ? `${continuation}${line}` : ''));
      emitted = true;
    };
    /** 将连续行内节点作为一个块输出。 */
    const flushInline = (): void => {
      emitBlock(inline.trim());
      inline = '';
    };

    for (const child of Array.from(liElement.childNodes)) {
      if (child.nodeType === Node.ELEMENT_NODE) {
        const childEl = child as HTMLElement;
        const childTag = childEl.tagName.toLowerCase();
        if (childTag === 'ul' || childTag === 'ol') {
          flushInline();
          if (!emitted) { lines.push(prefix); emitted = true; }
          const nestedList = serializeList(childEl, childTag === 'ol', indent + marker.length);
          if (nestedList) lines.push(nestedList);
          continue;
        }
        if (childEl.matches('p,pre,blockquote,div,section,table,h1,h2,h3,h4,h5,h6,hr')) {
          flushInline();
          emitBlock(serializeNodeAsBlock(childEl, 0) ?? '');
          continue;
        }
      }

      inline += serializeNodeAsInline(child);
    }

    flushInline();
    if (!emitted) lines.push(prefix);
  }

  return lines.join('\n');
}

/**
 * 按 HTML 列表规则计算直接子项序号，供列表序列化与选区克隆共用。
 * @param {HTMLElement} listEl 有序列表，支持 start、reversed 和 li.value。
 * @returns {number[]} 与直接 li 子项顺序一致的编号。
 */
export function getOrderedListItemNumbers(listEl: HTMLElement): number[] {
  const items = Array.from(listEl.children).filter((child) => child.tagName.toLowerCase() === 'li');
  const step = listEl.hasAttribute('reversed') ? -1 : 1;
  const start = listEl.getAttribute('start');
  let number = start !== null && /^-?\d+$/.test(start.trim())
    ? Number(start) : step === -1 ? items.length : 1;
  return items.map((item) => {
    const value = item.getAttribute('value');
    if (value !== null && /^-?\d+$/.test(value.trim())) number = Number(value);
    const current = number;
    number += step;
    return current;
  });
}

/**
 * 序列化代码块。
 *
 * @param {HTMLElement} preEl pre 节点。
 * @returns {string}
 */
function serializePreBlock(preEl: HTMLElement): string {
  const codeEl = preEl.querySelector<HTMLElement>('code');
  const language = extractPreBlockLanguage(preEl, codeEl ?? preEl);
  const codeMirrorText = extractCodeMirrorBlockText(preEl);
  const structuredText = extractStructuredCodeBlockText(preEl);
  const rawCodeText =
    codeMirrorText ?? structuredText ?? codeEl?.textContent ?? preEl.innerText ?? preEl.textContent ?? '';
  const codeText = codeEl || codeMirrorText !== null || structuredText !== null ? normalizeCodeBlockText(rawCodeText)
    : stripDuplicatedLanguagePrefix(normalizeCodeBlockText(rawCodeText), language);
  const fence = '`'.repeat(Math.max(3, ...Array.from(codeText.matchAll(/`+/g), (match) => match[0].length + 1)));
  return `${fence}${language}\n${codeText}\n${fence}`;
}

/**
 * 从 ChatGPT 的 CodeMirror 结构提取代码文本。
 *
 * @param {HTMLElement} preEl pre 节点。
 * @returns {string | null}
 */
function extractCodeMirrorBlockText(preEl: HTMLElement): string | null {
  const cmContent = preEl.querySelector<HTMLElement>(
    '#code-block-viewer .cm-content, [id="code-block-viewer"] .cm-content, .cm-editor .cm-content, .cm-content',
  );
  if (!cmContent) return null;

  const parts: string[] = [];
  collectCodeMirrorText(cmContent, parts);
  const raw = parts.join('');
  return raw ? raw : null;
}

/**
 * 在选择器失效时，从结构化节点中兜底恢复代码文本（保留 <br> 换行）。
 *
 * @param {HTMLElement} preEl pre 节点。
 * @returns {string | null}
 */
function extractStructuredCodeBlockText(preEl: HTMLElement): string | null {
  const candidates = Array.from(
    preEl.querySelectorAll<HTMLElement>('.cm-content, [class*="cm-content"], .cm-scroller, [id="code-block-viewer"]'),
  );
  if (candidates.length === 0) return null;

  let best = '';
  let bestScore = -1;

  for (const candidate of candidates) {
    const parts: string[] = [];
    collectCodeMirrorText(candidate, parts);
    const text = normalizeCodeBlockText(parts.join(''));
    if (!text) continue;

    const newlineCount = (text.match(/\n/g) ?? []).length;
    const score = newlineCount * 1000 + text.length;
    if (score > bestScore) {
      bestScore = score;
      best = text;
    }
  }

  return best || null;
}

/**
 * 深度遍历 CodeMirror 节点并恢复文本换行。
 *
 * @param {ChildNode} node 当前节点。
 * @param {string[]} parts 文本片段收集器。
 * @returns {void}
 */
function collectCodeMirrorText(node: ChildNode, parts: string[]): void {
  if (node.nodeType === Node.TEXT_NODE) {
    parts.push(node.textContent ?? '');
    return;
  }

  if (node.nodeType !== Node.ELEMENT_NODE) return;

  const el = node as HTMLElement;
  const tag = el.tagName.toLowerCase();

  if (tag === 'br') {
    parts.push('\n');
    return;
  }

  if (shouldSkipCodeBlockUiElement(el)) return;

  for (const child of Array.from(el.childNodes)) {
    collectCodeMirrorText(child, parts);
  }
  if (el.classList.contains('cm-line') && parts.at(-1) !== '\n') parts.push('\n');
}

/**
 * 过滤代码块内部的按钮/图标等 UI 节点。
 *
 * @param {HTMLElement} el 待判断元素。
 * @returns {boolean}
 */
function shouldSkipCodeBlockUiElement(el: HTMLElement): boolean {
  const tag = el.tagName.toLowerCase();
  if (['button', 'svg', 'script', 'style'].includes(tag)) return true;
  if (el.closest('button')) return true;
  return false;
}

/**
 * 提取 pre 代码块语言，优先读取 ChatGPT 代码块头部标签。
 *
 * @param {HTMLElement} preEl pre 节点。
 * @param {HTMLElement} fallbackEl 回退节点（用于读取 language-* class）。
 * @returns {string}
 */
function extractPreBlockLanguage(preEl: HTMLElement, fallbackEl: HTMLElement): string {
  const headerLanguage = extractLanguageFromCodeBlockHeader(preEl);
  const language = headerLanguage || extractCodeLanguage(fallbackEl);
  return normalizeCodeFenceLanguage(language);
}

/**
 * 从代码块头部读取语言文案（例如 C、Bash）。
 *
 * @param {HTMLElement} preEl pre 节点。
 * @returns {string}
 */
function extractLanguageFromCodeBlockHeader(preEl: HTMLElement): string {
  const copyButton = preEl.querySelector<HTMLButtonElement>(
    'button[aria-label*="复制"], button[aria-label*="Copy"]',
  );
  if (!copyButton) return '';

  const actionArea = copyButton.parentElement;
  const headerRow = actionArea?.parentElement;
  if (!headerRow) return '';

  const siblingTextCandidates: string[] = [];
  for (const child of Array.from(headerRow.children)) {
    if (child.contains(copyButton)) continue;
    const text = normalizeInlineText((child as HTMLElement).textContent ?? '').trim();
    if (text) siblingTextCandidates.push(text);
  }

  if (siblingTextCandidates.length > 0) {
    return siblingTextCandidates.sort((a, b) => b.length - a.length)[0];
  }

  return '';
}

/**
 * 清理“语言标签被拼进代码正文开头”的异常情况。
 *
 * @param {string} codeText 代码正文。
 * @param {string} language 语言标签。
 * @returns {string}
 */
function stripDuplicatedLanguagePrefix(codeText: string, language: string): string {
  if (!language || !codeText) return codeText;
  if (!codeText.startsWith(language)) return codeText;

  const next = codeText.slice(language.length, language.length + 1);
  if (next && /[A-Za-z0-9_]/.test(next)) return codeText;
  return codeText.slice(language.length).replace(/^\s*/, '');
}

/**
 * 统一 fenced code 语言标签格式。
 *
 * @param {string} language 原始语言标签。
 * @returns {string}
 */
function normalizeCodeFenceLanguage(language: string): string {
  return normalizeInlineText(language).trim().toLowerCase();
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
 * 序列表格为管道行，仅在选区第一行确有表头时输出 GFM 表头分隔线。
 *
 * @param {HTMLElement} tableEl 表格节点。
 * @returns {string}
 */
function serializeTable(tableEl: HTMLElement): string {
  const rowElements = Array.from(tableEl.querySelectorAll('tr')).filter((row) => row.closest('table') === tableEl);
  const rows = rowElements.map((row) => {
    return Array.from(row.children).filter((cell) => cell.matches('th,td')).map((cell) => {
      const cloned = cell.cloneNode(true) as HTMLElement;
      const text = serializeInlineChildren(cloned).replace(/\n+/g, ' ').trim();
      return escapeTableCell(text);
    });
  });

  if (rows.length === 0) return '';

  const width = Math.max(...rows.map((row) => row.length));
  if (!width) return '';
  const lines = rows.map((row) => `| ${normalizeTableRow(row, width).join(' | ')} |`);
  const firstRow = rowElements[0];
  if (firstRow.parentElement?.tagName.toLowerCase() === 'thead' ||
      Array.from(firstRow.children).some((cell) => cell.tagName.toLowerCase() === 'th')) {
    lines.splice(1, 0, `| ${Array(width).fill('---').join(' | ')} |`);
  }

  return lines.join('\n');
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
 * 生成比内容中反引号更长的代码分隔符，避免反斜杠转义改变代码文本。
 *
 * @param {string} input 原始文本。
 * @returns {string}
 */
function serializeInlineCode(input: string): string {
  const text = normalizeInlineText(input).replace(/\n/g, ' ');
  const fence = '`'.repeat(Math.max(1, ...Array.from(text.matchAll(/`+/g), (match) => match[0].length + 1)));
  const padding = text.startsWith('`') || text.endsWith('`') || (/^ .* $/.test(text) && text.trim()) ? ' ' : '';
  return `${fence}${padding}${text}${padding}${fence}`;
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
