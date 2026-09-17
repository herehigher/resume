import { readFile } from 'node:fs/promises';

import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createDefaultState } from '../../site/assets/js/state/defaults.js';
import { expect, expectNoPageOverflow, openLocale, test } from './fixtures.js';

async function importJapaneseState(page, state) {
  await page.locator('#importDataInput').setInputFiles({
    name: 'japanese-career-page-breaks.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(state))
  });
  await page.locator('#confirmSampleAdoptButton').click();
  await expect(page.locator('#globalMessage')).toHaveText('データを読み込みました。');
}

async function exportJapaneseState(page) {
  await page.locator('#dataMenuSummary').click();
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#exportDataButton').click();
  const download = await downloadPromise;
  return JSON.parse(await readFile(await download.path(), 'utf8'));
}

function createCareerState() {
  const state = createDefaultState('ja');
  state.documents.ja.activeDocument = 'career';
  const [first] = state.documents.ja.careers;
  first.id = 'record_fictional-first';
  first.company = '架空の一社目株式会社';
  first.role = '開発部';
  first.detailSections[0].content = '・架空の一社目の職務内容です。';
  const second = structuredClone(first);
  second.id = 'record_fictional-second';
  second.company = '架空の二社目株式会社';
  second.detailSections[0].content = '・架空の二社目の職務内容です。';
  state.documents.ja.careers = [first, second];
  return state;
}

async function readPdfText(buffer) {
  const loadingTask = getDocument({
    data: new Uint8Array(buffer), disableFontFace: true, isEvalSupported: false, useSystemFonts: true
  });
  const document = await loadingTask.promise;
  try {
    return await Promise.all(Array.from({ length: document.numPages }, async (_, index) => {
      const pdfPage = await document.getPage(index + 1);
      const text = await pdfPage.getTextContent();
      return text.items.map((item) => item.str).join('');
    }));
  } finally {
    await loadingTask.destroy();
  }
}

test('Japanese career record page breaks can be added and removed, and survive JSON round-trip and reload', async ({ page }) => {
  const state = createCareerState();
  await openLocale(page, 'ja');
  await importJapaneseState(page, state);
  await page.locator('#careerDocumentTab').click();

  await expect(page.locator('[data-career-layout-controls], [data-career-layout]')).toHaveCount(0);
  const trigger = page.locator('#japaneseWorkspace [data-page-break-mode-toggle]');
  await trigger.click();
  const boundary = page.locator('.page-break-boundary[data-page-break-key="record:record_fictional-second"]');
  await expect(boundary).toBeVisible();
  await boundary.click();
  await expect(boundary).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-record-id="record_fictional-second"]')).toHaveClass(/has-manual-page-break/);

  const exported = await exportJapaneseState(page);
  expect(exported.settings.pageBreaks.ja.A4.career.records).toEqual(['record_fictional-second']);
  expect(exported.documents.ja.careers.every((career) => !Object.hasOwn(career, 'layoutMode'))).toBe(true);

  await importJapaneseState(page, exported);
  await page.reload();
  await page.locator('#careerDocumentTab').click();
  await expect(page.locator('[data-record-id="record_fictional-second"]')).toHaveClass(/has-manual-page-break/);
  await page.locator('#japaneseWorkspace [data-page-break-mode-toggle]').click();
  const restoredBoundary = page.locator('.page-break-boundary[data-page-break-key="record:record_fictional-second"]');
  await expect(restoredBoundary).toHaveAttribute('aria-pressed', 'true');
  await restoredBoundary.click();
  await expect(restoredBoundary).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('[data-record-id="record_fictional-second"]')).not.toHaveClass(/has-manual-page-break/);
});

test('Japanese standard career records keep long content complete in A4 PDF', async ({ page }) => {
  const state = createCareerState();
  const longUrl = `https://example.invalid/${'career-record/'.repeat(30)}`;
  state.settings.pageBreaks.ja.A4.career.records = ['record_fictional-second'];
  state.documents.ja.careers[1].detailSections[0].content = `・架空の長いURL ${longUrl}\n・本文サイズと内容を維持します。`;
  await openLocale(page, 'ja');
  await importJapaneseState(page, state);
  await page.locator('#careerDocumentTab').click();
  await expect(page.locator('[data-record-id="record_fictional-second"]')).toHaveClass(/has-manual-page-break/);

  const fontSizes = await page.locator('.career-company-grid > div:nth-child(even)').evaluateAll((items) => (
    items.map((item) => getComputedStyle(item).fontSize)
  ));
  expect(new Set(fontSizes)).toEqual(new Set(['13.5px']));

  await page.emulateMedia({ media: 'print' });
  const pages = await readPdfText(await page.pdf({ preferCSSPageSize: true, printBackground: true }));
  const text = pages.join('').normalize('NFKC').replace(/\s/g, '');
  const normalizedUrl = longUrl.normalize('NFKC').replace(/\s/g, '');
  expect(pages).not.toHaveLength(0);
  expect(pages.every((item) => item.trim())).toBe(true);
  expect(pages.findIndex((item) => item.normalize('NFKC').replace(/\s/g, '').includes('架空の二社目株式会社'))).toBeGreaterThan(0);
  expect(text).toContain('架空の一社目株式会社');
  expect(text).toContain('架空の二社目株式会社');
  expect(text).toContain('本文サイズと内容を維持します。');
  expect(text).toContain(normalizedUrl);
});

test('[mobile][mobile-webkit] Japanese career editor remains reachable without layout controls or horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openLocale(page, 'ja');
  await importJapaneseState(page, createCareerState());
  await page.locator('#careerDocumentTab').click();
  const header = page.locator('.career-editor-item').first().locator('.career-item-header');
  await expect(header.locator('[data-career-layout-controls], [data-career-layout]')).toHaveCount(0);
  await expect(header.locator('.remove-career-button')).toBeVisible();
  await expectNoPageOverflow(page);
});
