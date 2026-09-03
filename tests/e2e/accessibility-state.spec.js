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

test('@mobile 320px header keeps readable locale choices and separate controls in every locale', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });

  for (const locale of ['ja', 'zh-CN', 'en']) {
    await openLocale(page, locale);

    const layout = await page.evaluate(() => {
      const rect = (selector) => document.querySelector(selector).getBoundingClientRect().toJSON();
      return {
        actions: rect('.header-actions'),
        brand: rect('.brand'),
        image: rect('.brand-mark'),
        locale: rect('#localeSelect'),
        menu: rect('#dataMenuSummary'),
        print: rect('#printButton')
      };
    });
    expect(layout.image.width).toBe(34);
    expect(layout.image.height).toBe(34);
    expect(layout.brand.right).toBeLessThanOrEqual(layout.actions.left);
    expect(layout.locale.right).toBeLessThanOrEqual(layout.menu.left);
    expect(layout.menu.right).toBeLessThanOrEqual(layout.print.left);
    await expect(page.locator('#localeSelect')).toHaveCSS('font-size', '11px');
    await expect(page.locator('#printButton')).toBeVisible();
    await expectNoPageOverflow(page);
  }
});

test('brand link follows the active editor locale', async ({ page }) => {
  for (const [locale, entryPath, accessibleName] of [
    ['ja', './ja/', 'Resume Studio の紹介ページを開く'],
    ['zh-CN', './zh-cn/', '打开 Resume Studio 简介页'],
    ['en', './en/', 'Open the Resume Studio introduction']
  ]) {
    await openLocale(page, locale);
    await expect(page.locator('.brand')).toHaveAttribute('href', entryPath);
    await expect(page.locator('.brand')).toHaveAttribute('aria-label', accessibleName);
  }
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
    await expect(page.locator('.entry-mark')).toHaveAttribute('alt', '');
    await expect(page.locator('.entry-mark')).toHaveAttribute('width', '50');
    await expect(page.locator('.entry-mark')).toHaveAttribute('height', '50');
    await expect(page.locator('.entry-button')).toBeVisible();
  }
  await context.close();
});

test('@mobile 320px localized public entries keep the centered brand, heading, and primary button separate', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  for (const path of ['/ja/', '/zh-cn/', '/en/']) {
    await page.goto(path);
    const layout = await page.evaluate(() => {
      const rect = (selector) => document.querySelector(selector).getBoundingClientRect().toJSON();
      return {
        brand: rect('.entry-brand'),
        button: rect('.entry-button'),
        brandCopy: rect('.entry-brand-copy'),
        heading: rect('h1'),
        mark: rect('.entry-mark')
      };
    });
    expect(layout.mark.width).toBe(50);
    expect(layout.mark.height).toBe(50);
    expect(Math.abs((layout.mark.top + layout.mark.bottom) / 2 - (layout.brandCopy.top + layout.brandCopy.bottom) / 2)).toBeLessThanOrEqual(1);
    expect(layout.brand.bottom).toBeLessThanOrEqual(layout.heading.top);
    expect(layout.heading.bottom).toBeLessThanOrEqual(layout.button.top);
    await expectNoPageOverflow(page);
  }
});
