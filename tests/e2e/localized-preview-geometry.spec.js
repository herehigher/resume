import { expect, openLocale, test } from './fixtures.js';

const CSS_PIXELS_PER_MM = 96 / 25.4;

function previewGeometry({ pageSelector, paragraphSelector, previewSelector, scrollSelector }) {
  const page = document.querySelector(pageSelector);
  const paragraph = page?.querySelector(paragraphSelector);
  const preview = document.querySelector(previewSelector);
  const scroll = document.querySelector(scrollSelector);
  const style = getComputedStyle(page);
  const previewStyle = getComputedStyle(preview);
  const pageBox = page.getBoundingClientRect();
  const scrollBox = scroll.getBoundingClientRect();
  const range = document.createRange();
  range.selectNodeContents(paragraph);

  return {
    contentWidth: page.clientWidth - Number.parseFloat(style.paddingLeft) - Number.parseFloat(style.paddingRight),
    lineCount: new Set([...range.getClientRects()].map((rect) => Math.round(rect.top * 100) / 100)).size,
    padding: [style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft].map(Number.parseFloat),
    pageWidth: page.offsetWidth,
    previewWidth: Number.parseFloat(previewStyle.width),
    scaledPageRight: pageBox.right,
    scrollContentRight: scrollBox.right - Number.parseFloat(getComputedStyle(scroll).paddingRight),
    scrollHeight: scroll.scrollHeight,
    scrollClientHeight: scroll.clientHeight
  };
}

async function loadChineseSample(page) {
  await openLocale(page, 'zh-CN');
  await page.locator('[data-zh-action="sample"]').click();
  await expect(page.locator('[data-zh-preview]')).toContainText('数据分析专业证书');
}

async function loadEnglishSample(page, pageSize) {
  await openLocale(page, 'en');
  await page.locator('[data-en-load-sample]').click();
  if (pageSize === 'A4') await page.locator('[data-en-page-size]').selectOption('A4', { force: true });
  await expect(page.locator('[data-en-preview]')).toContainText('Product');
}

async function geometryAtWidths(page, load, selectors) {
  const snapshots = [];
  for (const width of [1440, 1024, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await load(page);
    if (width <= 820) await page.locator(selectors.mobilePreviewSelector).click();
    await page.waitForFunction(({ pageSelector, previewSelector }) => {
      const documentPage = document.querySelector(pageSelector);
      const preview = document.querySelector(previewSelector);
      return Math.abs(Number.parseFloat(getComputedStyle(preview).width) - documentPage.offsetWidth) < .5;
    }, selectors);
    snapshots.push(await page.evaluate(previewGeometry, selectors));
  }
  return snapshots;
}

function expectCanonicalGeometry(snapshots, { contentWidth, padding, pageWidth }) {
  for (const snapshot of snapshots) {
    expect(snapshot.pageWidth).toBeCloseTo(pageWidth, 0);
    expect(snapshot.previewWidth).toBeCloseTo(pageWidth, 0);
    expect(snapshot.contentWidth).toBeCloseTo(contentWidth, 0);
    expect(snapshot.padding).toEqual(padding.map((value) => expect.closeTo(value, 0)));
  }
  expect(snapshots.slice(1)).toEqual(snapshots.slice(1).map((snapshot) => ({
    ...snapshots[0],
    scaledPageRight: snapshot.scaledPageRight,
    scrollContentRight: snapshot.scrollContentRight,
    scrollHeight: snapshot.scrollHeight,
    scrollClientHeight: snapshot.scrollClientHeight
  })));
}

test('简体中文: A4 preview keeps the print content geometry at desktop and smartphone widths', async ({ page }) => {
  const snapshots = await geometryAtWidths(page, loadChineseSample, {
    pageSelector: '.zh-resume-document',
    paragraphSelector: '.zh-summary .zh-section-body',
    previewSelector: '[data-zh-preview]',
    scrollSelector: '[data-zh-preview-scroll]',
    mobilePreviewSelector: '[data-zh-mobile-view="preview"]'
  });

  expectCanonicalGeometry(snapshots, {
    contentWidth: 180 * CSS_PIXELS_PER_MM,
    padding: [13 * CSS_PIXELS_PER_MM, 15 * CSS_PIXELS_PER_MM, 14 * CSS_PIXELS_PER_MM, 15 * CSS_PIXELS_PER_MM],
    pageWidth: 210 * CSS_PIXELS_PER_MM
  });
});

test('English: A4 and Letter previews keep their selected print content geometry after resizing', async ({ page }) => {
  const selectors = {
    pageSelector: '.english-document',
    paragraphSelector: '.en-section-body',
    previewSelector: '[data-en-preview]',
    scrollSelector: '[data-en-preview-scroll]',
    mobilePreviewSelector: '[data-en-mobile-view="preview"]'
  };
  const a4 = await geometryAtWidths(page, (browserPage) => loadEnglishSample(browserPage, 'A4'), selectors);
  const letter = await geometryAtWidths(page, (browserPage) => loadEnglishSample(browserPage, 'LETTER'), selectors);

  expectCanonicalGeometry(a4, {
    contentWidth: 180 * CSS_PIXELS_PER_MM,
    padding: [14 * CSS_PIXELS_PER_MM, 15 * CSS_PIXELS_PER_MM, 14 * CSS_PIXELS_PER_MM, 15 * CSS_PIXELS_PER_MM],
    pageWidth: 210 * CSS_PIXELS_PER_MM
  });
  expectCanonicalGeometry(letter, {
    contentWidth: (8.5 - 2 * .62) * 96,
    padding: [.55 * 96, .62 * 96, .55 * 96, .62 * 96],
    pageWidth: 8.5 * 96
  });
});

test('[mobile] preview fitting leaves the scaled Chinese and English pages inside the scrollable content area', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loadChineseSample(page);
  await page.locator('[data-zh-mobile-view="preview"]').click();
  await page.waitForFunction(() => Number(getComputedStyle(document.querySelector('[data-zh-preview]')).transform.match(/matrix\(([^,]+)/)?.[1]) < .5);
  await page.locator('[data-zh-action="zoom-out"]').click();
  await page.locator('[data-zh-action="zoom-out"]').click();
  await page.locator('[data-zh-action="zoom-out"]').click();
  const chinese = await page.evaluate(previewGeometry, {
    pageSelector: '.zh-resume-document',
    paragraphSelector: '.zh-summary .zh-section-body',
    previewSelector: '[data-zh-preview]',
    scrollSelector: '[data-zh-preview-scroll]'
  });
  expect(chinese.scaledPageRight).toBeLessThanOrEqual(chinese.scrollContentRight + 1);
  expect(chinese.scrollHeight).toBeGreaterThan(chinese.scrollClientHeight);

  await loadEnglishSample(page, 'LETTER');
  await page.locator('[data-en-mobile-view="preview"]').click();
  await page.waitForFunction(() => Number(getComputedStyle(document.querySelector('[data-en-preview]')).transform.match(/matrix\(([^,]+)/)?.[1]) < .444);
  const english = await page.evaluate(previewGeometry, {
    pageSelector: '.english-document',
    paragraphSelector: '.en-section-body',
    previewSelector: '[data-en-preview]',
    scrollSelector: '[data-en-preview-scroll]'
  });
  expect(english.scaledPageRight).toBeLessThanOrEqual(english.scrollContentRight + 1);
});
