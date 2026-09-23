import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

import { observeNetwork } from '../../scripts/network-contract.mjs';
import { exercisePrivacyCanary } from '../../scripts/privacy-canary-check.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const sourceSite = path.join(root, 'site');
const contentTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8']
]);

async function expectNoHorizontalOverflow(page) {
  await expect.poll(() => page.evaluate(() => (
    document.documentElement.scrollWidth <= window.innerWidth
  ))).toBe(true);
}

let sourceBaseURL;
let server;

test.beforeAll(async () => {
  server = createServer(async (request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
    const relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^\//, '').replace(/\/$/, '/index.html');
    const target = path.resolve(sourceSite, relativePath);
    if (target !== sourceSite && !target.startsWith(`${sourceSite}${path.sep}`)) {
      response.writeHead(403).end('Forbidden');
      return;
    }
    try {
      const metadata = await stat(target);
      if (!metadata.isFile()) throw new Error('Not a file');
      response.writeHead(200, {
        'Cache-Control': 'no-store',
        'Content-Type': contentTypes.get(path.extname(target)) || 'application/octet-stream'
      });
      createReadStream(target).pipe(response);
    } catch {
      response.writeHead(404).end('Not Found');
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  sourceBaseURL = `http://127.0.0.1:${server.address().port}`;
});

test.afterAll(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
});

test('source entry and editor explain the hosting boundary in all locales without app analytics state', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const network = observeNetwork(context, { baseUrl: sourceBaseURL });
  const entryPages = [
    ['ja', '', 'source、clone、fork'],
    ['zh-CN', 'zh-cn/', '本仓库的 source'],
    ['en', 'en/', 'Source, clone, and fork']
  ];
  try {
    for (const [locale, pathName, notice] of entryPages) {
      await page.goto(`${sourceBaseURL}/${pathName}`);
      const entryNotice = page.locator('.entry-trust-list [data-privacy-notice]');
      await expect(page.locator('html')).not.toHaveAttribute('data-analytics-mode', /.+/);
      await expect(page.locator('html')).not.toHaveAttribute('data-analytics-provider', /.+/);
      await expect(entryNotice).toContainText(notice);
      await expect(entryNotice).toContainText('Cloudflare Pages');
      await expect(entryNotice).toContainText(/Analytics request/);
      await expect(page.locator('[data-cf-beacon]')).toHaveCount(0);

      for (const width of [390, 320]) {
        await page.setViewportSize({ width, height: 844 });
        await expect(entryNotice).toBeVisible();
        await expectNoHorizontalOverflow(page);
      }
      await page.setViewportSize({ width: 1440, height: 1000 });

      await page.goto(`${sourceBaseURL}/editor/?lang=${encodeURIComponent(locale)}`);
      const editorNotice = page.locator('[data-privacy-notice]:visible');
      await expect(editorNotice).toHaveCount(1);
      await expect(page.locator('html')).toHaveAttribute('lang', locale);
      await expect(editorNotice).toContainText('Cloudflare Pages');
      await page.locator('#privacySecurityButton').click();
      await expect(page.locator('#privacySecurityUserBody')).toContainText('Cloudflare Pages');
      await expect(page.locator('#privacySecurityTechnicalBody')).toContainText(/delivery layer/i);
      await page.locator('#privacySecurityCloseButton').click();

      for (const width of [390, 320]) {
        await page.setViewportSize({ width, height: 844 });
        await expect(editorNotice).toBeVisible();
        await expectNoHorizontalOverflow(page);
        await page.locator('#privacySecurityButton').click();
        await expect(page.locator('#privacySecurityUserBody')).toContainText('Cloudflare Pages');
        await page.locator('#privacySecurityCloseButton').click();
      }
      await page.setViewportSize({ width: 1440, height: 1000 });
    }
    network.assertClean();
  } finally {
    network.dispose();
    await context.close();
  }
});

test('source editor keeps fictional resume canaries out of requests across reload and leave', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  const network = observeNetwork(context, { baseUrl: sourceBaseURL });
  try {
    await page.goto(`${sourceBaseURL}/editor/?lang=ja`);
    const { canaries } = await exercisePrivacyCanary(page, { leaveUrl: `${sourceBaseURL}/en/` });
    network.assertClean({ canaries });
  } finally {
    network.dispose();
    await context.close();
  }
});
