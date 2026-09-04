import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createDefaultState } from '../../site/assets/js/state/defaults.js';
import { createPdfFixture } from '../fixtures/pdf-pagination.mjs';
import { expect, openLocale, revealField, test } from './fixtures.js';

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

async function printFixturePdf(page, fixtureCase) {
  const { state, endMarker } = createPdfFixture(fixtureCase);
  const previewSelector = fixtureCase.locale === 'ja'
    ? '#documentPreview'
    : fixtureCase.locale === 'zh-CN' ? '[data-zh-preview]' : '[data-en-preview]';
  await openLocale(page, fixtureCase.locale);
  await page.locator('#importDataInput').setInputFiles({
    name: 'pdf-pagination-fixture.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(state))
  });
  await expect(page.locator(previewSelector)).toContainText(endMarker);
  return { endMarker, pages: await inspectPdf(await printPdf(page)) };
}

test('PDF pagination: 三言語のページ境界データは末尾内容を保持し空白ページを作らない @pdf', async ({ page }) => {
  const cases = [
    { fixtureCase: { locale: 'ja', length: 'standard', documentType: 'resume', pageSize: 'A4' }, pages: 3, pageSize: A4 },
    { fixtureCase: { locale: 'ja', length: 'extra-long', documentType: 'resume', pageSize: 'A4' }, pages: 11, pageSize: A4 },
    { fixtureCase: { locale: 'zh-CN', length: 'near-boundary', pageSize: 'A4' }, pages: 2, pageSize: A4 },
    { fixtureCase: { locale: 'en', length: 'near-boundary', pageSize: 'A4' }, pages: 2, pageSize: A4 },
    { fixtureCase: { locale: 'en', length: 'near-boundary', pageSize: 'LETTER' }, pages: 2, pageSize: LETTER }
  ];

  for (const expected of cases) {
    const { endMarker, pages } = await printFixturePdf(page, expected.fixtureCase);
    expect(pages).toHaveLength(expected.pages);
    expectPageSize(pages, expected.pageSize);
    expect(pages.at(-1)?.text.trim()).not.toBe('');
    expect(pages.at(-1)?.text).toContain(endMarker);
  }
});

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

for (const [locale, addSelector, previewSelector, pageSize] of [
  ['ja', '#addProfileLinkButton', '#documentPreview', A4],
  ['zh-CN', '[data-zh-add-profile-link]', '[data-zh-preview]', A4],
  ['en', '[data-en-add-profile-link]', '[data-en-preview]', LETTER]
]) {
  test(`PDF ${locale}: Links はサイト名と protocol を除いた長い URL を印刷する @pdf`, async ({ page }) => {
    const longUrl = `https://example.test/${'long-profile-path-'.repeat(12)}details`;
    await openLocale(page, locale);
    const add = page.locator(addSelector);
    await revealField(add);
    const links = locale === 'en'
      ? [
        'https://github.com/example',
        'https://www.linkedin.com/in/example',
        longUrl
      ]
      : [longUrl];
    for (const link of links) {
      await add.click();
      await page.locator('[data-profile-link-index]').last().fill(link);
    }
    await expect(page.locator(previewSelector)).toContainText('Website');
    if (locale === 'en') {
      await expect(page.locator('.en-profile-links > .en-contact-label')).toHaveCount(1);
      await expect(page.locator('.en-profile-link-list > li')).toHaveCount(3);
    }
    const pages = await inspectPdf(await printPdf(page));
    const text = pages.map((item) => item.text).join(' ').replace(/\s/g, '');
    expect(text).toContain('example.test/long-profile-path-');
    expect(text).not.toContain('https://');
    expectPageSize(pages, pageSize);
  });
}
