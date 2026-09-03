import { LOCALE_PREFERENCE_KEY, SUPPORTED_LOCALES } from '../config.js';

const PREFERENCE_VERSION = 1;

function validLocale(locale) {
  return SUPPORTED_LOCALES.includes(locale) ? locale : null;
}

export function loadLocalePreference(storage) {
  try {
    const value = storage?.getItem(LOCALE_PREFERENCE_KEY);
    if (!value) return null;
    const parsed = JSON.parse(value);
    return parsed?.version === PREFERENCE_VERSION ? validLocale(parsed.locale) : null;
  } catch {
    return null;
  }
}

export function saveLocalePreference(storage, locale) {
  const safeLocale = validLocale(locale);
  if (!safeLocale) throw new TypeError(`Unsupported locale preference: ${locale}`);
  storage.setItem(LOCALE_PREFERENCE_KEY, JSON.stringify({ version: PREFERENCE_VERSION, locale: safeLocale }));
  return safeLocale;
}
