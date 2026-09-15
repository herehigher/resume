import { createDefaultState } from '../../site/assets/js/state/defaults.js';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { readFile } from 'node:fs/promises';
import { expect, expectNoPageOverflow, openLocale, test } from './fixtures.js';

async function importJapaneseState(page, state) {
  await page.locator('#importDataInput').setInputFiles({
    name: 'japanese-compact-layout.json',
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
  first.id = 'record_fictional-compact-first';
  first.company = '架空コンパクト株式会社';
  first.role = '開発部';
  first.layoutMode = 'compact';
  const second = structuredClone(first);
  second.id = 'record_fictional-standard-second';
  second.company = '架空標準株式会社';
  delete second.layoutMode;
  state.documents.ja.careers = [second, first];
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

test('Japanese career compact layout and the same stable record page-break target survive JSON round-trip and reload', async ({ page }) => {
  const recordWithCompactLayout = 'record_fictional-compact-first';
  const state = createCareerState();
  state.settings.pageBreaks.ja.A4.career.records = [recordWithCompactLayout];
  await openLocale(page, 'ja');
  await importJapaneseState(page, state);
  await page.locator('#careerDocumentTab').click();

  const firstEditor = page.locator('.career-editor-item[data-career-id="record_fictional-standard-second"]');
  const compactEditor = page.locator('.career-editor-item[data-career-id="record_fictional-compact-first"]');
  await expect(firstEditor.locator('[data-career-layout="standard"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(compactEditor.locator('[data-career-layout="compact"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.career-company[data-record-id="record_fictional-standard-second"]')).toHaveAttribute('data-layout-mode', 'standard');
  await expect(page.locator('.career-company[data-record-id="record_fictional-compact-first"]')).toHaveAttribute('data-layout-mode', 'compact');

  await firstEditor.locator('[data-career-layout="compact"]').click();
  await expect(firstEditor.locator('[data-career-layout="compact"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.career-company[data-record-id="record_fictional-standard-second"]')).toHaveAttribute('data-layout-mode', 'compact');
  await expect(page.locator('.career-company[data-record-id="record_fictional-compact-first"]')).toHaveAttribute('data-layout-mode', 'compact');
  await expect(page.locator('#statusAnnouncer')).toHaveText('勤務先の組版をコンパクトにしました。');
  await expect(page.locator('#saveStatus')).toContainText('保存済み');

  const exported = await exportJapaneseState(page);
  expect(exported.version).toBe(4);
  expect(exported.settings.pageBreaks.ja.A4.career.records).toEqual([recordWithCompactLayout]);
  expect(exported.documents.ja.careers.find((career) => career.id === recordWithCompactLayout)?.layoutMode).toBe('compact');
  expect(exported.documents.ja.careers.find((career) => career.id === 'record_fictional-standard-second')?.layoutMode).toBe('compact');

  await importJapaneseState(page, exported);
  await page.reload();
  await page.locator('#careerDocumentTab').click();
  await expect(page.locator('.career-editor-item[data-career-id="record_fictional-standard-second"] [data-career-layout="compact"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.career-company[data-record-id="record_fictional-standard-second"]')).toHaveAttribute('data-layout-mode', 'compact');
  const reloaded = await exportJapaneseState(page);
  expect(reloaded.settings.pageBreaks.ja.A4.career.records).toEqual([recordWithCompactLayout]);
  expect(reloaded.documents.ja.careers.find((career) => career.id === recordWithCompactLayout)?.layoutMode).toBe('compact');
  expect(reloaded.documents.ja.careers.find((career) => career.id === 'record_fictional-standard-second')?.layoutMode).toBe('compact');
});

test('Japanese compact career layout keeps A4 PDF text complete without changing body font size', async ({ page }) => {
  await openLocale(page, 'ja');
  const state = createCareerState();
  const longUrl = `https://example.invalid/${'compact-layout/'.repeat(30)}`;
  state.documents.ja.careers[0].detailSections[0].content = '・架空の標準勤務先です。';
  state.documents.ja.careers[1].detailSections[0].content = `・架空の長いURL ${longUrl}\n・架空のコンパクト勤務先でも本文サイズを維持します。`;
  await importJapaneseState(page, state);
  await page.locator('#careerDocumentTab').click();

  const fontSizes = await page.locator('.career-company-grid > div:nth-child(even)').evaluateAll((items) => (
    items.map((item) => getComputedStyle(item).fontSize)
  ));
  expect(new Set(fontSizes)).toEqual(new Set(['13.5px']));

  await page.emulateMedia({ media: 'print' });
  const pages = await readPdfText(await page.pdf({ preferCSSPageSize: true, printBackground: true }));
  const text = pages.join('').normalize('NFKC').replace(/\s/g, '');
  expect(pages).not.toHaveLength(0);
  expect(pages.every((item) => item.trim())).toBe(true);
  expect(text).toContain('架空標準株式会社');
  expect(text).toContain('架空コンパクト株式会社');
  expect(text).toContain('本文サイズを維持します。');
  const normalizedUrl = longUrl.normalize('NFKC').replace(/\s/g, '');
  expect(text).toContain(normalizedUrl);
  expect(text.split(normalizedUrl)).toHaveLength(2);
});

test('[mobile][mobile-webkit] Japanese career layout controls remain reachable without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openLocale(page, 'ja');
  await importJapaneseState(page, createCareerState());
  await page.locator('#careerDocumentTab').click();
  const header = page.locator('.career-editor-item').first().locator('.career-item-header');
  await expect(header.locator('[data-career-layout="standard"]')).toBeVisible();
  await expect(header.locator('[data-career-layout="compact"]')).toBeVisible();
  await expect(header.locator('.remove-career-button')).toBeVisible();
  await expectNoPageOverflow(page);
});
