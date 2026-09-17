import { readFile } from 'node:fs/promises';

import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { STORAGE_KEY } from '../../site/assets/js/config.js';
import { createV3Fixture } from '../fixtures/resume-studio-web-v3.js';
import { expect, openLocale, test } from './fixtures.js';

const A4 = { width: 595.28, height: 841.89 };
const LETTER = { width: 612, height: 792 };

async function inspectPdf(buffer) {
  const loadingTask = getDocument({
    data: new Uint8Array(buffer),
    disableFontFace: true,
    isEvalSupported: false,
    useSystemFonts: true
  });
  const document = await loadingTask.promise;
  try {
    return await Promise.all(Array.from({ length: document.numPages }, async (_, index) => {
      const page = await document.getPage(index + 1);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      return {
        width: viewport.width,
        height: viewport.height,
        text: content.items.map((item) => item.str).join(' ')
      };
    }));
  } finally {
    await loadingTask.destroy();
  }
}

function addSecondRecord(records, second) {
  return [...records, second];
}

function createMigratableV3Fixture() {
  const state = createV3Fixture();
  state.documents.ja.fields.careerSummary = '架空 v3 職務要約';
  state.documents.ja.careers = addSecondRecord(state.documents.ja.careers, {
    company: 'Fictional v3 Japan Two',
    role: 'Second fixture role',
    startDate: '2018-01',
    endDate: '2019-12',
    companyInfo: 'Fictional acceptance employer',
    detailSections: [{ title: '担当業務', content: '架空の職務内容' }, { title: '実績・成果', content: '架空の成果' }]
  });
  state.documents['zh-CN'].resume.summary = '虚构 v3 中文概述';
  state.documents['zh-CN'].resume.experience = addSecondRecord(state.documents['zh-CN'].resume.experience, {
    startDate: '2018-01', endDate: '2019-12', company: 'Fictional v3 China Two', role: 'Second fixture role', details: '虚构工作内容'
  });
  state.documents.en.resume.summary = 'Fictional v3 English summary.';
  state.documents.en.resume.projects = [{
    startDate: '2021-01', endDate: '2022-12', name: 'Migrated v3 project', role: 'Fixture owner', details: 'Fictional project details.', url: ''
  }];
  state.documents.en.resume.skills = 'Migrated v3 English skills';
  state.documents.en.resume.experience = addSecondRecord(state.documents.en.resume.experience, {
    startDate: '2018-01', endDate: '2019-12', company: 'Fictional v3 English Two', role: 'Second fixture role', details: 'Fictional work details.'
  });
  return state;
}

async function exportState(page) {
  await page.locator('#dataMenuSummary').click();
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#exportDataButton').click();
  const download = await downloadPromise;
  return JSON.parse(await readFile(await download.path(), 'utf8'));
}

async function printPdf(page) {
  await page.emulateMedia({ media: 'print' });
  return inspectPdf(await page.pdf({
    displayHeaderFooter: false,
    preferCSSPageSize: true,
    printBackground: true
  }));
}

function expectPageSize(pages, expectedSize) {
  expect(pages).not.toHaveLength(0);
  expect(pages.every((page) => page.text.trim())).toBe(true);
  for (const page of pages) {
    expect(page.width).toBeCloseTo(expectedSize.width, 0);
    expect(page.height).toBeCloseTo(expectedSize.height, 0);
  }
}

test('v3 migration integrates three locale/paper PDF page breaks without printing editor controls', async ({ page }) => {
  const v3 = createMigratableV3Fixture();
  await page.addInitScript((raw) => localStorage.setItem('resume-studio-web-v3', raw), JSON.stringify(v3));
  await openLocale(page, 'en');

  const stored = await page.evaluate((currentKey) => ({
    current: localStorage.getItem(currentKey),
    legacy: localStorage.getItem('resume-studio-web-v3')
  }), STORAGE_KEY);
  expect(stored.current).toContain('"format":"resume-studio-local-encrypted-v1"');
  expect(stored.legacy).toBeNull();

  const exported = await exportState(page);
  expect(exported.version).toBe(4);
  for (const records of [
    exported.documents.ja.careers,
    exported.documents['zh-CN'].resume.experience,
    exported.documents.en.resume.experience
  ]) {
    expect(records).toHaveLength(2);
    expect(new Set(records.map((record) => record.id)).size).toBe(records.length);
    expect(records.every((record) => /^record_/.test(record.id))).toBe(true);
  }
  expect(exported.settings.pageBreaks.en.A4.resume.sections).toEqual(['projects']);
  expect(exported.settings.pageBreaks.en.LETTER.resume.sections).toEqual(['skills']);

  const cases = [
    {
      locale: 'ja',
      beforePrint: async () => page.locator('#careerDocumentTab').click(),
      target: '#japaneseWorkspace [data-section-key="career-history"]',
      targetText: 'Fictional v3 Japan',
      paper: A4
    },
    {
      locale: 'zh-CN',
      beforePrint: async () => {},
      target: '#chineseWorkspace [data-section-key="experience"]',
      targetText: 'Fictional v3 China',
      paper: A4
    },
    {
      locale: 'en',
      beforePrint: async () => page.locator('[data-en-page-size]').selectOption('A4'),
      target: '[data-english-editor] [data-section-key="projects"]',
      targetText: 'Migrated v3 project',
      paper: A4
    },
    {
      locale: 'en',
      beforePrint: async () => page.locator('[data-en-page-size]').selectOption('LETTER'),
      target: '[data-english-editor] [data-section-key="skills"]',
      targetText: 'Migrated v3 English skills',
      paper: LETTER
    }
  ];

  for (const item of cases) {
    await page.emulateMedia({ media: 'screen' });
    await page.locator('#localeSelect').selectOption(item.locale);
    await item.beforePrint();
    await expect(page.locator(item.target).first()).toHaveClass(/has-manual-page-break/);
    const pages = await printPdf(page);
    expectPageSize(pages, item.paper);
    const targetPage = pages.findIndex((pdfPage) => pdfPage.text.includes(item.targetText));
    expect(targetPage).toBeGreaterThan(0);
    const text = pages.map((pdfPage) => pdfPage.text).join(' ');
    expect(text).not.toMatch(/Page break positions|改ページ位置|分页位置/);
  }
});
