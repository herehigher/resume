import { expect, expectNoPageOverflow, openLocale, test } from './fixtures.js';

test('document tabs expose synchronized selection state and keyboard navigation', async ({ page }) => {
  await openLocale(page, 'ja');
  await expect(page.locator('#resumeDocumentTab')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#resumeDocumentTab')).toHaveAttribute('tabindex', '0');
  await expect(page.locator('#careerDocumentTab')).toHaveAttribute('aria-selected', 'false');
  await expect(page.locator('#careerDocumentTab')).toHaveAttribute('tabindex', '-1');
  await page.locator('#resumeDocumentTab').focus();
  await page.locator('#resumeDocumentTab').press('ArrowRight');
  await expect(page.locator('#resumeDocumentTab')).toHaveAttribute('aria-selected', 'false');
  await expect(page.locator('#resumeDocumentTab')).toHaveAttribute('tabindex', '-1');
  await expect(page.locator('#careerDocumentTab')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#careerDocumentTab')).toHaveAttribute('tabindex', '0');
  await expect(page.locator('#careerFields')).not.toHaveAttribute('hidden', '');
  await page.locator('#careerDocumentTab').press('Home');
  await expect(page.locator('#resumeDocumentTab')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#resumeDocumentTab')).toHaveAttribute('tabindex', '0');
});

test('@mobile mobile view controls expose synchronized selection state', async ({ page }) => {
  await openLocale(page, 'ja');
  await expect(page.locator('[data-mobile-view="editor"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('[data-mobile-view="preview"]').click();
  await expect(page.locator('[data-mobile-view="editor"]')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('[data-mobile-view="preview"]')).toHaveAttribute('aria-pressed', 'true');

  await openLocale(page, 'zh-CN');
  await expect(page.locator('[data-zh-mobile-view="editor"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('[data-zh-mobile-view="preview"]').click();
  await expect(page.locator('[data-zh-mobile-view="editor"]')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('[data-zh-mobile-view="preview"]')).toHaveAttribute('aria-pressed', 'true');

  await openLocale(page, 'en');
  await expect(page.locator('[data-en-mobile-view="editor"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('[data-en-mobile-view="preview"]').click();
  await expect(page.locator('[data-en-mobile-view="editor"]')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('[data-en-mobile-view="preview"]')).toHaveAttribute('aria-pressed', 'true');
});

test('@mobile 320px header keeps the larger favicon separate from its controls', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await openLocale(page, 'ja');

  const layout = await page.evaluate(() => {
    const rect = (selector) => document.querySelector(selector).getBoundingClientRect().toJSON();
    return { actions: rect('.header-actions'), brand: rect('.brand'), image: rect('.brand-mark') };
  });
  expect(layout.image.width).toBe(34);
  expect(layout.image.height).toBe(34);
  expect(layout.brand.right).toBeLessThanOrEqual(layout.actions.left);
  await expect(page.locator('#printButton')).toBeVisible();
  await expectNoPageOverflow(page);
});

test('localized public pages remain useful when JavaScript is disabled', async ({ baseURL, browser }) => {
  const context = await browser.newContext({ baseURL, javaScriptEnabled: false });
  const page = await context.newPage();
  for (const [path, language, heading] of [
    ['/ja/', 'ja', '日本語の履歴書・職務経歴書を作成'],
    ['/zh-cn/', 'zh-CN', '创建简体中文简历'],
    ['/en/', 'en', 'Create an English resume']
  ]) {
    await page.goto(path);
    await expect(page.locator('html')).toHaveAttribute('lang', language);
    await expect(page.locator('h1')).toHaveText(heading);
    await expect(page.locator('.entry-button')).toBeVisible();
  }
  await context.close();
});
