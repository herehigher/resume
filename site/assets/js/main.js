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
import { setActivePrintPage } from './ui/active-print-page.js';
import { createEmbeddedPhotoUrl } from './utils/embedded-photo-url.js';

const persistence = createDraftStorage(window.localStorage);
let storedState = null;
let storageError = getDraftStorageCapabilityError({
  crypto: window.crypto,
  isSecureContext: window.isSecureContext
});
let recoveredDraft = false;
let draftLoadResult = null;
if (!storageError) {
  try {
    const result = await persistence.loadAndRecoverUnreadableDraft();
    storedState = result.state;
    recoveredDraft = result.recovered;
    draftLoadResult = persistence.getLastLoadResult();
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

function syncActivePrintPage(state) {
  const activeLocale = state.settings.locale;
  setActivePrintPage(document, activeLocale, state.settings.pageSizeByLocale[activeLocale]);
}

syncActivePrintPage(store.getState());
store.subscribe((state) => syncActivePrintPage(state));

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
} else if (draftLoadResult?.status === 'salvaged') {
  const message = document.getElementById('globalMessage');
  message.textContent = {
    ja: '保存済みの下書きの一部を安全に読み込み、現在の形式に更新しました。',
    'zh-CN': '已安全读取保存草稿中的可用内容，并更新为当前格式。',
    en: 'Usable content from your saved draft was restored and updated to the current format.'
  }[locale];
} else if (draftLoadResult?.status === 'too-old') {
  const message = document.getElementById('globalMessage');
  message.textContent = {
    ja: '保存済みの下書きが古すぎたため、新しい下書きに安全に置き換えました。',
    'zh-CN': '保存的草稿版本过旧，已安全替换为新的草稿。',
    en: 'Your saved draft was too old and was safely replaced with a new draft.'
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
  },
  onClearDraft(locale) {
    const editor = { ja: japaneseEditor, 'zh-CN': chineseEditor, en: englishEditor }[locale];
    editor?.clearDraft();
  }
});
