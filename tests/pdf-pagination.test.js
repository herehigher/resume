import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { validateState } from '../site/assets/js/state/schema.js';
import { renderEnglishResume } from '../site/assets/js/templates/en.js';
import { renderJapaneseDocument } from '../site/assets/js/templates/ja.js';
import { renderChineseResume } from '../site/assets/js/templates/zh-CN.js';
import { createPdfFixture, pdfFixtureCases } from './fixtures/pdf-pagination.mjs';

const renderers = {
  ja: renderJapaneseDocument,
  'zh-CN': renderChineseResume,
  en: renderEnglishResume
};

test('PDF pagination fixtures cover short, near-boundary, standard, and extra-long documents', () => {
  const cases = pdfFixtureCases();
  assert.equal(cases.length, 20);

  for (const fixtureCase of cases) {
    const { state, endMarker } = createPdfFixture(fixtureCase);
    const validation = validateState(state);
    assert.equal(validation.valid, true, validation.errors.join('; '));

    const html = renderers[fixtureCase.locale](state);
    assert.match(html, new RegExp(endMarker));
    if (fixtureCase.length === 'extra-long') assert.ok(html.length > 10_000);
  }
});

test('print styles use physical page sizes without a clipping container', () => {
  const printCss = readFileSync(new URL('../site/assets/css/print.css', import.meta.url), 'utf8');
  const japaneseCss = readFileSync(new URL('../site/assets/css/templates/ja.css', import.meta.url), 'utf8');
  const chineseCss = readFileSync(new URL('../site/assets/css/templates/zh-CN.css', import.meta.url), 'utf8');
  const englishCss = readFileSync(new URL('../site/assets/css/templates/en.css', import.meta.url), 'utf8');

  assert.match(printCss, /@page\s*\{[^}]*margin:\s*14mm 15mm;[^}]*\}/s);
  assert.doesNotMatch(printCss, /@page\s*\{[^}]*size:/s);
  assert.match(printCss, /\.workspace, \.preview-panel, \.preview-scroll, \.document-preview\s*\{[^}]*background:\s*#fff !important;/s);
  assert.match(printCss, /\.document-page\s*\{[^}]*height:\s*auto;[^}]*min-height:\s*0;[^}]*overflow:\s*visible;[^}]*padding:\s*0;[^}]*width:\s*auto;/s);
  const documentPageRule = printCss.match(/\.document-page\s*\{([^}]*)\}/s)?.[1] || '';
  assert.doesNotMatch(documentPageRule, /(?:^|;)\s*(?:height:\s*297mm|overflow:\s*hidden)/s);
  assert.match(japaneseCss, /@page japanese-a4\s*\{[^}]*margin:\s*14mm 15mm;[^}]*size:\s*A4 portrait;/s);
  assert.match(chineseCss, /@page chinese-a4\s*\{[^}]*margin:\s*13mm 15mm 14mm;[^}]*size:\s*A4 portrait;/s);
  assert.match(englishCss, /@page english-a4\s*\{[^}]*margin:\s*14mm 15mm;[^}]*size:\s*A4 portrait;/s);
  assert.match(englishCss, /@page english-letter\s*\{[^}]*margin:\s*\.55in \.62in;[^}]*size:\s*Letter portrait;/s);

  for (const css of [japaneseCss, chineseCss, englishCss]) {
    assert.match(css, /break-after:\s*avoid-page/);
    assert.match(css, /break-inside:\s*avoid-page/);
  }
  assert.match(japaneseCss, /\.paper-text-section\s*\{\s*break-inside:\s*auto;/);
  assert.match(japaneseCss, /#japaneseWorkspace \.paper-text-section\s*\{[^}]*min-height:\s*0;/s);
  assert.match(chineseCss, /@media print[\s\S]*?\.zh-certifications ul\s*\{\s*display:\s*block;/);
  assert.match(chineseCss, /@media print[\s\S]*?\.zh-certifications li \+ li\s*\{\s*margin-top:\s*7px;/);
  assert.match(englishCss, /@media print[\s\S]*?\.en-certification-list li\s*\{\s*display:\s*block;/);
  assert.match(englishCss, /@media print[\s\S]*?\.en-certification-date\s*\{\s*margin-left:\s*10px;/);
});

test('browser PDF fixture exposes every supported print parameter', () => {
  const html = readFileSync(new URL('./fixtures/pdf-pagination.html', import.meta.url), 'utf8');
  for (const parameter of ['locale', 'length', 'document', 'pageSize']) {
    assert.match(html, new RegExp(`params\\.get\\('${parameter}'\\)`));
  }
  assert.match(html, /window\.__pdfFixtureReady/);
});
