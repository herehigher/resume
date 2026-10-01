import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

import { LIST_ORDER_REGISTRY } from '../../site/assets/js/state/list-order.js';
import { createDefaultState } from '../../site/assets/js/state/defaults.js';
import { createPdfFixture } from '../fixtures/pdf-pagination.mjs';
import { DRAFT_STORAGE_KEY, expect, expectNoPageOverflow, openLocale, test } from './fixtures.js';

function sharedControllerState() {
  const state = createDefaultState();
  for (const locale of ['ja', 'zh-CN', 'en']) {
    state.documents[locale] = createPdfFixture({ locale, length: 'standard', documentType: locale === 'ja' ? 'career' : 'resume' }).state.documents[locale];
  }
  for (const locale of ['zh-CN', 'en']) {
    for (const type of ['education', 'certifications']) {
      const list = state.documents[locale].resume[type];
      list.push({ ...list[0] });
    }
  }
  state.profile.fields.links = ['https://fictional.example/first', 'https://fictional.example/second'];
  for (const locale of ['ja', 'zh-CN', 'en']) {
    for (const paper of ['A4', 'LETTER']) {
      for (const [type, breaks] of Object.entries(state.settings.pageBreaks[locale][paper])) {
        breaks.sections = [type === 'resume' && locale === 'ja' ? 'qualifications' : 'skills'];
      }
    }
  }
  return state;
}

for (const mode of ['desktop', 'mobile']) {
  test(`reorder invalidates all initialized pagination feedback and detached undo callbacks ${mode === 'mobile' ? '[mobile]' : ''}`, async ({ page }) => {
    await page.goto('/');
    const result = await page.evaluate(async ({ initialState, keys }) => {
      const { createStore } = await import('/assets/js/state/store.js');
      const { initPageBreakControls } = await import('/assets/js/page-breaks.js');
      const { renderJapaneseCareer, renderJapaneseResume } = await import('/assets/js/templates/ja.js');
      const { renderChineseResume } = await import('/assets/js/templates/zh-CN.js');
      const { renderEnglishResume } = await import('/assets/js/templates/en.js');
      const targets = keys.map((key) => ({ key, ...(key === 'ja.careerDetails' ? { careerId: initialState.documents.ja.careers[0].id } : {}) }));
      const results = [];
      for (const target of targets) {
        let saves = 0;
        const store = createStore({ initialState, persistence: { async save() { saves += 1; } } });
        const hosts = [];
        for (const [locale, type, render] of [
          ['ja', 'resume', renderJapaneseResume], ['ja', 'career', renderJapaneseCareer],
          ['zh-CN', 'resume', renderChineseResume], ['en', 'resume', renderEnglishResume]
        ]) {
          const host = document.createElement('div');
          const toolbar = document.createElement('div');
          const preview = document.createElement('div');
          preview.innerHTML = render(store.getState());
          host.append(toolbar, preview); document.body.append(host); hosts.push(host);
          const controller = initPageBreakControls({ store, locale, preview, toolbar, getDocumentType: () => type, scheduleSave: () => { saves += 1; } });
          controller.render();
          const toggle = toolbar.querySelector('[data-page-break-mode-toggle]');
          toggle.click();
          if (matchMedia('(max-width: 820px)').matches) toolbar.querySelector('.page-break-panel-toggle').click();
          const surface = matchMedia('(max-width: 820px)').matches
            ? host.querySelector('.page-break-panel') : document.body.lastElementChild;
          const key = locale === 'ja' && type === 'resume' ? 'qualifications' : 'skills';
          surface.querySelector(`button[data-page-break-key="${key}"]`).click();
        }
        if (target.key === 'profile.links') hosts.slice(0, -1).forEach((host) => { host.hidden = true; });
        const undos = [...document.querySelectorAll('.page-break-feedback .page-break-undo')];
        const before = JSON.stringify(store.getState());
        const savesBefore = saves;
        const noChange = store.reorderList(target, { type: 'move', from: 0, to: 0 });
        const preserved = undos.length === 4 && undos.every((button) => button.isConnected)
          && JSON.stringify(store.getState()) === before && saves === savesBefore;
        const changed = store.reorderList(target, { type: 'move', from: 0, to: 1 });
        const after = JSON.stringify(store.getState());
        undos.forEach((button) => { button.click(); });
        results.push({ key: target.key, noChange, preserved, changed,
          feedbackCount: document.querySelectorAll('.page-break-feedback:not([hidden])').length,
          oldUndoCannotRestore: JSON.stringify(store.getState()) === after && saves === savesBefore });
        hosts.forEach((host) => { host.remove(); });
        document.querySelectorAll('.page-break-feedback, .page-break-overlay').forEach((element) => { element.remove(); });
      }
      return results;
    }, { initialState: sharedControllerState(), keys: Object.keys(LIST_ORDER_REGISTRY) });
    for (const resultItem of result) {
      expect(resultItem, resultItem.key).toMatchObject({ noChange: false, preserved: true, changed: true, feedbackCount: 0, oldUndoCannotRestore: true });
    }
  });
}

function savedOrderFixture(locale, paper) {
  const state = createDefaultState(locale);
  state.settings.pageSizeByLocale[locale] = paper;
  state.profile.fields.fullName = 'Fictitious Order Test';
  const resume = state.documents[locale].resume;
  for (const type of ['experience', 'projects', 'education', 'certifications']) {
    const template = resume[type][0];
    resume[type] = ['FIRST', 'SECOND'].map((position, index) => ({
      ...template,
      ...('id' in template ? { id: `record_fictional-${position}` } : {}),
      [type === 'experience' ? 'company' : type === 'education' ? 'school' : 'name']: `${type.toUpperCase()}-${position}`,
      ...(type === 'certifications' ? { date: index ? '2024-01' : '2011-01' }
        : { startDate: index ? '2024-01' : '2010-01', endDate: index ? '' : '2011-01' })
    }));
  }
  return state;
}

for (const [locale, paper] of [['zh-CN', 'A4'], ['en', 'A4'], ['en', 'LETTER']]) {
  for (const mode of ['desktop', 'mobile']) {
    test(`${locale} ${paper} saved array order survives encrypted reload, preview and PDF ${mode === 'mobile' ? '[mobile]' : ''}`, async ({ page }, testInfo) => {
      const state = savedOrderFixture(locale, paper);
      await openLocale(page, locale);
      await page.locator('#importDataInput').setInputFiles({ name: 'fictitious-list-order.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(state)) });
      await page.locator('#confirmSampleAdoptButton').click();
      await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), DRAFT_STORAGE_KEY)).not.toBeNull();
      const raw = await page.evaluate((key) => localStorage.getItem(key), DRAFT_STORAGE_KEY);
      expect(raw).not.toContain('EXPERIENCE-FIRST');
      await page.reload();
      const root = locale === 'en' ? '[data-english-editor]' : '#chineseWorkspace';
      const preview = page.locator(locale === 'en' ? '[data-en-preview]' : '[data-zh-preview]');
      if (mode === 'mobile') await page.locator(`${root} [data-${locale === 'en' ? 'en' : 'zh'}-mobile-view="preview"]`).click();
      await expect(preview).toContainText('EXPERIENCE-FIRST');
      for (const type of ['experience', 'projects', 'education', 'certifications']) {
        const text = await preview.locator(`[data-section-key="${type}"]`).textContent();
        expect(text.indexOf(`${type.toUpperCase()}-FIRST`)).toBeLessThan(text.indexOf(`${type.toUpperCase()}-SECOND`));
      }
      await expectNoPageOverflow(page);
      await page.screenshot({ path: testInfo.outputPath('saved-order-preview.png'), fullPage: true });
      if (mode === 'mobile') return;
      await page.emulateMedia({ media: 'print' });
      const buffer = await page.pdf({ path: testInfo.outputPath('saved-order.pdf'), preferCSSPageSize: true, printBackground: true });
      const loadingTask = getDocument({ data: new Uint8Array(buffer), disableFontFace: true, isEvalSupported: false, useSystemFonts: true });
      try {
        const pdf = await loadingTask.promise;
        let text = '';
        for (let number = 1; number <= pdf.numPages; number += 1) {
          const pdfPage = await pdf.getPage(number);
          text += (await pdfPage.getTextContent()).items.map((item) => item.str).join(' ');
        }
        for (const type of ['experience', 'projects', 'education', 'certifications']) {
          const first = `${type.toUpperCase()}-FIRST`;
          const second = `${type.toUpperCase()}-SECOND`;
          expect(text.indexOf(first)).toBeGreaterThanOrEqual(0);
          expect(text.indexOf(first)).toBeLessThan(text.indexOf(second));
          expect(text.split(first)).toHaveLength(2);
          expect(text.split(second)).toHaveLength(2);
        }
      } finally {
        await loadingTask.destroy();
      }
    });
  }
}
