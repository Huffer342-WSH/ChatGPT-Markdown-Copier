/** 扩展设置：使用本机存储，在设置页、弹窗和内容脚本间同步。 */
export const INLINE_CODE_KEY = 'selectInlineCodeOnClick';
export const DEFAULT_INLINE_CODE = true;
export const PLAIN_CODE_KEY = 'copyCodeWithoutMarkers';

/** 获取扩展 API；普通网页或离线测试环境不提供此 API。 */
export function extensionApi(): typeof import('wxt/browser').browser | undefined {
  return (globalThis as unknown as { chrome?: typeof import('wxt/browser').browser }).chrome;
}

/** 订阅设置并读取初始值，避免异步读取覆盖更新事件。 */
export async function observeInlineCodeSetting(onChange: (enabled: boolean) => void): Promise<() => void> {
  return observeBooleanSetting(INLINE_CODE_KEY, onChange);
}

/** 订阅默认开启的布尔设置，并防止读取与变更事件竞争。 */
export async function observeBooleanSetting(key: string, onChange: (enabled: boolean) => void): Promise<() => void> {
  const api = extensionApi();
  if (!api?.storage) return () => {};
  let revision = 0;
  /** 接收本机设置变更；删除设置时恢复默认值。 */
  const listener: Parameters<typeof api.storage.onChanged.addListener>[0] = (changes, area) => {
    if (area !== 'local' || !changes[key]) return;
    revision++;
    onChange(changes[key].newValue !== false);
  };
  api.storage.onChanged.addListener(listener);
  try {
    const values = await api.storage.local.get(key);
    if (revision === 0) onChange(values[key] !== false);
  } catch (error) {
    api.storage.onChanged.removeListener(listener);
    throw error;
  }
  return () => api.storage.onChanged.removeListener(listener);
}
