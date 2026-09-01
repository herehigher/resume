import { resolveLocale } from './i18n/index.js';
import { createDefaultState, cloneData } from './state/defaults.js';
import { loadStoredState } from './state/storage.js';
import { createStore } from './state/store.js';
import { renderEnglishWorkspace, initEnglishEditor } from './ui/english-editor.js';
import { initJapaneseEditor } from './ui/japanese-editor.js';
import { initChineseEditor } from './ui/chinese-editor.js';
import { initLocaleController } from './ui/locale-controller.js';
import { initPrivacySecurity } from './ui/privacy-security.js';
import { createEmbeddedPhotoUrl } from './utils/embedded-photo-url.js';

const storedState = loadStoredState(window.localStorage);
const locale = resolveLocale({
  search: window.location.search,
  storedLocale: storedState?.settings.locale,
  browserLanguages: navigator.languages || [navigator.language]
});
const initialState = storedState ? cloneData(storedState) : createDefaultState(locale);
initialState.settings.locale = locale;

const store = createStore({
  storage: window.localStorage,
  initialState
});

document.getElementById('chineseWorkspace').insertAdjacentHTML('afterend', renderEnglishWorkspace());

const embeddedPhotoUrl = createEmbeddedPhotoUrl();
const japaneseEditor = initJapaneseEditor(store, { embeddedPhotoUrl });
const chineseEditor = initChineseEditor(store, { embeddedPhotoUrl });
const englishEditor = initEnglishEditor(store);
const privacySecurity = initPrivacySecurity(locale);
initLocaleController(store, {
  beforeLocalePersist() {
    japaneseEditor.restoreDraftBeforePersistence();
    chineseEditor.restoreDraftBeforePersistence();
    englishEditor.restoreDraftBeforePersistence();
  },
  onLocaleApplied(locale) {
    privacySecurity.applyLocale(locale);
    if (locale === 'ja') japaneseEditor.refresh();
    if (locale === 'zh-CN') chineseEditor.refresh();
    if (locale === 'en') englishEditor.render();
  }
});
