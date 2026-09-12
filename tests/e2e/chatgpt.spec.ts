import { readFile } from 'node:fs/promises';
import { test, expect, shareUrl, normalizeNewlines, resetClipboard, waitForCopy } from './fixtures';

/** 固定样本上的选区边界；offset 使用原始文本节点的字符位置。 */
interface SelectionCase {
  name: string;
  selector: string;
  text?: string;
  expected: string;
  formula?: boolean;
  table?: boolean;
  header?: boolean;
  math?: boolean;
  mathCount?: number;
  nth?: number;
  offsets?: [number, number];
  reverse?: boolean;
  endSelector?: string;
  startOffset?: number;
  endOffset?: number;
}

/** 在真实分享页验证完整复制链；固定预期不导入生产转换算法。 */
test('分享会话：官方按钮桥接与选区的真实剪贴板', async ({ livePage: page }, testInfo) => {
  await test.step('站点可访问且固定样本已加载', async () => {
    let status: number | undefined;
    try {
      status = (await page.goto(shareUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 }))?.status();
    } catch (error) {
      throw new Error(`[SITE_UNAVAILABLE] 页面访问失败，本次不能判定插件兼容性：${error}`);
    }
    if (status !== 200) throw new Error(`[SITE_UNAVAILABLE] HTTP ${status}，本次不能判定插件兼容性`);
    try {
      await expect(page.getByRole('heading', { name: '公式速览', exact: true })).toBeVisible({ timeout: 30_000 });
    } catch {
      throw new Error('[SITE_OR_SAMPLE_CHANGED] 正文样本未出现：检查挑战页、登录要求或分享内容变化；不计为通过');
    }
  });

  const root = page.locator('.markdown').filter({ has: page.getByRole('heading', { name: '公式速览', exact: true }) });
  await expect(root).toHaveCount(1);
  await test.step('扩展按钮存在', async () => {
    await expect(page.locator('.md-copy-button')).toHaveCount(2);
  });

  for (const mode of ['original', 'markdown'] as const) {
    await test.step(`${mode} 按钮：整条回复与固定预期一致`, async () => {
      const expected = await readFile(new URL(`./expected/reply-${mode}.md`, import.meta.url), 'utf8');
      await resetClipboard(page);
      const button = page.locator(mode === 'original'
        ? '.md-copy-button[data-copy-mode="original"]'
        : '.md-copy-button:not([data-copy-mode])');
      // 真实键盘激活，避开分享页底部输入浮层；不使用 evaluate(click) 或强制点击。
      await button.press('Enter');
      const payload = await waitForCopy(page);
      await testInfo.attach(`reply-${mode}`, { body: JSON.stringify(payload, null, 2), contentType: 'application/json' });
      expect(normalizeNewlines(payload['text/plain'])).toBe(normalizeNewlines(expected));
    });
  }

  const cases: SelectionCase[] = [
    { name: '标题', selector: 'h3', text: '结构化文本', expected: '### 结构化文本' },
    { name: '列表内文字不带序号', selector: 'ol > li > p > strong', text: '有序列表', expected: '**有序列表**' },
    { name: '跨嵌套编号项', selector: 'ol ol', expected: '1. 多级编号\n2. 第二项' },
    { name: '强调组合', selector: 'ul li p', text: '粗体、斜体、粗斜体', expected: '**粗体**、*斜体*、***粗斜体***' },
    { name: '行内代码默认复制原文', selector: 'code', text: '行内代码', expected: '行内代码' },
    { name: '代码块保留缩进', selector: 'pre code', expected: '代码块\n  保留缩进' },
    { name: '公式局部扩展完整公式', selector: '.katex', formula: true, expected: '$\\frac{1}{2}+\\frac{1}{3}=\\frac{5}{6}$' },
    { name: '单元格只复制文字', selector: 'td', text: '重点', expected: '重点' },
    { name: '数据行不补表头', selector: 'tbody', expected: '| 数学 | $E=mc^2$ | 行内公式 |\n| 文本 | **重点** | 强调 |', table: true },
    // 当前选区序列化不恢复列对齐；整条回复按钮的预期仍检查官方对齐标记。
    { name: '表头与数据行', selector: 'table', expected: '| 项目 | 示例 | 说明 |\n| --- | --- | --- |\n| 数学 | $E=mc^2$ | 行内公式 |\n| 文本 | **重点** | 强调 |', table: true, header: true },
    { name: '加粗文字中间子串', selector: 'ol > li > p > strong', text: '有序列表', offsets: [1, 3], expected: '**序列**' },
    { name: '反向选取嵌套列表', selector: 'ol ol', reverse: true, expected: '1. 多级编号\n2. 第二项' },
    { name: '单个完整编号项保留第二项序号', selector: 'ol ol > li', text: '第二项', expected: '2. 第二项' },
    { name: '编号项文字局部不带序号', selector: 'ol ol > li > p', text: '第二项', offsets: [1, 3], expected: '二项' },
    { name: '行内代码局部', selector: 'code', text: '行内代码', offsets: [1, 3], expected: '内代' },
    { name: '代码块第二行含缩进', selector: 'pre code', offsets: [4, 10], expected: '  保留缩进' },
    { name: '引用保留加粗', selector: 'blockquote', expected: '> **加粗引用：** 数学可以用公式表达结构，文本可以用层级表达结构。' },
    { name: '删除线子串', selector: 'del', offsets: [0, 2], expected: '~~删除~~' },
    { name: '根式局部扩展完整公式', selector: '.katex', nth: 1, formula: true, expected: '$\\sqrt{2},\\quad \\sqrt[3]{8}=2$' },
    { name: '公式单元格不带表格外壳', selector: 'tbody tr:first-child td:nth-child(2)', math: true, expected: '$E=mc^2$' },
    { name: '单行多个单元格不补表头', selector: 'tbody tr', nth: 0, table: true, expected: '| 数学 | $E=mc^2$ | 行内公式 |' },
    { name: '表头单元格只复制文字', selector: 'th', text: '示例', expected: '示例' },
    { name: '跨两个标题保留层级', selector: 'h1', endSelector: 'h2', expected: '# 一级标题\n\n## 二级标题' },
    { name: '跨标题局部文字不补未选文字', selector: 'h1', startOffset: 2, endSelector: 'h2', endOffset: 2, expected: '# 标题\n\n## 二级' },
    { name: '反向跨强调和代码保留各自格式', selector: ':scope > p:last-child > strong', endSelector: ':scope > p:last-child > code', reverse: true, expected: '**粗体** · *斜体* · ~~删除线~~ · `代码`' },
    { name: '同一行只选前两个单元格', selector: 'tbody tr:first-child td:first-child', endSelector: 'tbody tr:first-child td:nth-child(2)', table: true, expected: '| 数学 | $E=mc^2$ |' },
    { name: '表格行两端局部文字', selector: 'tbody tr:first-child td:first-child', startOffset: 1, endSelector: 'tbody tr:first-child td:last-child', endOffset: 2, table: true, expected: '| 学 | $E=mc^2$ | 行内 |' },
    { name: '无公式数据行保留强调及表格', selector: 'tbody tr:last-child', table: true, mathCount: 0, expected: '| 文本 | **重点** | 强调 |' },
    { name: '只选两个表头单元格', selector: 'th:first-child', endSelector: 'th:nth-child(2)', table: true, header: true, mathCount: 0, expected: '| 项目 | 示例 |\n| --- | --- |' },
    { name: '矩阵局部保留行列分隔', selector: '.katex', nth: 5, formula: true, expected: '$\\displaystyle A=\\begin{pmatrix}1&2\\\\3&4\\end{pmatrix}$' },
  ];
  for (const item of cases) {
    await test.step(`选区：${item.name}`, async () => {
      let locator = root.locator(item.selector);
      if (item.text) locator = locator.filter({ hasText: item.text });
      if (item.nth !== undefined) locator = locator.nth(item.nth);
      else if (item.formula) locator = locator.first();
      await expect(locator).toHaveCount(1);
      await resetClipboard(page);
      const before = await locator.evaluateHandle((element, options) => {
        const range = document.createRange();
        if (options.endSelector) {
          const matches = element.closest('.markdown')!.querySelectorAll(options.endSelector);
          if (matches.length !== 1) throw new Error('跨节点选区终点不唯一');
          const end = matches[0];
          range.selectNodeContents(element);
          range.setEnd(end, end.childNodes.length);
          if (options.startOffset !== undefined) {
            if (element.firstChild?.nodeType !== Node.TEXT_NODE) throw new Error('样本起点不是文本节点');
            range.setStart(element.firstChild, options.startOffset);
          }
          if (options.endOffset !== undefined) {
            if (end.firstChild?.nodeType !== Node.TEXT_NODE) throw new Error('样本终点不是文本节点');
            range.setEnd(end.firstChild, options.endOffset);
          }
        } else if (options.formula) {
          const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
          let text = walker.nextNode();
          while (text && !text.textContent?.trim()) text = walker.nextNode();
          if (!text) throw new Error('公式中没有可选文字');
          range.setStart(text, 0);
          range.setEnd(text, 1);
        } else if (options.offsets) {
          // 按真实文本节点定位字符，支持代码高亮将文字拆成多个 span 的情况。
          const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
          const nodes: Text[] = [];
          while (walker.nextNode()) nodes.push(walker.currentNode as Text);
          const total = nodes.reduce((sum, node) => sum + node.length, 0);
          if (options.offsets[0] < 0 || options.offsets[1] > total || options.offsets[0] >= options.offsets[1]) {
            throw new Error('固定选区偏移超出样本范围');
          }
          for (const [index, offset] of options.offsets.entries()) {
            let remaining = offset;
            for (const node of nodes) {
              if (remaining <= node.length) {
                if (index === 0) range.setStart(node, remaining);
                else range.setEnd(node, remaining);
                break;
              }
              remaining -= node.length;
            }
          }
        } else {
          range.selectNodeContents(element);
        }
        const selection = window.getSelection()!;
        selection.removeAllRanges();
        selection.addRange(range);
        if (options.reverse) {
          selection.setBaseAndExtent(range.endContainer, range.endOffset, range.startContainer, range.startOffset);
        }
        (document.activeElement as HTMLElement | null)?.blur();
        const scope = element.closest('.markdown')!;
        // 保存真实节点引用，避免复制后边界移到相同文字的其他节点却被误判为通过。
        return {
          scope, html: scope.outerHTML, text: selection.toString(),
          anchorNode: selection.anchorNode, anchor: selection.anchorOffset,
          focusNode: selection.focusNode, focus: selection.focusOffset,
          startNode: range.startContainer, start: range.startOffset,
          endNode: range.endContainer, end: range.endOffset,
        };
      }, { formula: item.formula, offsets: item.offsets, reverse: item.reverse,
        endSelector: item.endSelector, startOffset: item.startOffset, endOffset: item.endOffset });
      await page.keyboard.press(process.platform === 'darwin' ? 'Meta+C' : 'Control+C');
      const payload = await waitForCopy(page);
      await testInfo.attach(item.name, { body: JSON.stringify(payload, null, 2), contentType: 'application/json' });
      // 内容不符仍继续检查其他选区；软断言仍使整次运行失败，不掩盖缺陷。
      expect.soft(normalizeNewlines(payload['text/plain']), item.name).toBe(item.expected);
      const unchanged = await before.evaluate(snapshot => {
        const selection = window.getSelection()!;
        const range = selection.rangeCount === 1 ? selection.getRangeAt(0) : null;
        return {
          dom: snapshot.scope.outerHTML === snapshot.html,
          text: selection.toString() === snapshot.text,
          direction: selection.anchorNode === snapshot.anchorNode && selection.anchorOffset === snapshot.anchor &&
            selection.focusNode === snapshot.focusNode && selection.focusOffset === snapshot.focus,
          range: !!range && range.startContainer === snapshot.startNode && range.startOffset === snapshot.start &&
            range.endContainer === snapshot.endNode && range.endOffset === snapshot.end,
        };
      });
      await before.dispose();
      expect.soft(unchanged, `${item.name}：正文和选区不变`).toEqual({ dom: true, text: true, direction: true, range: true });
      if (item.formula || item.table || item.math) {
        const structure = await page.evaluate(html => {
          const doc = new DOMParser().parseFromString(html, 'text/html');
          return {
            math: doc.querySelectorAll('math').length,
            table: doc.querySelector('table')?.getAttribute('border'),
            header: !!doc.querySelector('th'),
            katex: !!doc.querySelector('.katex-html'),
          };
        }, payload['text/html']);
        expect(structure.math).toBe(item.mathCount ?? 1);
        expect(structure.katex).toBe(false);
        if (item.math) expect(structure.table).toBeUndefined();
        if (item.table) {
          expect(structure.table).toBe('1');
          expect(structure.header).toBe(item.header ?? false);
        }
      }
    });
  }
});
