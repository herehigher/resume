import { resolveLocale } from './i18n/index.js';
import { createDefaultState, cloneData } from './state/defaults.js';
import { loadStoredState } from './state/storage.js';
import { createStore } from './state/store.js';
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

initJapaneseEditor(store);
initLocaleController(store);
