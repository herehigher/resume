import { expect, test as base } from '@playwright/test';

export const test = base.extend({
  page: async ({ baseURL, page }, use) => {
    const expectedOrigin = new URL(baseURL).origin;
    const externalRequests = [];
    const pageErrors = [];

    page.on('request', (request) => {
      const url = new URL(request.url());
      if (['http:', 'https:'].includes(url.protocol) && url.origin !== expectedOrigin) {
        externalRequests.push(`${request.method()} ${request.url()}`);
      }
    });
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await use(page);

    expect(externalRequests, '個人データを送信し得る外部ネットワーク要求がないこと').toEqual([]);
    expect(pageErrors, 'ブラウザ実行中に未処理エラーがないこと').toEqual([]);
  }
});

export { expect } from '@playwright/test';

export async function openLocale(page, locale) {
  await page.goto(`/?lang=${encodeURIComponent(locale)}`);
  await expect(page.locator('html')).toHaveAttribute('lang', locale === 'en' ? 'en' : locale);
  await expect(page.locator('#localeSelect')).toHaveValue(locale);
}

export async function revealField(locator) {
  await locator.evaluate((field) => {
    const details = field.closest('details');
    if (details) details.open = true;
  });
}
