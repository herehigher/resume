import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';

const errorHtml = readFileSync(new URL('../../site/404.html', import.meta.url), 'utf8');

for (const mode of ['desktop', '[mobile]']) {
  test(`${mode} 404 guidance remains usable at a nested missing URL`, async ({ page, baseURL }, testInfo) => {
    // Render the real error document at a nested URL; this is UI evidence, not Pages routing verification.
    await page.route('**/missing/nested/page', (route) => route.fulfill({ status: 404, contentType: 'text/html', body: errorHtml }));
    const requests = [];
    const errors = [];
    page.on('request', (request) => requests.push(request.url()));
    page.on('pageerror', (error) => errors.push(error.message));
    const response = await page.goto('/missing/nested/page');
    expect(response.status()).toBe(404);
    await expect(page.locator('h1')).toHaveText('404');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex,follow');
    await expect(page.locator('.entry-mark')).toHaveJSProperty('naturalWidth', 192);
    for (const [locale, href] of [['ja', '/'], ['zh-CN', '/zh-cn/'], ['en', '/en/']]) {
      const link = page.locator(`.entry-button[hreflang="${locale}"]`);
      await expect(link).toHaveAttribute('href', href);
      await link.scrollIntoViewIfNeeded();
      await expect(link).toBeInViewport();
      expect(await link.evaluate((element) => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    // Keyboard users can reach all three home links in reading order.
    await page.locator('body').click({ position: { x: 2, y: 2 } });
    for (const locale of ['ja', 'zh-CN', 'en']) {
      await page.keyboard.press('Tab');
      await expect(page.locator(`.entry-button[hreflang="${locale}"]`)).toBeFocused();
    }
    await page.screenshot({ path: testInfo.outputPath('404.png'), fullPage: true });
    for (const [locale, href] of [['ja', '/'], ['zh-CN', '/zh-cn/'], ['en', '/en/']]) {
      await page.goto('/missing/nested/page');
      await page.locator(`.entry-button[hreflang="${locale}"]`).click();
      await expect(page).toHaveURL(new URL(href, baseURL).href);
      await page.locator(`a[href$="editor/?lang=${locale}"]`).click();
      await expect(page.locator('#localeSelect')).toHaveValue(locale);
    }
    expect(errors).toEqual([]);
    expect(requests.every((url) => new URL(url).origin === new URL(baseURL).origin)).toBe(true);
  });
}
