import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { APP_VERSION, STORAGE_KEY } from '../../site/assets/js/config.js';
import { observeNetwork } from '../../scripts/network-contract.mjs';
import { expect, expectNoPageOverflow, test, waitForPersistedState } from './fixtures.js';

const siteRoot = path.resolve(fileURLToPath(new URL('../../site/', import.meta.url)));
const mimeTypes = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png' };

// Use a real HTTP cache, with no Playwright routes (routing disables that cache).
async function upgradeServer() {
  let upgraded = false;
  const requested = [];
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://localhost');
      const pathname = url.pathname.endsWith('/') ? `${url.pathname}index.html` : url.pathname;
      const file = path.resolve(siteRoot, `.${pathname}`);
      if (!file.startsWith(`${siteRoot}${path.sep}`)) throw new Error('outside site');
      let body = await readFile(file);
      const extension = path.extname(file);
      const runtime = ['.css', '.js'].includes(extension);
      if (runtime) requested.push({ upgraded, url: request.url });
      if (!upgraded && ['.html', '.js'].includes(extension)) {
        body = Buffer.from(body.toString().replaceAll(/\?v=\d+\.\d+\.\d+/g, '').replace(`APP_VERSION = '${APP_VERSION}'`, "APP_VERSION = '0.4.5'"));
      }
      if (!upgraded && pathname.endsWith('/base.css')) {
        // A recognizable stale rule models the duplicated PDF label in the report.
        body = Buffer.concat([body, Buffer.from('\n.print-short-label { display: inline !important; }\n')]);
      }
      response.writeHead(200, {
        'Content-Type': mimeTypes[extension] || 'application/octet-stream',
        'Cache-Control': runtime ? 'public, max-age=14400' : 'no-cache'
      });
      response.end(body);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    baseUrl: `http://127.0.0.1:${server.address().port}/`, requested,
    upgrade() { upgraded = true; },
    close() { return new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }); }
  };
}

for (const label of ['', '[webkit] ']) {
  test(`${label}ordinary reload upgrades cached styles and the module graph without losing the draft`, async ({ browser }) => {
    for (const locale of ['ja', 'zh-CN', 'en']) {
      const server = await upgradeServer();
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
      const network = observeNetwork(context, { baseUrl: server.baseUrl });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      try {
        await page.goto(`${server.baseUrl}editor/?lang=${locale}`);
        const name = page.locator(locale === 'ja' ? '[name="fullName"]' : locale === 'en' ? '[data-profile-field="fullName"]' : '[data-profile="fullName"]');
        await name.fill('Fictional Cached Draft');
        await waitForPersistedState(page, { profile: { fields: { fullName: 'Fictional Cached Draft' } } });
        await expect(page.locator('.print-short-label')).toBeVisible();
        const rawBefore = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY);
        expect(server.requested.some(({ url }) => url === '/assets/css/base.css')).toBe(true);
        expect(server.requested.some(({ url }) => url === '/assets/js/ui/locale-controller.js')).toBe(true);

        server.upgrade();
        await page.reload();
        await expect(name).toHaveValue('Fictional Cached Draft');
        await expect(page.locator('#privacySecurityVersion')).toHaveText(`v${APP_VERSION}`);
        expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBe(rawBefore);
        await expect(page.locator('.print-short-label')).toBeHidden();
        const currentRequests = server.requested.filter(({ upgraded }) => upgraded);
        expect(currentRequests.length).toBeGreaterThan(10);
        expect(currentRequests.every(({ url }) => new URL(url, server.baseUrl).search === `?v=${APP_VERSION}`)).toBe(true);
        await expect(page.locator('#exportMenuSummary svg')).toHaveCSS('width', '12px');
        await expect(page.locator('#exportMenuSummary svg')).toHaveCSS('height', '12px');
        const header = await page.locator('.app-header').boundingBox();
        const actions = await page.locator('.header-actions').boundingBox();
        const toolbar = await page.locator('.workspace:not([hidden]) .preview-toolbar').boundingBox();
        expect(actions.y).toBeGreaterThanOrEqual(header.y);
        expect(actions.y + actions.height).toBeLessThanOrEqual(header.y + header.height);
        expect(toolbar.y).toBeGreaterThanOrEqual(header.y + header.height);
        if (locale === 'ja') {
          const tabs = await page.locator('.document-switcher').boundingBox();
          expect(tabs.y + tabs.height).toBeLessThanOrEqual(header.y + header.height);
        }
        for (const width of [390, 320]) {
          await page.setViewportSize({ width, height: 844 });
          await expect(page.locator('.print-label')).toBeHidden();
          await expect(page.locator('.print-short-label')).toBeVisible();
          await expect(page.locator('#exportMenuSummary')).toHaveCSS('width', '44px');
          await expectNoPageOverflow(page);
        }
        expect(errors).toEqual([]);
        network.assertClean({ canaries: ['Fictional Cached Draft'] });
      } finally {
        network.dispose();
        await context.close();
        await server.close();
      }
    }
  });
}
