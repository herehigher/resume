import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from '../config.js';
import en from './en.js';
import ja from './ja.js';
import zhCN from './zh-CN.js';

export const messages = Object.freeze({ ja, 'zh-CN': zhCN, en });

export function normalizeLocale(value) {
  if (!value) return null;
  const normalized = String(value).toLowerCase();
  if (normalized === 'ja' || normalized.startsWith('ja-')) return 'ja';
  if (
    normalized === 'zh'
    || normalized === 'zh-cn'
    || normalized === 'zh-sg'
    || normalized === 'zh-hans'
    || normalized.startsWith('zh-hans-')
  ) return 'zh-CN';
  if (normalized === 'en' || normalized.startsWith('en-')) return 'en';
  return null;
}

export function resolveLocale({ search = '', storedLocale = '', browserLanguages = [] } = {}) {
  const queryLocale = normalizeLocale(new URLSearchParams(search).get('lang'));
  if (queryLocale) return queryLocale;
  if (SUPPORTED_LOCALES.includes(storedLocale)) return storedLocale;
  for (const language of browserLanguages) {
    const locale = normalizeLocale(language);
    if (locale) return locale;
  }
  return DEFAULT_LOCALE;
}

export function getMessages(locale) {
  return messages[locale] || messages[DEFAULT_LOCALE];
}
