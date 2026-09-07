import { expect, openLocale, test } from './fixtures.js';

function previewGeometry({ pageSelector, paragraphSelector, previewSelector, scrollSelector }) {
  const page = document.querySelector(pageSelector);
  const paragraph = page?.querySelector(paragraphSelector);
  const preview = document.querySelector(previewSelector);
  const scroll = document.querySelector(scrollSelector);
  const round = (value) => Math.round(value * 100) / 100;
  const style = getComputedStyle(page);
  const range = document.createRange();
  range.selectNodeContents(paragraph);
  const lineCount = new Set(
    [...range.getClientRects()].map((rect) => round(rect.top))
  ).size;

  return {
    contentWidth: round(page.clientWidth - Number.parseFloat(style.paddingLeft) - Number.parseFloat(style.paddingRight)),
    lineCount,
    padding: [style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft]
      .map((value) => round(Number.parseFloat(value))),
    pageHeight: round(page.offsetHeight),
    pageWidth: round(page.offsetWidth),
    previewTransform: getComputedStyle(preview).transform,
    scrollHeight: scroll.scrollHeight
  };
}

async function geometryAtWidths(page, selectors) {
  const measurements = [];
  for (const width of [1440, 1024, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    if (width <= 820) await page.locator(selectors.mobilePreview).click();
    await expect.poll(() => page.evaluate(previewGeometry, selectors)).not.toBeNull();
    measurements.push(await page.evaluate(previewGeometry, selectors));
  }
  return measurements;
}

function expectCanonicalGeometry(measurements, { height, padding, width }) {
  expect(measurements).toHaveLength(3);
  expect(measurements[0].pageWidth).toBeCloseTo(width, 0);
  expect(measurements[0].pageHeight).toBeGreaterThanOrEqual(height - 1);
  expect(measurements[0].padding).toEqual(padding.map((value) => expect.closeTo(value, 0)));
  expect(measurements[0].contentWidth).toBeCloseTo(width - padding[1] - padding[3], 0);

  for (const measurement of measurements.slice(1)) {
    expect(measurement.pageWidth).toBe(measurements[0].pageWidth);
    expect(measurement.padding).toEqual(measurements[0].padding);
    expect(measurement.contentWidth).toBe(measurements[0].contentWidth);
    expect(measurement.lineCount).toBe(measurements[0].lineCount);
  }
}

test('简体中文: A4 preview page-box and representative wrapping stay canonical across viewports', async ({ page }) => {
  await openLocale(page, 'zh-CN');
  await page.locator('[data-zh-action="sample"]').click();
  await expect(page.locator('[data-zh-preview]')).toContainText('数据分析专业证书');

  const measurements = await geometryAtWidths(page, {
    pageSelector: '.zh-resume-document',
    paragraphSelector: '.zh-summary .zh-section-body',
    mobilePreview: '[data-zh-mobile-view="preview"]',
    previewSelector: '[data-zh-preview]',
    scrollSelector: '[data-zh-preview-scroll]'
  });

  expectCanonicalGeometry(measurements, {
    width: 210 * 96 / 25.4,
    height: 297 * 96 / 25.4,
    padding: [13 * 96 / 25.4, 15 * 96 / 25.4, 14 * 96 / 25.4, 15 * 96 / 25.4]
  });

  await page.setViewportSize({ width: 1440, height: 1000 });
  const beforeZoom = await page.evaluate(previewGeometry, {
    pageSelector: '.zh-resume-document',
    paragraphSelector: '.zh-summary .zh-section-body',
    previewSelector: '[data-zh-preview]',
    scrollSelector: '[data-zh-preview-scroll]'
  });
  await page.locator('[data-zh-action="zoom-out"]').click();
  const afterZoom = await page.evaluate(previewGeometry, {
    pageSelector: '.zh-resume-document',
    paragraphSelector: '.zh-summary .zh-section-body',
    previewSelector: '[data-zh-preview]',
    scrollSelector: '[data-zh-preview-scroll]'
  });
  expect(afterZoom.previewTransform).not.toBe(beforeZoom.previewTransform);
  expect(afterZoom).toMatchObject({
    contentWidth: beforeZoom.contentWidth,
    lineCount: beforeZoom.lineCount,
    padding: beforeZoom.padding,
    pageWidth: beforeZoom.pageWidth
  });
});

test('English: A4 and Letter preview page-boxes refit without changing their internal geometry', async ({ page }) => {
  await openLocale(page, 'en');
  await page.locator('[data-en-load-sample]').click();
  await expect(page.locator('[data-en-preview]')).toContainText('Certifications');

  const selectors = {
    pageSelector: '.english-document',
    paragraphSelector: '.en-section-body',
    mobilePreview: '[data-en-mobile-view="preview"]',
    previewSelector: '[data-en-preview]',
    scrollSelector: '[data-en-preview-scroll]'
  };
  await page.locator('[data-en-page-size]').selectOption('A4');
  const a4 = await geometryAtWidths(page, selectors);
  expectCanonicalGeometry(a4, {
    width: 210 * 96 / 25.4,
    height: 297 * 96 / 25.4,
    padding: [14 * 96 / 25.4, 15 * 96 / 25.4, 14 * 96 / 25.4, 15 * 96 / 25.4]
  });

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator('[data-en-page-size]').selectOption('LETTER');
  const letter = await geometryAtWidths(page, selectors);
  expectCanonicalGeometry(letter, {
    width: 8.5 * 96,
    height: 11 * 96,
    padding: [.55 * 96, .62 * 96, .55 * 96, .62 * 96]
  });

  expect(letter[0].previewTransform).not.toBe(a4[0].previewTransform);
  expect(letter[0].scrollHeight).not.toBe(a4[0].scrollHeight);
});

test('[webkit] WebKit: Chinese A4 and English Letter keep their own preview geometry across viewports', async ({ page, browserName }) => {
  expect(browserName).toBe('webkit');
  const cases = [
    {
      locale: 'zh-CN',
      pageSelector: '.zh-resume-document',
      paragraphSelector: '.zh-summary .zh-section-body',
      mobilePreview: '[data-zh-mobile-view="preview"]',
      previewSelector: '[data-zh-preview]',
      sample: '[data-zh-action="sample"]',
      scrollSelector: '[data-zh-preview-scroll]'
    },
    {
      locale: 'en',
      pageSelector: '.english-document',
      paragraphSelector: '.en-section-body',
      mobilePreview: '[data-en-mobile-view="preview"]',
      previewSelector: '[data-en-preview]',
      sample: '[data-en-load-sample]',
      scrollSelector: '[data-en-preview-scroll]'
    }
  ];

  for (const item of cases) {
    await openLocale(page, item.locale);
    await page.locator(item.sample).click();
    const measurements = await geometryAtWidths(page, item);
    for (const measurement of measurements.slice(1)) {
      expect(measurement.pageWidth).toBe(measurements[0].pageWidth);
      expect(measurement.padding).toEqual(measurements[0].padding);
      expect(measurement.contentWidth).toBe(measurements[0].contentWidth);
      expect(measurement.lineCount).toBe(measurements[0].lineCount);
    }
  }
});

test('[mobile] 简体中文・English: scaled preview has no horizontal crop and its final content is reachable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const cases = [
    {
      locale: 'zh-CN',
      finalSelector: '.zh-certifications li:last-child',
      mobilePreview: '[data-zh-mobile-view="preview"]',
      previewSelector: '[data-zh-preview]',
      sample: '[data-zh-action="sample"]',
      scrollSelector: '[data-zh-preview-scroll]'
    },
    {
      locale: 'en',
      finalSelector: '.en-certification-list li:last-child',
      mobilePreview: '[data-en-mobile-view="preview"]',
      previewSelector: '[data-en-preview]',
      sample: '[data-en-load-sample]',
      scrollSelector: '[data-en-preview-scroll]'
    }
  ];

  for (const item of cases) {
    await openLocale(page, item.locale);
    await page.locator(item.sample).click();
    await page.locator(item.mobilePreview).click();
    await expect(page.locator(item.previewSelector)).toBeVisible();
    await expect.poll(() => page.evaluate(({ previewSelector, scrollSelector }) => {
      const pageBox = document.querySelector(previewSelector).querySelector('.document-page').getBoundingClientRect();
      const scroll = document.querySelector(scrollSelector).getBoundingClientRect();
      return pageBox.width <= scroll.width;
    }, item)).toBe(true);
    const result = await page.evaluate(({ finalSelector, scrollSelector }) => {
      const final = document.querySelector(finalSelector);
      const scroll = document.querySelector(scrollSelector);
      scroll.scrollLeft = 0;
      scroll.scrollTop = scroll.scrollHeight;
      const finalRect = final.getBoundingClientRect();
      const scrollRect = scroll.getBoundingClientRect();
      const pageRect = final.closest('.document-page').getBoundingClientRect();
      const previewRect = final.closest('.document-preview').getBoundingClientRect();
      return {
        finalBottom: finalRect.bottom,
        finalTop: finalRect.top,
        pageLeft: pageRect.left,
        pageRight: pageRect.right,
        scrollBottom: scrollRect.bottom,
        scrollLeft: scrollRect.left,
        scrollRight: scrollRect.right,
        scrollTop: scrollRect.top,
        previewLeft: previewRect.left,
        previewRight: previewRect.right
      };
    }, item);
    expect(result.pageLeft).toBeGreaterThanOrEqual(result.scrollLeft - 1);
    expect(result.pageRight).toBeLessThanOrEqual(result.scrollRight + 1);
    expect(result.finalTop).toBeGreaterThanOrEqual(result.scrollTop - 1);
    expect(result.finalBottom).toBeLessThanOrEqual(result.scrollBottom + 1);
  }
});
