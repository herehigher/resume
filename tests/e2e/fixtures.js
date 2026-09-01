import { expect, test as base } from '@playwright/test';

export function installNetworkGuard(context, baseURL) {
  const expectedOrigin = new URL(baseURL).origin;
  const externalRequests = [];
  const pageErrors = [];
  const webSockets = [];
  const observedPages = new Set();

  function observePage(page) {
    if (observedPages.has(page)) return;
    observedPages.add(page);
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('websocket', (socket) => webSockets.push(socket.url()));
  }

  function observeRequest(request) {
    const url = new URL(request.url());
    if (['http:', 'https:'].includes(url.protocol) && url.origin !== expectedOrigin) {
      externalRequests.push(`${request.method()} ${request.url()}`);
    }
  }

  context.pages().forEach(observePage);
  context.on('page', observePage);
  context.on('request', observeRequest);

  return {
    externalRequests,
    pageErrors,
    webSockets,
    dispose() {
      context.off('page', observePage);
      context.off('request', observeRequest);
    }
  };
}

export const test = base.extend({
  context: async ({ baseURL, context }, use) => {
    const guard = installNetworkGuard(context, baseURL);

    await use(context);

    guard.dispose();
    expect(guard.externalRequests, '個人データを送信し得る外部ネットワーク要求がないこと').toEqual([]);
    expect(guard.webSockets, 'WebSocket接続で個人データを送信しないこと').toEqual([]);
    expect(guard.pageErrors, 'ブラウザ実行中に未処理エラーがないこと').toEqual([]);
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

export async function expectNoPageOverflow(page) {
  await expect.poll(() => page.evaluate(() => (
    document.documentElement.scrollWidth <= document.documentElement.clientWidth
  ))).toBe(true);
}
