import { SUPPORTED_LOCALES } from '../config.js';
import { getMessages } from '../i18n/index.js';

function showMessage(message, isError = false) {
  const element = document.getElementById('globalMessage');
  element.textContent = message;
  element.classList.toggle('is-error', isError);
  window.clearTimeout(showMessage.timer);
  showMessage.timer = window.setTimeout(() => {
    element.textContent = '';
    element.classList.remove('is-error');
  }, 4000);
}

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

export function initLocaleController(store) {
  const select = document.getElementById('localeSelect');
  const workspace = document.getElementById('japaneseWorkspace');
  const pending = document.getElementById('localePending');
  const mobileSwitch = document.querySelector('.mobile-view-switch');
  const documentSwitcher = document.querySelector('.document-switcher');
  const printButton = document.getElementById('printButton');
  const sampleButton = document.getElementById('loadSampleButton');
  const saveStatus = document.getElementById('saveStatus');
  const exportButton = document.getElementById('exportDataButton');
  const importButton = document.getElementById('importDataButton');
  const importInput = document.getElementById('importDataInput');
  let renderedLocale = '';

  function applyLocale(force = false) {
    const locale = store.getState().settings.locale;
    if (!force && renderedLocale === locale) return;
    renderedLocale = locale;
    const copy = getMessages(locale);
    const isJapanese = locale === 'ja';

    document.documentElement.lang = copy.htmlLang;
    document.title = copy.pageTitle;
    document.getElementById('brandSubtitle').textContent = copy.brandSubtitle;
    document.getElementById('localeLabel').textContent = copy.localeLabel;
    document.getElementById('dataMenuSummary').setAttribute('aria-label', copy.dataManagement);
    document.getElementById('exportDataButton').textContent = copy.exportData;
    document.getElementById('importDataButton').textContent = copy.importData;
    document.getElementById('pendingTitle').textContent = copy.pendingTitle;
    document.getElementById('pendingBody').textContent = copy.pendingBody;
    select.value = locale;

    workspace.hidden = !isJapanese;
    pending.hidden = isJapanese;
    mobileSwitch.hidden = !isJapanese;
    documentSwitcher.hidden = !isJapanese;
    printButton.hidden = !isJapanese;
    sampleButton.hidden = !isJapanese;
    saveStatus.hidden = !isJapanese;
  }

  select.addEventListener('change', () => {
    if (!SUPPORTED_LOCALES.includes(select.value)) return;
    store.update((state) => {
      state.settings.locale = select.value;
    }, { persist: true, type: 'locale' });
    const url = new URL(window.location.href);
    url.searchParams.set('lang', select.value);
    window.history.replaceState(null, '', url);
    applyLocale(true);
  });

  exportButton.addEventListener('click', () => {
    const locale = store.getState().settings.locale;
    const copy = getMessages(locale);
    try {
      downloadState(store, locale);
      showMessage(copy.exportSuccess);
    } catch {
      showMessage(copy.importError, true);
    }
  });

  importButton.addEventListener('click', () => importInput.click());
  importInput.addEventListener('change', async () => {
    const file = importInput.files?.[0];
    if (!file) return;
    const currentCopy = getMessages(store.getState().settings.locale);
    try {
      store.importJson(await file.text());
      const locale = store.getState().settings.locale;
      const url = new URL(window.location.href);
      url.searchParams.set('lang', locale);
      window.history.replaceState(null, '', url);
      applyLocale(true);
      showMessage(getMessages(locale).importSuccess);
    } catch {
      showMessage(currentCopy.importError, true);
    } finally {
      importInput.value = '';
    }
  });

  store.subscribe((_state, event) => {
    if (['import', 'locale', 'reset', 'reload'].includes(event.type)) applyLocale(true);
  });

  applyLocale(true);
}
