import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test as base } from '@playwright/test';

import { documentUrlPaths } from '../../scripts/deployment-path-contract.mjs';

const siteRoot = fileURLToPath(new URL('../../site/', import.meta.url));
export const DRAFT_STORAGE_KEY = 'resume-studio-web-v1';
export const LOCALE_PREFERENCE_KEY = 'resume-studio-locale-v1';

function collectStaticPaths(directory = siteRoot) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectStaticPaths(absolutePath);
    return [`/${path.relative(siteRoot, absolutePath).split(path.sep).join('/')}`];
  });
}

const staticPaths = new Set(collectStaticPaths());
const documentPaths = documentUrlPaths();

export async function installNetworkGuard(context, baseURL) {
  const expectedOrigin = new URL(baseURL).origin;
  const unexpectedRequests = [];
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
    if (!['http:', 'https:'].includes(url.protocol)) return;

    const resourceType = request.resourceType();
    const query = [...url.searchParams.entries()];
    const isDocument = resourceType === 'document'
      && documentPaths.has(url.pathname)
      && (query.length === 0 || (
        query.length === 1
        && query[0][0] === 'lang'
        && ['ja', 'zh-CN', 'en'].includes(query[0][1])
      ));
    const isStaticAsset = ['font', 'image', 'script', 'stylesheet'].includes(resourceType)
      && staticPaths.has(url.pathname)
      && !url.search;
    const isAllowedSameOrigin = url.origin === expectedOrigin
      && request.method() === 'GET'
      && (isDocument || isStaticAsset);
    if (!isAllowedSameOrigin) unexpectedRequests.push(`${request.method()} ${request.url()}`);
  }

  context.pages().forEach(observePage);
  context.on('page', observePage);
  context.on('request', observeRequest);

  return {
    unexpectedRequests,
    pageErrors,
    webSockets,
    async dispose() {
      context.off('page', observePage);
      context.off('request', observeRequest);
    }
  };
}

export const test = base.extend({
  context: async ({ baseURL, context }, use) => {
    const guard = await installNetworkGuard(context, baseURL);

    await use(context);

    await guard.dispose();
    expect(guard.unexpectedRequests, '静的ファイル以外のネットワーク要求で個人データを送信しないこと').toEqual([]);
    expect(guard.webSockets, 'WebSocket接続で個人データを送信しないこと').toEqual([]);
    expect(guard.pageErrors, 'ブラウザ実行中に未処理エラーがないこと').toEqual([]);
  }
});

export { expect } from '@playwright/test';

export async function openLocale(page, locale) {
  await page.goto(`/editor/?lang=${encodeURIComponent(locale)}`);
  await expect(page.locator('html')).toHaveAttribute('lang', locale === 'en' ? 'en' : locale);
  await expect(page.locator('#localeSelect')).toHaveValue(locale);
}

export async function readLocalePreference(page) {
  return page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw).locale : null;
  }, LOCALE_PREFERENCE_KEY);
}

export async function writeLocalePreference(page, locale) {
  await page.evaluate(({ key, value }) => {
    localStorage.setItem(key, JSON.stringify({ version: 1, locale: value }));
  }, { key: LOCALE_PREFERENCE_KEY, value: locale });
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
