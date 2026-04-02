/**
 * 消息根节点定位模块：
 * 负责判断 assistant 按钮归属、反查消息容器，并提供定位失败时的调试日志。
 */

/**
 * 判断复制按钮是否位于 assistant turn。
 *
 * @param {HTMLButtonElement} button 官方复制按钮。
 * @returns {boolean}
 */
export function isAssistantTurnButton(button: HTMLButtonElement): boolean {
  if (button.closest('section[data-turn="assistant"]')) return true;
  if (button.closest('[data-message-author-role="assistant"]')) return true;
  return false;
}

/**
 * 从复制按钮反查当前 assistant 消息容器。
 *
 * @param {HTMLButtonElement} button 官方复制按钮。
 * @returns {HTMLElement | null}
 */
export function findMessageRoot(button: HTMLButtonElement): HTMLElement | null {
  const assistantSection = button.closest<HTMLElement>('section[data-turn="assistant"]');
  if (assistantSection) {
    const roleContainer = assistantSection.querySelector<HTMLElement>('[data-message-author-role="assistant"]');
    if (roleContainer) return roleContainer;

    const markdownRoot = assistantSection.querySelector<HTMLElement>('.markdown.prose');
    if (markdownRoot) return markdownRoot;

    const agentTurn = assistantSection.querySelector<HTMLElement>('.agent-turn');
    if (agentTurn) return agentTurn;

    return assistantSection;
  }

  const roleContainer = button.closest<HTMLElement>('[data-message-author-role="assistant"]');
  if (roleContainer) return roleContainer;

  const article = button.closest<HTMLElement>('article');
  if (article) return article;

  const agentTurn = button.closest<HTMLElement>('.agent-turn');
  if (agentTurn) return agentTurn;

  return button.closest<HTMLElement>('div.group');
}

/**
 * 失败时打印关键 DOM 片段，便于定位选择器失效。
 *
 * @param {HTMLButtonElement} officialButton 官方复制按钮。
 * @returns {void}
 */
export function logMarkdownCopyDebugDom(officialButton: HTMLButtonElement): void {
  const htmlLimit = 5000;
  const safeOuter = (el: Element | null): string => {
    if (!el) return '(null)';
    const html = (el as HTMLElement).outerHTML ?? '';
    return html.length > htmlLimit ? `${html.slice(0, htmlLimit)}\n...<truncated>` : html;
  };

  const directMessage = officialButton.closest('[data-message-author-role="assistant"]');
  const directArticle = officialButton.closest('article');
  const directGroup = officialButton.closest('div.group');

  const parentChain: string[] = [];
  let current: HTMLElement | null = officialButton;
  for (let depth = 0; depth < 5 && current; depth += 1) {
    parentChain.push(
      [
        current.tagName.toLowerCase(),
        current.id ? `#${current.id}` : '',
        current.className ? `.${current.className.replace(/\s+/g, '.')}` : '',
      ].join(''),
    );
    current = current.parentElement;
  }

  console.groupCollapsed('[MD-COPY][DEBUG] failed to resolve message root');
  console.log('parentChain', parentChain);
  console.log('officialButton.outerHTML', safeOuter(officialButton));
  console.log('closest assistant container', safeOuter(directMessage));
  console.log('closest article', safeOuter(directArticle));
  console.log('closest group', safeOuter(directGroup));
  console.groupEnd();
}
