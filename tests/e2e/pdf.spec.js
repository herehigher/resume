import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createDefaultState } from '../../site/assets/js/state/defaults.js';
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
  const pages = [];
  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      pages.push({
        width: viewport.width,
        height: viewport.height,
        text: content.items.map((item) => item.str).join(' ')
      });
    }
  } finally {
    await loadingTask.destroy();
  }
  return pages;
}

function expectPageSize(pages, expected) {
  for (const page of pages) {
    expect(page.width).toBeCloseTo(expected.width, 0);
    expect(page.height).toBeCloseTo(expected.height, 0);
  }
}

async function printPdf(page) {
  await page.emulateMedia({ media: 'print' });
  return page.pdf({
    displayHeaderFooter: false,
    preferCSSPageSize: true,
    printBackground: true
  });
}

test('PDF short: English の短いデータは 1 ページの Letter でテキスト抽出できる @pdf', async ({ page }) => {
  await openLocale(page, 'en');
  await page.locator('[data-profile-field="fullName"]').fill('SHORT PDF MARKER');

  const pages = await inspectPdf(await printPdf(page));
  expect(pages).toHaveLength(1);
  expect(pages.map((item) => item.text).join(' ')).toContain('SHORT PDF MARKER');
  expectPageSize(pages, LETTER);
});

test('PDF standard: 日本語の標準例は 2 ページの A4 で主要テキストを抽出できる @pdf', async ({ page }) => {
  await openLocale(page, 'ja');
  await page.locator('#loadSampleButton').click();

  const pages = await inspectPdf(await printPdf(page));
  expect(pages).toHaveLength(2);
  expectPageSize(pages, A4);
  const text = pages.map((item) => item.text).join(' ');
  expect(text).toContain('TOEIC Listening & Reading 850');
  expect(text).toContain('志望動機');
});

test('PDF long: English の超長文は複数 Letter ページになり末尾まで抽出できる @pdf', async ({ page }) => {
  await openLocale(page, 'en');
  const state = createDefaultState('en');
  state.profile.fields.fullName = 'LONG PDF START MARKER';
  state.documents.en.resume.summary = Array.from(
    { length: 12 },
    (_, index) => `Summary line ${index + 1}: measurable product outcome.`
  ).join('\n');
  state.documents.en.resume.experience = Array.from({ length: 14 }, (_, index) => ({
    company: `Long Form Company ${index + 1}`,
    role: `Lead Role ${index + 1}`,
    startDate: '2020-01',
    endDate: '',
    details: Array.from(
      { length: 5 },
      (_, line) => `Delivered outcome ${index + 1}.${line + 1} with measurable impact.`
    ).join('\n')
  }));
  state.documents.en.resume.skills = 'LONG PDF END MARKER';
  await page.locator('#importDataInput').setInputFiles({
    name: 'resume-studio-long-pdf.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(state))
  });
  await expect(page.locator('[data-en-preview]')).toContainText('LONG PDF END MARKER');

  const pages = await inspectPdf(await printPdf(page));
  expect(pages.length).toBeGreaterThanOrEqual(3);
  expect(pages.length).toBeLessThanOrEqual(12);
  const text = pages.map((item) => item.text).join(' ');
  expect(text).toContain('LONG PDF START MARKER');
  expect(text).toContain('LONG PDF END MARKER');
  expectPageSize(pages, LETTER);
});
