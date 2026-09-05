import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';

import { CLOUDFLARE_BEACON_URL } from './cloudflare-analytics.mjs';
import { DEPLOYMENT_PATH_CONTRACTS } from './deployment-path-contract.mjs';
import { observeNetwork } from './network-contract.mjs';

export async function checkOnlineEditor(baseUrl) {
  const base = new URL(baseUrl);
  const local = ['127.0.0.1', 'localhost'].includes(base.hostname);
  assert.ok((base.protocol === 'https:' || (local && base.protocol === 'http:'))
    && !base.username && !base.password && !base.search && !base.hash && base.pathname.endsWith('/'),
  'Use an HTTPS site URL ending in / (HTTP loopback is allowed for local tests).');
  const browser = await chromium.launch();
  const pageErrors = [];
  const context = await browser.newContext({ serviceWorkers: 'block' });
  // A valid placeholder permits only the fixed beacon GET while routes below block every external request.
  const network = observeNetwork(context, { baseUrl, expectedToken: 'a'.repeat(32) });
  try {
    // Third-party runtime is blocked; this checks the editor, not the live RUM provider.
    await context.route('**/*', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.origin !== base.origin) {
        await route.abort();
        return;
      }
      await route.continue();
    });
    const examplePath = DEPLOYMENT_PATH_CONTRACTS.find((item) => item.semantic === 'import-example').urlPath;
    const response = await context.request.get(new URL(examplePath, base).href);
    assert.equal(response.status(), 200, 'Published example must be available.');
    const example = await response.json();
    assert.equal(example.version, 1);
    // Use a known fictional canary regardless of the served example's profile.
    example.profile = {
      photo: '',
      fields: { fullName: 'Fictional Online Check', birthDate: '', gender: '', postalCode: '',
        address: '', phone: '', email: 'online-check@example.invalid', links: [] }
    };
    for (const [locale, preview] of [
      ['ja', '#documentPreview'], ['zh-CN', '[data-zh-preview]'], ['en', '[data-en-preview]']
    ]) {
      const page = await context.newPage();
      page.on('pageerror', () => pageErrors.push(`${locale}: page error`));
      const result = await page.goto(new URL(`editor/?lang=${locale}`, base).href);
      assert.equal(result.status(), 200, `${locale}: editor response`);
      await expect(page.locator('#localeSelect')).toHaveValue(locale);
      await expect(page.locator('html')).toHaveAttribute('lang', locale);
      const beacon = page.locator(`script[src="${CLOUDFLARE_BEACON_URL}"]`);
      const count = await beacon.count();
      if (count === 1) {
        const configuration = JSON.parse(await beacon.getAttribute('data-cf-beacon') || '');
        assert.match(configuration.token || '', /^[0-9a-f]{32}$/, `${locale}: analytics beacon configuration`);
      } else {
        assert.equal(count, 0, `${locale}: analytics beacon must not be duplicated`);
      }
      await page.locator('#importDataInput').setInputFiles({
        name: 'fictional-online-check.json', mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify(example))
      });
      await expect(page.locator(preview)).toContainText('Fictional Online Check');
      await expect(page.locator('#localeSelect')).toHaveValue(locale);
      await page.close();
    }
    assert.deepEqual(pageErrors, [], 'Editor must execute without page errors.');
    network.assertClean();
    console.log('Editor smoke passed: ja, zh-CN, en and public example import. Third-party scripts blocked; live RUM receipt and human acceptance unverified.');
  } finally {
    network.dispose();
    await context.close();
    await browser.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 4 || process.argv[2] !== '--base-url') {
    console.error('Usage: check-online-editor.mjs --base-url URL');
    process.exitCode = 1;
  } else {
    checkOnlineEditor(process.argv[3]).catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
  }
}
