/**
 * 页面注入文案 i18n 模块：
 * 独立于 chrome.i18n，强制跟随 ChatGPT 页面 html lang。
 */

import i18next from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import enMessages from '../src/locales/web/en.json';
import zhCnMessages from '../src/locales/web/zh_CN.json';

export type WebLocale = 'en' | 'zh_CN';

const FALLBACK_LOCALE: WebLocale = 'en';
const SUPPORTED_LOCALES: WebLocale[] = ['en', 'zh_CN'];

let initializePromise: Promise<void> | null = null;

/**
 * 初始化页面 i18n，并立即按 html lang 同步当前语言。
 *
 * @returns {Promise<void>}
 */
export async function initWebI18n(): Promise<void> {
  if (!initializePromise) {
    initializePromise = (async () => {
      const detector = new LanguageDetector();
      await i18next.use(detector).init({
        resources: {
          en: { translation: enMessages },
          zh_CN: { translation: zhCnMessages },
        },
        supportedLngs: SUPPORTED_LOCALES,
        fallbackLng: FALLBACK_LOCALE,
        load: 'currentOnly',
        interpolation: { escapeValue: false },
        returnNull: false,
        detection: {
          order: ['htmlTag'],
          caches: [],
          htmlTag: document.documentElement,
          convertDetectedLanguage: (language) => normalizeWebLocale(language),
        },
      });
      await syncWebLanguageFromHtml();
    })();
  }

  await initializePromise;
}

/**
 * 将任意语言码归一化为当前支持的语言集合。
 *
 * @param {string | null | undefined} language 原始语言码。
 * @returns {WebLocale}
 */
export function normalizeWebLocale(language: string | null | undefined): WebLocale {
  const normalized = `${language ?? ''}`.trim().toLowerCase().replace('_', '-');
  if (normalized.startsWith('zh')) return 'zh_CN';
  if (normalized.startsWith('en')) return 'en';
  return FALLBACK_LOCALE;
}

/**
 * 从 html lang 解析目标语言。
 *
 * @returns {WebLocale}
 */
export function resolveLangFromHtml(): WebLocale {
  if (typeof document === 'undefined') return FALLBACK_LOCALE;
  return normalizeWebLocale(document.documentElement.getAttribute('lang'));
}

/**
 * 强制把 i18next 当前语言切换为 html lang 对应值。
 *
 * @returns {Promise<WebLocale>} 切换后的语言码。
 */
export async function syncWebLanguageFromHtml(): Promise<WebLocale> {
  const nextLocale = resolveLangFromHtml();
  if (!i18next.isInitialized) return nextLocale;
  if (i18next.language !== nextLocale) {
    await i18next.changeLanguage(nextLocale);
  }
  return nextLocale;
}

/**
 * 读取页面注入文案。
 *
 * @param {string} key 文案 key。
 * @param {string} fallback 缺失时回退值。
 * @returns {string}
 */
export function tWeb(key: string, fallback: string): string {
  if (!i18next.isInitialized) return fallback;
  const resolved = i18next.t(key, { defaultValue: fallback });
  return typeof resolved === 'string' ? resolved : fallback;
}

