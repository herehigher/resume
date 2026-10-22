import { SUPPORTED_LOCALES } from '../config.js?v=0.4.6';
import { getMessages } from '../i18n/index.js?v=0.4.6';
import { exportMarkdown } from '../utils/markdown-export.js?v=0.4.6';
import { saveLocalePreference } from '../state/locale-preference.js?v=0.4.6';
import { confirmAction } from './confirmation-dialog.js?v=0.4.6';
import { messageForDraftStorageError } from './draft-storage-error.js?v=0.4.6';

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
  onBeforeLocaleChange = () => {},
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
  const markdownButton = document.getElementById('exportMarkdownButton');
  const importButton = document.getElementById('importDataButton');
  const clearDraftButton = document.getElementById('clearDraftButton');
  const importInput = document.getElementById('importDataInput');
  const brand = document.querySelector('.brand');
  const dataMenu = dataMenuSummary.closest('.data-menu');
  const exportMenuSummary = document.getElementById('exportMenuSummary');
  const exportMenu = exportMenuSummary.closest('.export-menu');
  let locale = initialLocale || store.getState().settings.locale;
  let renderedLocale = '';

  function showMessage(message, { persistent = false, source = null, tone = 'success' } = {}) {
    statusController?.showAppNotice(message, { persistent, source, tone });
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
    exportMenuSummary.setAttribute('aria-label', copy.exportMenuLabel);
    document.getElementById('exportMenuLabel').textContent = copy.exportMenuLabel;
    document.getElementById('appNoticeDismiss').textContent = copy.dismissNotice;
    document.getElementById('exportDataButton').textContent = copy.exportData;
    document.getElementById('importDataButton').textContent = copy.importData;
    markdownButton.textContent = copy.exportMarkdown;
    clearDraftButton.textContent = copy.clearDraft;
    document.getElementById('printButtonLabel').textContent = copy.printDocument;
    printButton.setAttribute('aria-label', copy.printDocument);
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
    if (nextLocale === locale) return;
    onBeforeLocaleChange(locale, nextLocale);
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
      statusController?.resolveAppNotice('locale-preference');
    } catch (_error) {
      showMessage(getMessages(nextLocale).localeSaveError, { persistent: true, source: 'locale-preference', tone: 'error' });
    }
  });

  exportButton.addEventListener('click', () => {
    const copy = getMessages(locale);
    try {
      downloadState(store, locale);
      dataMenu.open = false;
      showMessage(copy.exportSuccess, { source: 'export' });
    } catch {
      dataMenu.open = false;
      showMessage(copy.exportError, { persistent: true, source: 'export', tone: 'error' });
    }
  });

  markdownButton.addEventListener('click', () => {
    const copy = getMessages(locale);
    try {
      const result = exportMarkdown(store.getState(), locale);
      const url = URL.createObjectURL(new Blob([result.text], { type: 'text/markdown;charset=utf-8' }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = result.filename;
      anchor.click();
      URL.revokeObjectURL(url);
      showMessage(copy.markdownExportSuccess, { source: 'export' });
    } catch {
      showMessage(copy.markdownExportError, { persistent: true, source: 'export', tone: 'error' });
    } finally {
      exportMenu.open = false;
      exportMenuSummary.focus();
    }
  });

  printButton.addEventListener('click', () => {
    exportMenu.open = false;
    window.print();
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
      showMessage(prepared.status === 'salvaged' ? currentCopy.importSalvaged : getMessages(locale).importSuccess, { source: 'import' });
    } catch (error) {
      store.cancelImport();
      dataMenu.open = false;
      showMessage(messageForDraftStorageError(error, locale, currentCopy.importError), { persistent: true, source: 'import', tone: 'error' });
    } finally {
      importInput.value = '';
    }
  });

  function setupMenuDismissal(menu, summary) {
    let pointerDownInside = false;
    menu.addEventListener('focusout', (event) => {
      if (menu.contains(event.relatedTarget)) return;
      window.queueMicrotask(() => {
        const activeModal = document.activeElement?.closest?.('dialog[open]');
        if (menu.open && !pointerDownInside && !activeModal && !menu.contains(document.activeElement)) menu.open = false;
      });
    });
    menu.addEventListener('pointerdown', () => {
      pointerDownInside = true;
    });
    document.addEventListener('pointerdown', (event) => {
      const activeModal = event.target.closest?.('dialog[open]');
      if (!menu.contains(event.target)) pointerDownInside = false;
      if (menu.open && !activeModal && !menu.contains(event.target)) menu.open = false;
    });
    document.addEventListener('pointerup', () => {
      pointerDownInside = false;
    });
    document.addEventListener('pointercancel', () => {
      pointerDownInside = false;
    });
    menu.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape' || !menu.open) return;
      event.preventDefault();
      menu.open = false;
      summary.focus();
    });
  }

  setupMenuDismissal(dataMenu, dataMenuSummary);
  setupMenuDismissal(exportMenu, exportMenuSummary);

  store.subscribe((_state, event) => {
    if (['locale', 'reset', 'reload'].includes(event.type)) applyLocale(true);
  });

  applyLocale(true);
}
