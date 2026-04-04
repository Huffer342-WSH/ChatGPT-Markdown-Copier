/**
 * 扩展 i18n 工具：
 * 对 chrome.i18n.getMessage 做轻量封装，并提供回退文案。
 */

type ChromeI18nApi = {
  getMessage?: (messageName: string, substitutions?: string | string[]) => string;
};

type ChromeWithI18n = {
  i18n?: ChromeI18nApi;
};

/**
 * 获取国际化文案。
 *
 * @param {string} messageName messages.json 中的 key。
 * @param {string} fallback 缺失时的兜底文案。
 * @param {string | string[]} [substitutions] 可选占位符参数。
 * @returns {string}
 */
export function t(messageName: string, fallback: string, substitutions?: string | string[]): string {
  const chromeApi = (globalThis as { chrome?: ChromeWithI18n }).chrome;
  const resolved = chromeApi?.i18n?.getMessage?.(messageName, substitutions) ?? '';
  return resolved || fallback;
}

