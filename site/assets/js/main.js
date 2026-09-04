import { STORAGE_KEY } from './config.js';
import { resolveLocale } from './i18n/index.js';
import { createDefaultState, cloneData } from './state/defaults.js';
import { createDraftStorage, getDraftStorageCapabilityError } from './state/storage.js';
import { loadLocalePreference } from './state/locale-preference.js';
import { createStore } from './state/store.js';
import { messageForDraftStorageError } from './ui/draft-storage-error.js';
import { renderEnglishWorkspace, initEnglishEditor } from './ui/english-editor.js';
import { initJapaneseEditor } from './ui/japanese-editor.js';
import { initChineseEditor } from './ui/chinese-editor.js';
import { initLocaleController } from './ui/locale-controller.js';
import { initPrivacySecurity } from './ui/privacy-security.js';
import { createEmbeddedPhotoUrl } from './utils/embedded-photo-url.js';

const persistence = createDraftStorage(window.localStorage);
let storedState = null;
let storageError = getDraftStorageCapabilityError({
  crypto: window.crypto,
  isSecureContext: window.isSecureContext
});
let recoveredDraft = false;
if (!storageError) {
  try {
    const result = await persistence.loadAndRecoverUnreadableDraft();
    storedState = result.state;
    recoveredDraft = result.recovered;
  } catch (error) {
    storageError = error;
  }
}
let hasStoredDraft = Boolean(storedState);
if (storageError?.code === 'crypto-unavailable') {
  try {
    hasStoredDraft = window.localStorage.getItem(STORAGE_KEY) !== null;
  } catch {
    hasStoredDraft = false;
  }
}
const locale = resolveLocale({
  search: window.location.search,
  storedLocale: loadLocalePreference(window.localStorage),
  browserLanguages: navigator.languages || [navigator.language]
});
const initialState = storedState ? cloneData(storedState) : createDefaultState(locale);
initialState.settings.locale = locale;

const store = createStore({
  storage: window.localStorage,
  initialState,
  persistence,
  hasStoredState: hasStoredDraft
});

document.getElementById('chineseWorkspace').insertAdjacentHTML('afterend', renderEnglishWorkspace());

const embeddedPhotoUrl = createEmbeddedPhotoUrl();
const japaneseEditor = initJapaneseEditor(store, { embeddedPhotoUrl });
const chineseEditor = initChineseEditor(store, { embeddedPhotoUrl });
const englishEditor = initEnglishEditor(store);
const privacySecurity = initPrivacySecurity(locale, {
  draftStorageAvailable: storageError?.code !== 'crypto-unavailable'
});
if (storageError) {
  const message = document.getElementById('globalMessage');
  message.textContent = messageForDraftStorageError(storageError, locale, {
    ja: '保存済みの下書きを安全に読み込めませんでした。元の保存データは変更していません。',
    'zh-CN': '无法安全读取已保存的草稿。原有保存数据未被修改。',
    en: 'The saved draft could not be read securely. The original saved data was not changed.'
  }[locale]);
  message.classList.add('is-error');
} else if (recoveredDraft) {
  const message = document.getElementById('globalMessage');
  message.textContent = {
    ja: '保存済みの下書きに問題があったため、新しい既定の下書きに自動復旧しました。',
    'zh-CN': '已因保存的草稿出现问题而自动恢复为新的默认草稿。',
    en: 'Because the saved draft had a problem, it was automatically recovered to a new default draft.'
  }[locale];
}
initLocaleController(store, {
  locale,
  preferenceStorage: window.localStorage,
  onLocaleApplied(locale) {
    privacySecurity.applyLocale(locale);
    if (locale === 'ja') japaneseEditor.refresh();
    if (locale === 'zh-CN') chineseEditor.refresh();
    if (locale === 'en') englishEditor.render();
  }
});
