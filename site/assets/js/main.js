import { resolveLocale } from './i18n/index.js';
import { createDefaultState, cloneData } from './state/defaults.js';
import { loadStoredState } from './state/storage.js';
import { createStore } from './state/store.js';
import { initChineseEditor } from './ui/chinese-editor.js';
import { initJapaneseEditor } from './ui/japanese-editor.js';
import { initLocaleController } from './ui/locale-controller.js';

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

const japaneseEditor = initJapaneseEditor(store);
const chineseEditor = initChineseEditor(store);
initLocaleController(store, {
  beforeLocalePersist() {
    japaneseEditor.restoreDraftBeforePersistence();
    chineseEditor.restoreDraftBeforePersistence();
  },
  onLocaleApplied(locale) {
    if (locale === 'ja') japaneseEditor.refresh();
    if (locale === 'zh-CN') chineseEditor.refresh();
  }
});
