import { resolveLocale } from './i18n/index.js';
import { createDefaultState, cloneData } from './state/defaults.js';
import { createDraftStorage } from './state/storage.js';
import { createStore } from './state/store.js';
import { renderEnglishWorkspace, initEnglishEditor } from './ui/english-editor.js';
import { initJapaneseEditor } from './ui/japanese-editor.js';
import { initChineseEditor } from './ui/chinese-editor.js';
import { initLocaleController } from './ui/locale-controller.js';
import { initPrivacySecurity } from './ui/privacy-security.js';
import { createEmbeddedPhotoUrl } from './utils/embedded-photo-url.js';

const persistence = createDraftStorage(window.localStorage);
let storedState = null;
let storageError = null;
try {
  storedState = await persistence.load();
} catch (error) {
  storageError = error;
}
const locale = resolveLocale({
  search: window.location.search,
  storedLocale: storedState?.settings.locale,
  browserLanguages: navigator.languages || [navigator.language]
});
const initialState = storedState ? cloneData(storedState) : createDefaultState(locale);
initialState.settings.locale = locale;

const store = createStore({
  storage: window.localStorage,
  initialState,
  persistence,
  hasStoredState: Boolean(storedState)
});

document.getElementById('chineseWorkspace').insertAdjacentHTML('afterend', renderEnglishWorkspace());

const embeddedPhotoUrl = createEmbeddedPhotoUrl();
const japaneseEditor = initJapaneseEditor(store, { embeddedPhotoUrl });
const chineseEditor = initChineseEditor(store, { embeddedPhotoUrl });
const englishEditor = initEnglishEditor(store);
const privacySecurity = initPrivacySecurity(locale);
if (storageError) {
  const message = document.getElementById('globalMessage');
  message.textContent = {
    ja: '保存済みの下書きを安全に読み込めませんでした。元の保存データは変更していません。',
    'zh-CN': '无法安全读取已保存的草稿。原有保存数据未被修改。',
    en: 'The saved draft could not be read securely. The original saved data was not changed.'
  }[locale];
  message.classList.add('is-error');
}
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
