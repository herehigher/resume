import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createDefaultState } from '../../site/assets/js/state/defaults.js';
import { expect, openLocale, test } from './fixtures.js';

function documentGeometry(selector) {
  const page = document.querySelector(selector);
  const style = getComputedStyle(page);
  const paddingLeft = Number.parseFloat(style.paddingLeft);
  const paddingRight = Number.parseFloat(style.paddingRight);
  const lineRange = document.createRange();
  const text = page.querySelector('.paper-text-content, .career-body')
    || document.querySelector('.paper-text-content, .career-body');
  lineRange.selectNodeContents(text);
  const lineCount = new Set(
    [...lineRange.getClientRects()].map((rect) => Math.round(rect.top * 100) / 100)
  ).size;
  const grid = page.querySelector('.paper-table-row, .career-company-grid');

  return {
    contentWidth: Math.round((page.clientWidth - paddingLeft - paddingRight) * 100) / 100,
    gridColumns: getComputedStyle(grid).gridTemplateColumns,
    lineCount,
    minHeight: Math.round(Number.parseFloat(style.minHeight) * 100) / 100,
    padding: [style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft]
      .map((value) => Math.round(Number.parseFloat(value) * 100) / 100),
    pageWidth: Math.round(page.offsetWidth * 100) / 100
  };
}

async function loadJapaneseSample(page) {
  await openLocale(page, 'ja');
  await page.locator('#loadSampleButton').click();
  await expect(page.locator('#documentPreview')).toContainText('志望動機');
}

async function screenGeometry(page, selector) {
  await page.emulateMedia({ media: 'screen' });
  return page.evaluate(documentGeometry, selector);
}

async function beforePrintGeometry(page) {
  return page.evaluate(() => new Promise((resolve) => {
    window.addEventListener('beforeprint', () => {
      const workspace = document.getElementById('japaneseWorkspace');
      const preview = document.getElementById('documentPreview');
      const documentPage = document.querySelector('.resume-document');
      const section = document.querySelector('.paper-text-section');
      resolve({
        media: { print: matchMedia('print').matches, screen: matchMedia('screen').matches },
        prepared: workspace.classList.contains('is-printing'),
        preview: {
          marginBottom: getComputedStyle(preview).marginBottom,
          transform: getComputedStyle(preview).transform
        },
        documentPage: {
          minHeight: getComputedStyle(documentPage).minHeight,
          padding: getComputedStyle(documentPage).padding
        },
        sectionMinHeight: getComputedStyle(section).minHeight
      });
    }, { once: true });
    window.print();
  }));
}

async function inspectPdf(buffer) {
  const loadingTask = getDocument({ data: new Uint8Array(buffer), disableFontFace: true, isEvalSupported: false, useSystemFonts: true });
  const document = await loadingTask.promise;
  try {
    return await Promise.all(Array.from({ length: document.numPages }, async (_, index) => {
      const page = await document.getPage(index + 1);
      const viewport = page.getViewport({ scale: 1 });
      const text = await page.getTextContent();
      return { height: viewport.height, items: text.items, width: viewport.width };
    }));
  } finally {
    await loadingTask.destroy();
  }
}

function normalizePdfText(value) {
  return String(value).normalize('NFKC').replace(/\s/g, '');
}

function normalizeAsciiUrlText(value) {
  return normalizePdfText(value).replace(/[^a-z\d]/gi, '');
}

function textAndFontHeight(pages, fragment) {
  const items = pages.flatMap((page) => page.items);
  const item = items.find((candidate) => candidate.str.includes(fragment));
  return {
    fontHeight: item?.height,
    text: normalizePdfText(items.map((candidate) => candidate.str).join(''))
  };
}

async function importJapaneseState(page, state) {
  const importInput = page.locator('#importDataInput');
  await importInput.setInputFiles({
    name: 'japanese-pdf-layout-fixture.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(state))
  });
  await page.locator('#confirmSampleAdoptButton').click();
  await expect(importInput).toHaveValue('');
  await expect(page.locator('#globalMessage')).toHaveText('データを読み込みました。');
}

test('日本語: 1440px と 1024px のプレビューは A4 の内部版面を保つ', async ({ page }) => {
  const snapshots = [];
  for (const width of [1440, 1024]) {
    await page.setViewportSize({ width, height: 1000 });
    await loadJapaneseSample(page);
    snapshots.push(await screenGeometry(page, '.resume-document'));
  }

  expect(snapshots[0].pageWidth).toBeCloseTo(210 * 96 / 25.4, 0);
  expect(snapshots[0].contentWidth).toBeCloseTo(180 * 96 / 25.4, 0);
  expect(snapshots[0].minHeight).toBeCloseTo(297 * 96 / 25.4, 0);
  expect(snapshots[0].padding).toEqual([
    expect.closeTo(14 * 96 / 25.4, 0),
    expect.closeTo(15 * 96 / 25.4, 0),
    expect.closeTo(14 * 96 / 25.4, 0),
    expect.closeTo(15 * 96 / 25.4, 0)
  ]);
  expect(snapshots[1]).toEqual(snapshots[0]);

  await page.emulateMedia({ media: 'print' });
  const printed = await inspectPdf(await page.pdf({ preferCSSPageSize: true, printBackground: true }));
  expect(printed).toHaveLength(2);
  expect(printed.map((item) => [item.width, item.height])).toEqual([
    [expect.closeTo(595.28, 0), expect.closeTo(841.89, 0)],
    [expect.closeTo(595.28, 0), expect.closeTo(841.89, 0)]
  ]);
  expect(printed.every((item) => item.items.some((text) => text.str.trim()))).toBe(true);
  const previewText = await page.locator('.paper-text-content').first().textContent();
  const normalizeJapanesePdfText = (value) => normalizePdfText(value).replaceAll('⻑', '長');
  const normalizedPreview = normalizeJapanesePdfText(previewText);
  const normalizedPrinted = normalizeJapanesePdfText(printed.flatMap((item) => item.items).map((item) => item.str).join(''));
  expect(normalizedPrinted).toContain(normalizedPreview);
  expect(normalizedPrinted.split(normalizedPreview)).toHaveLength(2);

  await page.emulateMedia({ media: 'screen' });
  await page.locator('#careerDocumentTab').click();
  const careerAt1024 = await screenGeometry(page, '.career-document');
  await page.setViewportSize({ width: 1440, height: 1000 });
  const careerAt1440 = await screenGeometry(page, '.career-document');
  expect(careerAt1024).toEqual(careerAt1440);
});

test('日本語PDF: 学歴・職歴・資格の年月は左揃えで、表見出しに氏名を含めない', async ({ page }) => {
  await openLocale(page, 'ja');
  const state = createDefaultState('ja');
  state.profile.fields.fullName = '架空 太郎';
  state.documents.ja.education = [
    { date: '2011-04', detail: '架空大学 入学' },
    { date: '2015-11', detail: '架空大学 卒業' }
  ];
  state.documents.ja.employment = [{ date: '2026-03', detail: '架空株式会社 入社' }];
  state.documents.ja.qualification = [{ date: '2026-09', detail: '架空資格 取得', url: '' }];
  await importJapaneseState(page, state);

  const tableLayout = await page.evaluate(() => ({
    dates: [...document.querySelectorAll('.paper-table-date')].map((cell) => getComputedStyle(cell).textAlign),
    headings: [...document.querySelectorAll('.paper-table-header th:nth-child(2)')].map((cell) => cell.textContent.trim())
  }));
  expect(tableLayout.dates).toEqual(['left', 'left', 'left', 'left']);
  expect(tableLayout.headings).toEqual(['学歴', '職歴', '免許・資格']);

  const pages = await inspectPdf(await page.pdf({ preferCSSPageSize: true, printBackground: true }));
  const text = normalizePdfText(pages.flatMap((item) => item.items).map((item) => item.str).join(''));
  expect(text).toContain(normalizePdfText('2011年 4月'));
  expect(text).toContain(normalizePdfText('2026年 9月'));
  expect(text).not.toContain(normalizePdfText('履歴書 · 架空 太郎'));
});

test('[mobile] 日本語: smartphone 幅でも A4 の内部版面を reflow しない', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loadJapaneseSample(page);
  await page.locator('[data-mobile-view="preview"]').click();
  const mobile = await screenGeometry(page, '.resume-document');

  await page.setViewportSize({ width: 1440, height: 1000 });
  const desktop = await screenGeometry(page, '.resume-document');
  expect(mobile).toEqual(desktop);
});

test('日本語: 印刷時のプロフィールgridは罫線を連続させ、写真frameを固定する', async ({ page }) => {
  await openLocale(page, 'ja');
  const photoData = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
  const scenarios = [
    { hasPhoto: false, isLong: false },
    { hasPhoto: true, isLong: false },
    { hasPhoto: false, isLong: true },
    { hasPhoto: true, isLong: true }
  ];
  const measurements = [];

  for (const scenario of scenarios) {
    const state = createDefaultState('ja');
    state.profile.fields.fullName = scenario.isLong
      ? Array.from({ length: 8 }, (_, index) => `架空氏名の印刷検証 ${index + 1}`).join('\n')
      : '架空 太郎';
    state.profile.fields.nameKana = scenario.isLong ? 'かくう しめい の いんさつ けんしょう' : 'かくう たろう';
    if (scenario.hasPhoto) state.profile.photo = photoData;

    await page.emulateMedia({ media: 'screen' });
    await importJapaneseState(page, state);
    if (scenario.hasPhoto) await expect(page.locator('.profile-photo img')).toHaveAttribute('src', /^blob:/);
    await page.emulateMedia({ media: 'print' });
    const geometry = await page.locator('.resume-profile').evaluate((profile) => {
      const box = (element) => {
        const rect = element.getBoundingClientRect();
        return { bottom: rect.bottom, height: rect.height, left: rect.left, right: rect.right, top: rect.top, width: rect.width };
      };
      const text = profile.querySelector('.profile-text');
      const photoColumn = profile.querySelector('.profile-photo-column');
      const photo = profile.querySelector('.profile-photo');
      const photoImage = photo?.querySelector('img');
      const labels = [...profile.querySelectorAll('.profile-text .paper-label')];
      const rows = [...profile.querySelectorAll('.profile-text > div')];
      const photoStyle = getComputedStyle(photo);
      const columnStyle = getComputedStyle(photoColumn);
      return {
        labels: labels.map((label) => ({ ...box(label), borderRightStyle: getComputedStyle(label).borderRightStyle })),
        photo: { ...box(photo), cssHeight: photoStyle.height, cssWidth: photoStyle.width, objectFit: photoImage ? getComputedStyle(photoImage).objectFit : '' },
        photoColumn: { ...box(photoColumn), borderLeftStyle: columnStyle.borderLeftStyle },
        rows: rows.map(box),
        text: box(text)
      };
    });
    measurements.push({ ...scenario, geometry });
  }

  const close = (left, right) => expect(Math.abs(left - right)).toBeLessThanOrEqual(0.5);
  for (const { geometry, hasPhoto, isLong } of measurements) {
    const { labels, photo, photoColumn, rows, text } = geometry;
    expect(labels).toHaveLength(3);
    expect(rows).toHaveLength(3);
    expect(photoColumn.borderLeftStyle).toBe('solid');
    close(photoColumn.top, text.top);
    close(photoColumn.bottom, text.bottom);
    close(photoColumn.left, text.right);
    close(labels[0].top, text.top);
    close(labels.at(-1).bottom, text.bottom);
    for (let index = 0; index < labels.length; index += 1) {
      expect(labels[index].borderRightStyle).toBe('solid');
      close(labels[index].top, rows[index].top);
      close(labels[index].bottom, rows[index].bottom);
      close(labels[index].right, labels[0].right);
      if (index) close(labels[index - 1].bottom, labels[index].top);
    }
    expect(Math.abs(Number.parseFloat(photo.cssWidth) - (30 * 96 / 25.4))).toBeLessThan(0.5);
    expect(Math.abs(Number.parseFloat(photo.cssHeight) - (40 * 96 / 25.4))).toBeLessThan(0.5);
    expect(photo.objectFit).toBe(hasPhoto ? 'cover' : '');
    if (isLong) expect(text.height).toBeGreaterThan(photo.height + 0.5);
    else close(text.height, photo.height);
  }

  const frame = measurements[0].geometry.photo;
  for (const { geometry } of measurements.slice(1)) {
    expect(geometry.photo.cssWidth).toBe(frame.cssWidth);
    expect(geometry.photo.cssHeight).toBe(frame.cssHeight);
  }
});

test('日本語: visible print lifecycle は screen の予約版面を引き継がない', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 1000 });
  await loadJapaneseSample(page);

  const geometry = await beforePrintGeometry(page);
  expect(geometry).toEqual({
    media: { print: false, screen: true },
    prepared: true,
    preview: { marginBottom: '0px', transform: 'none' },
    documentPage: { minHeight: '0px', padding: '0px' },
    sectionMinHeight: '0px'
  });
});

test('日本語PDF: 連続URLを全文保持し、履歴書・職務経歴書の本文を縮小しない', async ({ page }) => {
  await openLocale(page, 'ja');
  const longUrl = `https://example.invalid/${'longpath'.repeat(50)}`;

  for (const activeDocument of ['resume', 'career']) {
    const baseline = createDefaultState('ja');
    baseline.documents.ja.activeDocument = activeDocument;
    baseline.documents.ja.fields.motivation = 'https://example.invalid/BASELINE-MOTIVATION';
    baseline.documents.ja.fields.careerSummary = 'https://example.invalid/BASELINE-SUMMARY';
    baseline.documents.ja.careers = [{
      company: '印刷検証株式会社',
      role: '検証担当',
      startDate: '2020-01',
      endDate: '',
      companyInfo: '架空の検証データ',
      detailSections: [
        { title: '担当業務', content: 'https://example.invalid/BASELINE-RESPONSIBILITIES' },
        { title: '実績・成果', content: 'https://example.invalid/BASELINE-ACHIEVEMENTS' }
      ]
    }];
    await importJapaneseState(page, baseline);
    const baselinePdf = await inspectPdf(await page.pdf({ preferCSSPageSize: true, printBackground: true }));
    const documentTitle = activeDocument === 'resume' ? '履' : '職務';
    const baselineResult = textAndFontHeight(baselinePdf, documentTitle);

    const longInput = structuredClone(baseline);
    if (activeDocument === 'resume') {
      longInput.documents.ja.fields.motivation = longUrl;
    } else {
      longInput.documents.ja.fields.careerSummary = longUrl;
      longInput.documents.ja.careers[0].detailSections[0].content = longUrl;
      longInput.documents.ja.careers[0].detailSections[1].content = longUrl;
    }
    await importJapaneseState(page, longInput);
    const longPdf = await inspectPdf(await page.pdf({ preferCSSPageSize: true, printBackground: true }));
    const longResult = textAndFontHeight(longPdf, documentTitle);

    expect(normalizeAsciiUrlText(longResult.text).match(/longpath/g)).toHaveLength(activeDocument === 'resume' ? 50 : 150);
    expect(longResult.fontHeight).toBeCloseTo(baselineResult.fontHeight, 2);
    expect(await page.locator(activeDocument === 'resume' ? '.paper-text-content' : '.career-body').first().evaluate(
      (element) => getComputedStyle(element).fontSize
    )).toBe(activeDocument === 'resume' ? '14px' : '13.5px');
  }
});
