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

async function importJapaneseState(page, state) {
  await page.locator('#importDataInput').setInputFiles({
    name: 'japanese-layout-fixture.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(state))
  });
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
  const normalizePdfText = (value) => String(value).replace(/\s/g, '').normalize('NFKC').replaceAll('⻑', '長');
  const normalizedPreview = normalizePdfText(previewText);
  const normalizedPrinted = normalizePdfText(printed.flatMap((item) => item.items).map((item) => item.str).join(''));
  expect(normalizedPrinted).toContain(normalizedPreview);
  expect(normalizedPrinted.split(normalizedPreview)).toHaveLength(2);

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

test('日本語: 印刷時の写真枠は氏名・写真の有無にかかわらず30×40mmを保つ', async ({ page }) => {
  await openLocale(page, 'ja');
  const shortName = createDefaultState('ja');
  shortName.profile.fields.fullName = '架空 太郎';
  await importJapaneseState(page, shortName);
  await page.emulateMedia({ media: 'print' });
  const withoutPhoto = await page.locator('.profile-photo').evaluate((element) => {
    const box = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return { cssHeight: style.height, cssWidth: style.width, height: box.height, width: box.width };
  });

  const longName = structuredClone(shortName);
  longName.profile.fields.fullName = '見本 サンプル アレクサンドラ マリア テスト';
  longName.profile.fields.nameKana = 'みほん さんぷる あれくさんどら まりあ てすと';
  longName.profile.fields.address = '架空都架空区架空町一丁目二番地三号 長い住所のレイアウト検証';
  longName.profile.photo = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
  await page.emulateMedia({ media: 'screen' });
  await importJapaneseState(page, longName);
  await expect(page.locator('.profile-photo img')).toHaveAttribute('src', /^blob:/);
  await page.emulateMedia({ media: 'print' });
  const withPhoto = await page.locator('.profile-photo').evaluate((element) => {
    const box = element.getBoundingClientRect();
    const image = element.querySelector('img');
    const style = getComputedStyle(element);
    return { cssHeight: style.height, cssWidth: style.width, height: box.height, objectFit: image ? getComputedStyle(image).objectFit : '', width: box.width };
  });

  expect(Math.abs(Number.parseFloat(withoutPhoto.cssWidth) - (30 * 96 / 25.4))).toBeLessThan(0.5);
  expect(Math.abs(Number.parseFloat(withoutPhoto.cssHeight) - (40 * 96 / 25.4))).toBeLessThan(0.5);
  expect(withPhoto).toMatchObject({
    cssHeight: withoutPhoto.cssHeight,
    cssWidth: withoutPhoto.cssWidth,
    objectFit: 'cover'
  });
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
