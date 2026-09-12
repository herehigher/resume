import { expect, openLocale, test } from './fixtures.js';
import { createDefaultState } from '../../site/assets/js/state/defaults.js';

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

const MOBILE_GEOMETRY_TOLERANCE = 1;
const mobileGeometryPollOptions = {
  intervals: [50, 100, 250],
  timeout: 5_000
};

function mobilePreviewSnapshot({ finalSelector, locale, previewSelector, sampleText, scrollSelector, tolerance }) {
  const preview = document.querySelector(previewSelector);
  const scroll = document.querySelector(scrollSelector);
  const page = preview?.querySelector('.document-page');
  const final = document.querySelector(finalSelector);
  const round = (value) => Math.round(value * 100) / 100;
  const bounds = (element) => {
    const rect = element?.getBoundingClientRect();
    if (!rect) return null;
    return Object.fromEntries(['bottom', 'left', 'right', 'top'].map((key) => [key, round(rect[key])]));
  };

  if (!preview || !scroll || !page || !final) {
    return {
      final: { bounds: bounds(final) },
      locale,
      page: { bounds: bounds(page) },
      preview: { transform: null },
      scroll: { bounds: bounds(scroll) },
      viewport: { height: window.innerHeight, width: window.innerWidth }
    };
  }

  const transform = getComputedStyle(preview).transform;
  const scaleX = transform === 'none'
    ? 1
    : Number.parseFloat(transform.match(/^matrix\(([^,]+)/)?.[1]);
  const pageBounds = bounds(page);
  const scrollBounds = bounds(scroll);
  const finalBounds = bounds(final);

  return {
    final: {
      bottomWithinScroll: finalBounds.bottom <= scrollBounds.bottom + tolerance,
      bounds: finalBounds,
      topWithinScroll: finalBounds.top >= scrollBounds.top - tolerance
    },
    locale,
    page: {
      bounds: pageBounds,
      leftWithinScroll: pageBounds.left >= scrollBounds.left - tolerance,
      rightWithinScroll: pageBounds.right <= scrollBounds.right + tolerance
    },
    preview: {
      isVisible: preview.getClientRects().length > 0,
      scaleX: round(scaleX),
      transform,
      transformIsScaled: Number.isFinite(scaleX) && scaleX > 0 && scaleX < 1
    },
    sampleReady: preview.textContent.includes(sampleText),
    scroll: {
      bounds: scrollBounds,
      clientHeight: scroll.clientHeight,
      clientWidth: scroll.clientWidth,
      scrollHeight: scroll.scrollHeight,
      scrollLeft: scroll.scrollLeft,
      scrollTop: scroll.scrollTop,
      scrollWidth: scroll.scrollWidth
    },
    viewport: { height: window.innerHeight, width: window.innerWidth }
  };
}

async function expectMobilePreviewState(page, item, expected, condition) {
  let snapshot;
  try {
    await expect.poll(
      async () => {
        snapshot = await page.evaluate(mobilePreviewSnapshot, { ...item, tolerance: MOBILE_GEOMETRY_TOLERANCE });
        return snapshot;
      },
      {
        ...mobileGeometryPollOptions,
        message: `${item.locale} mobile preview ${condition}`
      }
    ).toMatchObject(expected);
  } catch (error) {
    await test.info().attach(`${item.locale} mobile preview geometry`, {
      body: JSON.stringify({ condition, expected, snapshot }, null, 2),
      contentType: 'application/json'
    });
    throw error;
  }
}

async function waitForRenderingFrames(page) {
  await page.evaluate(() => new Promise((resolve) => {
    window.requestAnimationFrame(() => window.requestAnimationFrame(resolve));
  }));
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

test('简体中文: long experience dates clear the timeline rail without narrowing desktop text', async ({ page }) => {
  const state = createDefaultState('zh-CN');
  state.documents['zh-CN'].resume.experience = [{
    startDate: '2019-01',
    endDate: '2026-12',
    company: 'Fictional Studio',
    role: 'Layout Verification Lead',
    details: 'This fictional entry verifies the date, timeline rail, and text-column geometry.'
  }];

  await openLocale(page, 'zh-CN');
  await page.locator('#importDataInput').setInputFiles({
    name: 'fictional-timeline-geometry.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(state))
  });
  await page.locator('#confirmSampleAdoptButton').click();
  await expect(page.locator('[data-zh-preview]')).toContainText('Fictional Studio');

  const desktop = await page.evaluate(() => {
    const item = document.querySelector('[data-section-key="experience"] .zh-timeline-item');
    const date = item?.querySelector('.zh-timeline-date');
    const content = item?.querySelector('.zh-timeline-content');
    const heading = content?.querySelector('h3');
    const before = content && getComputedStyle(content, '::before');
    if (!item || !date || !content || !heading || !before) return null;
    const dateBounds = date.getBoundingClientRect();
    const contentBounds = content.getBoundingClientRect();
    const headingBounds = heading.getBoundingClientRect();
    const nodeLeft = contentBounds.left + Number.parseFloat(before.left);
    const documentPage = document.querySelector('.zh-resume-document');
    const previewScale = documentPage
      ? documentPage.getBoundingClientRect().width / documentPage.offsetWidth
      : 1;
    return {
      dateToNodeGap: (nodeLeft - dateBounds.right) / previewScale,
      headingOffset: headingBounds.left - item.getBoundingClientRect().left,
      previewScale,
      fontVariantNumeric: getComputedStyle(date).fontVariantNumeric,
      whiteSpace: getComputedStyle(date).whiteSpace
    };
  });

  expect(desktop).not.toBeNull();
  expect(desktop.dateToNodeGap).toBeGreaterThanOrEqual(10);
  expect(desktop.dateToNodeGap).toBeLessThanOrEqual(12);
  expect(desktop.headingOffset / desktop.previewScale).toBeCloseTo(118, 0);
  expect(desktop).toMatchObject({ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' });

  await page.setViewportSize({ width: 639, height: 844 });
  await page.locator('[data-zh-mobile-view="preview"]').click();
  const mobile = await page.evaluate(() => {
    const item = document.querySelector('[data-section-key="experience"] .zh-timeline-item');
    const date = item?.querySelector('.zh-timeline-date');
    const content = item?.querySelector('.zh-timeline-content');
    if (!item || !date || !content) return null;
    const dateBounds = date.getBoundingClientRect();
    const contentBounds = content.getBoundingClientRect();
    return {
      contentToItemWidth: contentBounds.width / item.getBoundingClientRect().width,
      dateAboveContent: dateBounds.bottom <= contentBounds.top
    };
  });

  expect(mobile).toMatchObject({ dateAboveContent: true });
  expect(mobile.contentToItemWidth).toBeGreaterThan(.99);
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
      sampleText: '数据分析专业证书',
      sample: '[data-zh-action="sample"]',
      scrollSelector: '[data-zh-preview-scroll]',
      workspaceSelector: '#chineseWorkspace'
    },
    {
      locale: 'en',
      finalSelector: '.en-certification-list li:last-child',
      mobilePreview: '[data-en-mobile-view="preview"]',
      previewSelector: '[data-en-preview]',
      sampleText: 'Certifications',
      sample: '[data-en-load-sample]',
      scrollSelector: '[data-en-preview-scroll]',
      workspaceSelector: '[data-english-editor]'
    }
  ];

  for (const item of cases) {
    await openLocale(page, item.locale);
    await page.locator(item.sample).click();
    await expect(page.locator(item.previewSelector)).toContainText(item.sampleText);
    await page.locator(item.mobilePreview).click();
    await expect(page.locator(item.workspaceSelector)).toHaveAttribute('data-mobile-mode', 'preview');
    await expect(page.locator(item.mobilePreview)).toHaveAttribute('aria-pressed', 'true');
    await expectMobilePreviewState(page, item, {
      preview: { isVisible: true, transformIsScaled: true },
      sampleReady: true
    }, 'waits for the locale sample, mobile view, and scaled transform');

    await page.evaluate(({ scrollSelector }) => {
      const scroll = document.querySelector(scrollSelector);
      scroll.scrollLeft = 0;
      scroll.scrollTop = scroll.scrollHeight;
    }, item);
    await waitForRenderingFrames(page);
    await expectMobilePreviewState(page, item, { page: { leftWithinScroll: true } }, 'keeps the page left edge reachable');
    await expectMobilePreviewState(page, item, { page: { rightWithinScroll: true } }, 'keeps the page right edge reachable');
    await expectMobilePreviewState(page, item, { final: { topWithinScroll: true } }, 'keeps the final content top reachable');
    await expectMobilePreviewState(page, item, { final: { bottomWithinScroll: true } }, 'keeps the final content bottom reachable');
  }
});
