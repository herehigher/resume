import { STORAGE_KEY } from './config.js?v=0.4.6';
import { getMessages, resolveLocale } from './i18n/index.js?v=0.4.6';
import { createDefaultState, cloneData } from './state/defaults.js?v=0.4.6';
import { createDraftStorage, getDraftStorageCapabilityError } from './state/storage.js?v=0.4.6';
import { loadLocalePreference } from './state/locale-preference.js?v=0.4.6';
import { createStore } from './state/store.js?v=0.4.6';
import { loadVersionedDraft } from './state/versioned-draft.js?v=0.4.6';
import { messageForDraftStorageError } from './ui/draft-storage-error.js?v=0.4.6';
import { initStatusController } from './ui/status-controller.js?v=0.4.6';
import { renderEnglishWorkspace, initEnglishEditor } from './ui/english-editor.js?v=0.4.6';
import { initJapaneseEditor } from './ui/japanese-editor.js?v=0.4.6';
import { initChineseEditor } from './ui/chinese-editor.js?v=0.4.6';
import { initLocaleController } from './ui/locale-controller.js?v=0.4.6';
import { initPrivacySecurity } from './ui/privacy-security.js?v=0.4.6';
import { setActivePrintPage } from './ui/active-print-page.js?v=0.4.6';
import { createEmbeddedPhotoUrl } from './utils/embedded-photo-url.js?v=0.4.6';

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
    const result = await loadVersionedDraft(window.localStorage, { currentPersistence: persistence });
    storedState = result.state;
    recoveredDraft = result.recovered;
    draftLoadResult = result.loadResult;
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
const statusController = initStatusController();
const japaneseEditor = initJapaneseEditor(store, { embeddedPhotoUrl, statusController });
const chineseEditor = initChineseEditor(store, { embeddedPhotoUrl, statusController });
const englishEditor = initEnglishEditor(store, { embeddedPhotoUrl, statusController });
const privacySecurity = initPrivacySecurity(locale, {
  draftStorageAvailable: storageError?.code !== 'crypto-unavailable'
});
if (storageError) {
  const storageNotice = (activeLocale) => messageForDraftStorageError(storageError, activeLocale, {
    ja: '保存済みの下書きを安全に読み込めませんでした。元の保存データは変更していません。',
    'zh-CN': '无法安全读取已保存的草稿。原有保存数据未被修改。',
    en: 'The saved draft could not be read securely. The original saved data was not changed.'
  }[activeLocale]);
  statusController.showAppNotice(storageNotice(locale), { tone: 'error', persistent: true, blocking: true });
  statusController.setDraftStatus(locale, getMessages(locale).draftStorageUnavailable, 'error', { announce: false });
} else if (recoveredDraft) {
  statusController.showAppNotice({
    ja: '保存済みの下書きに問題があったため、新しい既定の下書きに自動復旧しました。',
    'zh-CN': '已因保存的草稿出现问题而自动恢复为新的默认草稿。',
    en: 'Because the saved draft had a problem, it was automatically recovered to a new default draft.'
  }[locale], { tone: 'success' });
} else if (draftLoadResult?.status === 'migrated') {
  statusController.showAppNotice(getMessages(locale).draftMigrated);
} else if (draftLoadResult?.status === 'migration-incomplete') {
  statusController.showAppNotice(getMessages(locale).draftMigrationIncomplete, { tone: 'error', persistent: true });
} else if (draftLoadResult?.status === 'salvaged') {
  statusController.showAppNotice(getMessages(locale).draftSalvaged);
} else if (draftLoadResult?.status === 'too-old') {
  statusController.showAppNotice(getMessages(locale).draftTooOld);
}
initLocaleController(store, {
  locale,
  statusController,
  preferenceStorage: window.localStorage,
  onBeforeLocaleChange(currentLocale) {
    const editor = { ja: japaneseEditor, 'zh-CN': chineseEditor, en: englishEditor }[currentLocale];
    editor?.restoreDraftBeforePersistence();
  },
  onLocaleApplied(locale) {
    if (storageError) {
      const message = messageForDraftStorageError(storageError, locale, {
        ja: '保存済みの下書きを安全に読み込めませんでした。元の保存データは変更していません。',
        'zh-CN': '无法安全读取已保存的草稿。原有保存数据未被修改。',
        en: 'The saved draft could not be read securely. The original saved data was not changed.'
      }[locale]);
      statusController.showAppNotice(message, { tone: 'error', persistent: true, blocking: true, announce: false });
      statusController.setDraftStatus(locale, getMessages(locale).draftStorageUnavailable, 'error', { announce: false });
    }
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
