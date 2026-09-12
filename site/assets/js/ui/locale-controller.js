import { SUPPORTED_LOCALES } from '../config.js';
import { getMessages } from '../i18n/index.js';
import { saveLocalePreference } from '../state/locale-preference.js';
import { confirmAction } from './confirmation-dialog.js';
import { messageForDraftStorageError } from './draft-storage-error.js';

const publicEntryPaths = Object.freeze({
  ja: '../',
  'zh-CN': '../zh-cn/',
  en: '../en/'
});

function downloadState(store, locale) {
  const blob = new Blob([store.exportJson()], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  const date = new Date().toISOString().slice(0, 10);
  anchor.href = url;
  anchor.download = `resume-studio-${locale}-${date}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function persistLocaleChange(store, storage, locale) {
  store.update((state) => {
    state.settings.locale = locale;
  }, { type: 'locale' });
  saveLocalePreference(storage, locale);
}

export function initLocaleController(store, {
  locale: initialLocale,
  preferenceStorage = window.localStorage,
  statusController = null,
  onLocaleApplied = () => {},
  onClearDraft = () => {}
} = {}) {
  const select = document.getElementById('localeSelect');
  const workspaces = {
    ja: document.getElementById('japaneseWorkspace'),
    'zh-CN': document.getElementById('chineseWorkspace'),
    en: document.querySelector('[data-english-editor]')
  };
  const pending = document.getElementById('localePending');
  const mobileSwitch = document.querySelector('.mobile-view-switch');
  const documentSwitcher = document.querySelector('.document-switcher');
  const printButton = document.getElementById('printButton');
  const sampleButton = document.getElementById('loadSampleButton');
  const dataMenuSummary = document.getElementById('dataMenuSummary');
  const dataMenuLabel = document.getElementById('dataMenuLabel');
  const dataMenuShortLabel = document.getElementById('dataMenuShortLabel');
  const exportButton = document.getElementById('exportDataButton');
  const importButton = document.getElementById('importDataButton');
  const clearDraftButton = document.getElementById('clearDraftButton');
  const importInput = document.getElementById('importDataInput');
  const brand = document.querySelector('.brand');
  const dataMenu = dataMenuSummary.closest('.data-menu');
  let locale = initialLocale || store.getState().settings.locale;
  let renderedLocale = '';
  let dataMenuPointerDownInside = false;

  function showMessage(message, { persistent = false, tone = 'success' } = {}) {
    statusController?.showAppNotice(message, { persistent, tone });
  }

  function applyLocale(force = false) {
    if (!force && renderedLocale === locale) return;
    renderedLocale = locale;
    const copy = getMessages(locale);
    const isJapanese = locale === 'ja';

    document.documentElement.lang = copy.htmlLang;
    document.title = copy.pageTitle;
    brand.href = publicEntryPaths[locale];
    brand.setAttribute('aria-label', copy.brandEntry);
    document.getElementById('brandSubtitle').textContent = copy.brandSubtitle;
    document.getElementById('localeLabel').textContent = copy.localeLabel;
    dataMenuSummary.setAttribute('aria-label', copy.backupMenuLabel);
    dataMenuLabel.textContent = copy.backupMenuLabel;
    dataMenuShortLabel.textContent = copy.backupMenuShortLabel;
    document.getElementById('appNoticeDismiss').textContent = copy.dismissNotice;
    document.getElementById('exportDataButton').textContent = copy.exportData;
    document.getElementById('importDataButton').textContent = copy.importData;
    clearDraftButton.textContent = copy.clearDraft;
    document.getElementById('printButtonLabel').textContent = copy.printDocument;
    document.getElementById('pendingTitle').textContent = copy.pendingTitle;
    document.getElementById('pendingBody').textContent = copy.pendingBody;
    select.value = locale;

    Object.entries(workspaces).forEach(([workspaceLocale, workspace]) => {
      workspace.hidden = workspaceLocale !== locale;
    });
    pending.hidden = true;
    mobileSwitch.hidden = !isJapanese;
    documentSwitcher.hidden = !isJapanese;
    printButton.hidden = false;
    sampleButton.hidden = !isJapanese;
    onLocaleApplied(locale);
  }

  select.addEventListener('change', async () => {
    if (!SUPPORTED_LOCALES.includes(select.value)) return;
    const nextLocale = select.value;
    locale = nextLocale;
    store.update((state) => {
      state.settings.locale = nextLocale;
    }, { type: 'locale' });
    const url = new URL(window.location.href);
    url.searchParams.set('lang', nextLocale);
    window.history.replaceState(null, '', url);
    applyLocale(true);
    try {
      saveLocalePreference(preferenceStorage, nextLocale);
    } catch (_error) {
      showMessage(getMessages(nextLocale).localeSaveError, { persistent: true, tone: 'error' });
    }
  });

  exportButton.addEventListener('click', () => {
    const copy = getMessages(locale);
    try {
      downloadState(store, locale);
      dataMenu.open = false;
      showMessage(copy.exportSuccess);
    } catch {
      dataMenu.open = false;
      showMessage(copy.exportError, { persistent: true, tone: 'error' });
    }
  });

  importButton.addEventListener('click', () => importInput.click());
  clearDraftButton.addEventListener('click', () => onClearDraft(locale));
  importInput.addEventListener('change', async () => {
    const file = importInput.files?.[0];
    if (!file) return;
    const currentCopy = getMessages(locale);
    let prepared;
    try {
      prepared = store.prepareImport(await file.text());
      const confirmed = await confirmAction({
        title: currentCopy.importConfirmTitle,
        body: currentCopy.importConfirmBody,
        cancel: currentCopy.importConfirmCancel,
        confirm: currentCopy.importConfirm
      });
      if (!confirmed) {
        store.cancelImport();
        return;
      }
      await store.importPrepared(prepared);
      applyLocale(true);
      dataMenu.open = false;
      showMessage(prepared.status === 'salvaged' ? currentCopy.importSalvaged : getMessages(locale).importSuccess);
    } catch (error) {
      store.cancelImport();
      dataMenu.open = false;
      showMessage(messageForDraftStorageError(error, locale, currentCopy.importError), { persistent: true, tone: 'error' });
    } finally {
      importInput.value = '';
    }
  });

  dataMenu.addEventListener('focusout', () => {
    window.queueMicrotask(() => {
      const activeModal = document.activeElement?.closest?.('dialog[open]');
      if (dataMenu.open && !dataMenuPointerDownInside && !activeModal && !dataMenu.contains(document.activeElement)) dataMenu.open = false;
    });
  });
  dataMenu.addEventListener('pointerdown', () => {
    dataMenuPointerDownInside = true;
  });
  document.addEventListener('pointerdown', (event) => {
    const activeModal = event.target.closest?.('dialog[open]');
    if (!dataMenu.contains(event.target)) dataMenuPointerDownInside = false;
    if (dataMenu.open && !activeModal && !dataMenu.contains(event.target)) dataMenu.open = false;
  });
  document.addEventListener('pointerup', () => {
    dataMenuPointerDownInside = false;
  });
  document.addEventListener('pointercancel', () => {
    dataMenuPointerDownInside = false;
  });
  dataMenu.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !dataMenu.open) return;
    event.preventDefault();
    dataMenu.open = false;
    dataMenuSummary.focus();
  });

  store.subscribe((_state, event) => {
    if (['locale', 'reset', 'reload'].includes(event.type)) applyLocale(true);
  });

  applyLocale(true);
}
