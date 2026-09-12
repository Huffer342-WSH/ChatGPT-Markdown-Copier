/** 设置页与工具栏弹窗共用的设置界面。 */
import { DEFAULT_INLINE_CODE, extensionApi, INLINE_CODE_KEY, observeBooleanSetting, PLAIN_CODE_KEY } from './storage';
import './page.css';

/** 初始化设置控件，保存后立即同步，失败时显示提示并恢复状态。 */
async function initializeSettings(): Promise<void> {
  const zh = navigator.language.toLowerCase().startsWith('zh');
  document.documentElement.lang = zh ? 'zh-CN' : 'en';
  document.title = zh ? '复制助手设置' : 'Copier settings';
  const root = document.querySelector('main')!;
  document.body.classList.toggle('popup', location.pathname.endsWith('/popup.html'));
  const options = [
    { key: INLINE_CODE_KEY, title: zh ? '单击选中行内代码' : 'Click to select inline code',
      detail: zh ? '单击回复中的行内代码即可选中全文，然后按 Ctrl+C（Mac 为 Command+C）复制。不影响多行代码块；拖动选取或按住修饰键时保留原有行为。' : 'Click inline code to select all of it, then press Ctrl+C (Command+C on Mac). Multiline blocks, dragging, and modifier clicks are unchanged.' },
    { key: PLAIN_CODE_KEY, title: zh ? '代码内复制不带反引号' : 'Copy code without backticks',
      detail: zh ? '默认开启。选区完全在同一段行内代码或多行代码内时复制纯代码，保留空白。关闭后保留 Markdown 代码标记。选区包含代码外内容时，始终保留代码标记。' : 'On by default. Selections within one inline or multiline code segment copy plain code, preserving whitespace. Turn off to include Markdown markers. Selections extending outside code always retain markers.' },
  ];
  root.innerHTML = `<header><h1>${zh ? '偏好设置' : 'Preferences'}</h1></header>
    <section class="settings-card">${options.map(({ key, title, detail }) => `
      <div class="setting">
        <div class="setting-row">
          <label for="${key}">${title}</label>
          <button class="info" type="button" aria-label="${zh ? '查看详细说明：' : 'Details: '}${title}" aria-expanded="false" aria-controls="${key}-detail">!</button>
          <input class="switch" role="switch" id="${key}" data-key="${key}" type="checkbox" disabled>
        </div>
        <p class="detail" id="${key}-detail" hidden>${detail}</p>
      </div>`).join('')}</section><p class="status" role="status" aria-live="polite"></p>`;
  for (const button of root.querySelectorAll<HTMLButtonElement>('.info')) {
    button.addEventListener('click', () => {
      const expanded = button.getAttribute('aria-expanded') !== 'true';
      button.setAttribute('aria-expanded', String(expanded));
      document.getElementById(button.getAttribute('aria-controls')!)!.hidden = !expanded;
    });
  }
  const status = root.querySelector<HTMLElement>('[role="status"]')!;
  for (const input of root.querySelectorAll<HTMLInputElement>('input')) {
    const key = input.dataset.key!;
    let saved = DEFAULT_INLINE_CODE;
    try {
      await observeBooleanSetting(key, (enabled) => { saved = enabled; input.checked = enabled; });
      if (!extensionApi()?.storage) throw new Error('Storage unavailable');
      input.disabled = false;
    } catch {
      status.textContent = zh ? '无法读取设置，请重新打开此页面。' : 'Unable to load settings. Please reopen this page.';
      return;
    }
    input.addEventListener('change', async () => {
      input.disabled = true;
      try {
        await extensionApi()!.storage.local.set({ [key]: input.checked });
        saved = input.checked;
        status.textContent = '';
      } catch {
        input.checked = saved;
        status.textContent = zh ? '保存失败，请重试。' : 'Unable to save. Please try again.';
      } finally {
        input.disabled = false;
      }
    });
    }
  if (location.pathname.endsWith('/popup.html')) {
    const button = document.createElement('button');
    button.className = 'open-settings';
    button.textContent = zh ? '打开设置页' : 'Open settings';
    button.addEventListener('click', () => {
      void extensionApi()!.runtime.openOptionsPage().catch(() => {
        status.textContent = zh ? '无法打开设置页。' : 'Unable to open settings.';
      });
    });
    root.append(button);
  }
}
void initializeSettings();
