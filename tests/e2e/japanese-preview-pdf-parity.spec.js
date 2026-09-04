import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
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

function pdfLineCount(items, fragments) {
  const lines = new Map();
  for (const item of items) {
    const y = Math.round(item.transform[5] * 100) / 100;
    lines.set(y, `${lines.get(y) || ''}${item.str}`);
  }
  return [...lines.values()].filter((line) => fragments.some((fragment) => line.includes(fragment))).length;
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
  expect(pdfLineCount(printed[1].items, ['これまで培った', 'から課題を整理'])).toBe(snapshots[0].lineCount);

  await page.emulateMedia({ media: 'screen' });
  await page.locator('#careerDocumentTab').click();
  const careerAt1024 = await screenGeometry(page, '.career-document');
  await page.setViewportSize({ width: 1440, height: 1000 });
  const careerAt1440 = await screenGeometry(page, '.career-document');
  expect(careerAt1024).toEqual(careerAt1440);
});

test('@mobile 日本語: smartphone 幅でも A4 の内部版面を reflow しない', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loadJapaneseSample(page);
  await page.locator('[data-mobile-view="preview"]').click();
  const mobile = await screenGeometry(page, '.resume-document');

  await page.setViewportSize({ width: 1440, height: 1000 });
  const desktop = await screenGeometry(page, '.resume-document');
  expect(mobile).toEqual(desktop);
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
