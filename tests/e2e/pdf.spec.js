import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createEnglishSampleState } from '../../site/assets/js/data/en-sample.js';
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
        text: content.items.map((item) => item.str).join(' '),
        items: content.items
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

function expectPdfContext(text, expected) {
  if (typeof expected === 'string') {
    const normalizePdfText = (value) => String(value).normalize('NFKC').replace(/\s/g, '');
    expect(normalizePdfText(text)).toContain(normalizePdfText(expected));
  }
  else expect(text).toMatch(expected);
}

function pdfPageIndex(pages, expected) {
  const needle = String(expected).normalize('NFKC').replace(/\s/g, '');
  return pages.findIndex((page) => page.text.normalize('NFKC').replace(/\s/g, '').includes(needle));
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

async function activePrintPageText(page) {
  return page.locator('#activePrintPageStyle').textContent();
}

test('print page: locale and English paper changes keep exactly one active anonymous page rule', async ({ page }) => {
  await openLocale(page, 'ja');
  await expect(page.locator('#activePrintPageStyle')).toHaveCount(1);
  await expect.poll(() => activePrintPageText(page)).toBe('@page { margin: 14mm 15mm; size: A4 portrait; }');

  await page.locator('#localeSelect').selectOption('en');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await page.locator('[data-en-page-size]').selectOption('A4');
  await expect.poll(() => activePrintPageText(page)).toBe('@page { margin: 14mm 15mm; size: A4 portrait; }');

  await page.locator('[data-en-page-size]').selectOption('LETTER');
  await expect.poll(() => activePrintPageText(page)).toBe('@page { margin: .55in .62in; size: Letter portrait; }');

  await page.locator('#localeSelect').selectOption('zh-CN');
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
  await expect.poll(() => activePrintPageText(page)).toBe('@page { margin: 13mm 15mm 14mm; size: A4 portrait; }');
  await expect(page.locator('#activePrintPageStyle')).toHaveCount(1);
});

test('diagnostic matrix: legacy named pages and common breaks do not reproduce the visible-Chrome blank page through CDP', async ({ page }) => {
  const cases = [
    { locale: 'ja', sampleButton: '#loadSampleButton', documentSelector: '#japaneseWorkspace .document-page', lastText: '貴社規定に従います。' },
    { locale: 'zh-CN', sampleButton: '[data-zh-action="sample"]', documentSelector: '#chineseWorkspace .document-page', lastText: '数据分析专业证书' }
  ];

  for (const item of cases) {
    await page.emulateMedia({ media: 'screen' });
    await openLocale(page, item.locale);
    await page.locator(item.sampleButton).click();
    for (const namedPage of [true, false]) {
      for (const commonBreakAfter of [true, false]) {
        const name = `issue130-${item.locale.replace(/[^a-z]/gi, '').toLowerCase()}-${namedPage ? 'named' : 'anonymous'}-${commonBreakAfter ? 'break' : 'auto'}`;
        const diagnosticStyle = await page.addStyleTag({
          content: `@page ${name} { margin: ${item.locale === 'zh-CN' ? '13mm 15mm 14mm' : '14mm 15mm'}; size: A4 portrait; }
            @media print {
              ${item.documentSelector} { ${namedPage ? `page: ${name} !important;` : ''} break-after: ${commonBreakAfter ? 'page' : 'auto'} !important; }
              ${item.documentSelector}:last-child { break-after: auto !important; }
            }`,
        });
        const pages = await inspectPdf(await printPdf(page));
        expect(pages).toHaveLength(2);
        expect(pages.every((pdfPage) => pdfPage.text.trim())).toBe(true);
        expect(pages.at(-1)?.text).toContain(item.lastText);
        await diagnosticStyle.evaluate((element) => element.remove());
      }
    }
  }
});

test('PDF pagination: 三言語のページ境界データは末尾内容を保持し空白ページを作らない', async ({ page }) => {
  const cases = [
    { fixtureCase: { locale: 'ja', length: 'standard', documentType: 'resume', pageSize: 'A4' }, pageSize: A4 },
    { fixtureCase: { locale: 'ja', length: 'extra-long', documentType: 'resume', pageSize: 'A4' }, pageSize: A4 },
    { fixtureCase: { locale: 'zh-CN', length: 'near-boundary', pageSize: 'A4' }, pageSize: A4 },
    { fixtureCase: { locale: 'en', length: 'near-boundary', pageSize: 'A4' }, pageSize: A4 },
    { fixtureCase: { locale: 'en', length: 'near-boundary', pageSize: 'LETTER' }, pageSize: LETTER }
  ];

  for (const expected of cases) {
    const { endMarker, pages } = await printFixturePdf(page, expected.fixtureCase);
    expect(pages.length).toBeGreaterThan(0);
    expect(pages.length).toBeLessThan(40);
    expectPageSize(pages, expected.pageSize);
    expect(pages.every((item) => item.text.trim())).toBe(true);
    expect(pages.at(-1)?.text.trim()).not.toBe('');
    expect(pages.at(-1)?.text).toContain(endMarker);
  }
});

test('manual page breaks start their target sections on new non-empty PDF pages without printing controls', async ({ page }) => {
  const state = createEnglishSampleState(createDefaultState('en'));
  state.settings.pageBreaks.en.LETTER.resume = ['summary', 'experience'];
  await openLocale(page, 'en');
  await page.locator('#importDataInput').setInputFiles({
    name: 'manual-page-breaks.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(state))
  });
  await expect(page.locator('[data-section-key="summary"]')).toHaveClass(/has-manual-page-break/);
  await expect(page.locator('[data-section-key="experience"]')).toHaveClass(/has-manual-page-break/);
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.page-break-boundary').first()).toBeHidden();
  const pages = await inspectPdf(await printPdf(page));
  expect(pages).toHaveLength(3);
  expect(pages.every((pdfPage) => pdfPage.text.trim())).toBe(true);
  expect(pages[1].text).toContain('SUMMARY');
  expect(pages[2].text).toContain('EXPERIENCE');
  expect(pages.map((pdfPage) => pdfPage.text).join(' ')).toContain('Certified Scrum Product Owner');
});

test('manual page break after a naturally near-full section creates no blank PDF page', async ({ page }) => {
  const { state, endMarker } = createPdfFixture({ locale: 'en', length: 'near-boundary', pageSize: 'LETTER' });
  state.settings.pageBreaks.en.LETTER.resume = ['experience'];
  await openLocale(page, 'en');
  await page.locator('#importDataInput').setInputFiles({
    name: 'manual-near-boundary.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(state))
  });
  await expect(page.locator('[data-section-key="experience"]')).toHaveClass(/has-manual-page-break/);
  await expect(page.locator('[data-en-preview]')).toContainText(endMarker);
  const pages = await inspectPdf(await printPdf(page));
  expect(pages.every((pdfPage) => pdfPage.text.trim())).toBe(true);
  const summaryPage = pdfPageIndex(pages, `${endMarker}-SUMMARY`);
  const experiencePage = pdfPageIndex(pages, 'EXPERIENCE');
  expect(summaryPage).toBeGreaterThanOrEqual(0);
  expect(experiencePage).toBeGreaterThan(summaryPage);
  expect(pdfPageIndex(pages, `Experience test line 12 ${endMarker}`)).toBeGreaterThanOrEqual(experiencePage);
});

test('manual page-break target may span multiple PDF pages without losing its end marker', async ({ page }) => {
  const { state, endMarker } = createPdfFixture({ locale: 'en', length: 'extra-long', pageSize: 'LETTER' });
  state.documents.en.resume.summary = 'Short summary before the manual boundary.';
  state.settings.pageBreaks.en.LETTER.resume = ['experience'];
  await openLocale(page, 'en');
  await page.locator('#importDataInput').setInputFiles({
    name: 'manual-long-target.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(state))
  });
  await expect(page.locator('[data-section-key="experience"]')).toHaveClass(/has-manual-page-break/);
  await expect(page.locator('[data-en-preview]')).toContainText(endMarker);
  const pages = await inspectPdf(await printPdf(page));
  expect(pages.every((pdfPage) => pdfPage.text.trim())).toBe(true);
  const targetPages = pages.filter((pdfPage) => pdfPage.text.includes('Experience test line'));
  expect(targetPages.length).toBeGreaterThan(1);
  expect(pages.map((pdfPage) => pdfPage.text).join(' ')).toContain(endMarker);
});

test('Japanese manual page break starts the resume target on a later non-empty A4 page', async ({ page }) => {
  const { state, endMarker } = createPdfFixture({ locale: 'ja', length: 'short', documentType: 'resume', pageSize: 'A4' });
  state.settings.pageBreaks.ja.A4.resume = ['qualifications'];
  await openLocale(page, 'ja');
  await page.locator('#importDataInput').setInputFiles({
    name: 'manual-ja-resume.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(state))
  });
  await expect(page.locator('[data-section-key="qualifications"]')).toHaveClass(/has-manual-page-break/);
  const pages = await inspectPdf(await printPdf(page));
  expectPageSize(pages, A4);
  expect(pages.every((pdfPage) => pdfPage.text.trim())).toBe(true);
  expect(pdfPageIndex(pages, '免許・資格')).toBeGreaterThan(0);
  expect(pdfPageIndex(pages, endMarker)).toBeGreaterThanOrEqual(0);
});

test('PDF standard: 简体中文の組み込み例は証書の順序を保ち、空白末尾ページを作らない', async ({ page }) => {
  await openLocale(page, 'zh-CN');
  await page.locator('[data-zh-action="sample"]').click();
  await expect(page.locator('[data-zh-preview]')).toContainText('数据分析专业证书');
  await page.emulateMedia({ media: 'print' });
  const layout = await page.evaluate(() => {
    const certifications = document.querySelector('.zh-certifications');
    const certificationItems = certifications?.querySelectorAll('li') || [];
    return {
      display: getComputedStyle(certifications?.querySelector('ul')).display,
      gap: getComputedStyle(certificationItems[1]).marginTop
    };
  });
  expect(layout).toEqual({ display: 'block', gap: '7px' });
  const pages = await inspectPdf(await printPdf(page));
  expect(pages).toHaveLength(2);
  expectPageSize(pages, A4);
  expect(pages.every((item) => item.text.trim())).toBe(true);
  const text = pages.map((item) => item.text).join(' ');
  expect(text.indexOf('PMP')).toBeLessThan(text.indexOf('数据分析专业证书'));
  expect(pages.at(-1)?.text).toContain('数据分析专业证书');
});

test('PDF pagination: English の長い証書 URL は A4 と Letter で順序と末尾を保つ', async ({ page }) => {
  for (const [pageSize, expectedPageSize] of [
    ['A4', A4],
    ['LETTER', LETTER]
  ]) {
    await page.emulateMedia({ media: 'screen' });
    const state = createEnglishSampleState(createDefaultState('en'));
    state.settings.pageSizeByLocale.en = pageSize;
    const endMarker = `EN-CERTIFICATION-END-${pageSize}`;
    state.documents.en.resume.certifications = Array.from({ length: 3 }, (_, index) => ({
      date: `202${index}-11`,
      name: `Boundary Certification ${index + 1}${index === 0 ? ` ${endMarker}` : ''}`,
      url: `https://example.com/${'long-verification-path-'.repeat(8)}${index}`
    }));
    await openLocale(page, 'en');
    await page.locator('#importDataInput').setInputFiles({
      name: 'english-certification-boundary.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(state))
    });
    await expect(page.locator('[data-en-preview]')).toContainText(endMarker);
    await page.emulateMedia({ media: 'print' });
    const layout = await page.evaluate(() => {
      const item = document.querySelector('.en-certification-list li');
      return {
        dateMargin: getComputedStyle(item?.querySelector('.en-certification-date')).marginLeft,
        display: getComputedStyle(item).display,
        linkDisplay: getComputedStyle(item?.querySelector('.en-certification-link')).display
      };
    });
    expect(layout).toEqual({ dateMargin: '10px', display: 'block', linkDisplay: 'block' });
    const pages = await inspectPdf(await printPdf(page));
    expectPageSize(pages, expectedPageSize);
    expect(pages.every((item) => item.text.trim())).toBe(true);
    const text = pages.map((item) => item.text).join(' ');
    expect(text.indexOf('Boundary Certification 3')).toBeLessThan(text.indexOf('Boundary Certification 2'));
    expect(text.indexOf('Boundary Certification 2')).toBeLessThan(text.indexOf(endMarker));
    expect(text.replace(/\s/g, '')).toContain('example.com/long-verification-path-');
    expect(pages.at(-1)?.text).toContain(endMarker);
  }
});

test('PDF short: English の短いデータは 1 ページの Letter でテキスト抽出できる', async ({ page }) => {
  await openLocale(page, 'en');
  await page.locator('[data-profile-field="fullName"]').fill('SHORT PDF MARKER');

  const pages = await inspectPdf(await printPdf(page));
  expect(pages).toHaveLength(1);
  expect(pages.map((item) => item.text).join(' ')).toContain('SHORT PDF MARKER');
  expectPageSize(pages, LETTER);
});

test('PDF ja: 任意タイトルの複数詳細項目は順序・継続ラベル・末尾内容を保つ', async ({ page }) => {
  const { state } = createPdfFixture({ locale: 'ja', length: 'short', documentType: 'career', pageSize: 'A4' });
  const lines = Array.from({ length: 13 }, (_, index) => `CUSTOM-DETAIL-LINE-${String(index + 1).padStart(2, '0')}`).join('\n');
  state.documents.ja.careers[0].detailSections = [
    { title: 'プロジェクト概要', content: '最初の詳細項目です。' },
    { title: '使用技術', content: 'HTML, CSS, JavaScript' },
    { title: 'PDFに出さない空項目', content: '' },
    { title: 'チーム規模', content: '架空のチーム 5名' },
    { title: '長いカスタム詳細タイトル', content: lines }
  ];
  await openLocale(page, 'ja');
  await page.locator('#importDataInput').setInputFiles({
    name: 'japanese-custom-career-details.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(state))
  });
  await expect(page.locator('#documentPreview')).toContainText('CUSTOM-DETAIL-LINE-13');
  await expect(page.locator('#documentPreview')).not.toContainText('PDFに出さない空項目');
  const pages = await inspectPdf(await printPdf(page));
  const text = pages.map((item) => item.text).join(' ');
  const normalizedText = text.normalize('NFKC').replace(/\s/g, '').replaceAll('⻑', '長');
  expectPageSize(pages, A4);
  expect(pages.every((item) => item.text.trim())).toBe(true);
  expect(normalizedText.indexOf('プロジェクト概要')).toBeLessThan(normalizedText.indexOf('使用技術'));
  expect(normalizedText).not.toContain('PDFに出さない空項目');
  expect(normalizedText.indexOf('使用技術')).toBeLessThan(normalizedText.indexOf('チーム規模'));
  expect(normalizedText.indexOf('チーム規模')).toBeLessThan(normalizedText.indexOf('長いカスタム詳細タイトル'));
  expect(text).toContain('CUSTOM-DETAIL-LINE-13');
  expectPdfContext(text, '職務経歴（続き）');
  expect(normalizedText).toContain('長いカスタム詳細タイトル');
});

test('PDF long record: 四書類は95行を保持し、読みやすい文字サイズと続きの文脈を保つ', async ({ page }) => {
  const details = Array.from(
    { length: 95 },
    (_, index) => `SYNTHETIC-ENTRY-${String(index + 1).padStart(3, '0')} fictional document layout verification.`
  ).join('\n');
  const cases = [
    {
      locale: 'ja',
      state: () => {
        const { state } = createPdfFixture({ locale: 'ja', length: 'short', documentType: 'resume', pageSize: 'A4' });
        state.documents.ja.education = [{ date: '2020-04', detail: details }];
        state.documents.ja.employment = [];
        return state;
      },
      continuation: '履歴書 · 印刷 試験 · 学歴',
      firstRecordContext: '履歴書 · 印刷 試験 · 学歴'
    },
    {
      locale: 'ja',
      state: () => {
        const { state } = createPdfFixture({ locale: 'ja', length: 'short', documentType: 'career', pageSize: 'A4' });
        state.documents.ja.careers[0].detailSections[0].content = details;
        return state;
      },
      continuation: '職務経歴（続き） · 検証株式会社 1 · 印刷品質担当 · 担当業務',
      firstRecordContext: '検証株式会社 1'
    },
    {
      locale: 'zh-CN',
      state: () => {
        const { state } = createPdfFixture({ locale: 'zh-CN', length: 'short', pageSize: 'A4' });
        state.documents['zh-CN'].resume.experience[0].details = details;
        return state;
      },
      continuation: /测试公司\s*1\s*·\s*打印质量负责\s*[人⼈]/,
      firstRecordContext: /测试公司\s*1/
    },
    {
      locale: 'en',
      state: () => {
        const { state } = createPdfFixture({ locale: 'en', length: 'short', pageSize: 'LETTER' });
        state.documents.en.resume.experience[0].details = details;
        return state;
      },
      continuation: 'Continued · Pagination Test Company 1 · Print Quality Lead',
      firstRecordContext: 'Pagination Test Company 1'
    }
  ];

  for (const fixture of cases) {
    const state = fixture.state();
    const previewSelector = fixture.locale === 'ja'
      ? '#documentPreview'
      : fixture.locale === 'zh-CN' ? '[data-zh-preview]' : '[data-en-preview]';
    await openLocale(page, fixture.locale);
    await page.locator('#importDataInput').setInputFiles({
      name: 'long-single-record.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(state))
    });
    await expect(page.locator(previewSelector)).toContainText('SYNTHETIC-ENTRY-095');
    const pages = await inspectPdf(await printPdf(page));
    const text = pages.map((item) => item.text).join(' ');
    expect(text.match(/SYNTHETIC-ENTRY-/g)).toHaveLength(95);
    expect(pages.length).toBeGreaterThan(1);
    const recordPages = pages.filter((item) => item.text.includes('SYNTHETIC-ENTRY-'));
    expect(recordPages.length).toBeGreaterThan(1);
    expectPdfContext(recordPages[0].text, fixture.firstRecordContext);
    for (const continuationPage of recordPages.slice(1)) {
      expectPdfContext(continuationPage.text, fixture.continuation);
    }
    const sampleItem = pages.flatMap((item) => item.items).find((item) => item.str.includes('SYNTHETIC-ENTRY-'));
    expect(Math.abs(sampleItem?.transform?.[3] || 0)).toBeGreaterThanOrEqual(9.5);
  }
});

test('PDF standard: 日本語の標準例は 2 ページの A4 で主要テキストを抽出できる', async ({ page }) => {
  await openLocale(page, 'ja');
  await page.locator('#loadSampleButton').click();

  const pages = await inspectPdf(await printPdf(page));
  expect(pages).toHaveLength(2);
  expectPageSize(pages, A4);
  const text = pages.map((item) => item.text).join(' ');
  expect(text).toContain('TOEIC Listening & Reading 850');
  expect(text).toContain('志望動機');
});

test('PDF long: English の超長文は複数 Letter ページになり末尾まで抽出できる', async ({ page }) => {
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
  test(`PDF ${locale}: Links はサイト名と protocol を除いた長い URL を印刷する`, async ({ page }) => {
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
