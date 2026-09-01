import { createReadStream, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

import {
  CLOUDFLARE_BEACON_URL,
  CLOUDFLARE_RUM_URL,
  cloudflareAnalyticsMockScript
} from '../../scripts/cloudflare-analytics.mjs';
import {
  CLOUDFLARE_PROVIDER,
  OFFICIAL_REPOSITORY,
  computeTreeDigest,
  deriveCloudflareArtifact,
  prepareArtifact
} from '../../scripts/prepare-pages-artifact.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const sourceSite = path.join(root, 'site');
const token = 'b'.repeat(32);
const contentTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8']
]);

let enabledBaseURL;
let server;
let temporary;

test.beforeAll(async () => {
  temporary = mkdtempSync(path.join(os.tmpdir(), 'resume-enabled-pages-'));
  const output = path.join(temporary, 'site');
  const derived = await deriveCloudflareArtifact({ sourceDirectory: sourceSite, token });
  const manifestPath = path.join(temporary, 'manifest.json');
  writeFileSync(manifestPath, `${JSON.stringify({
    analyticsMode: 'enabled',
    analyticsProvider: CLOUDFLARE_PROVIDER,
    artifactTreeSha256: derived.final_digest,
    providerTokenSha256: derived.provider_fingerprint,
    schemaVersion: 1,
    sourceTreeSha256: await computeTreeDigest(sourceSite)
  })}\n`);
  await prepareArtifact({
    manifestPath,
    outputDirectory: output,
    repository: OFFICIAL_REPOSITORY,
    sourceDirectory: sourceSite,
    token
  });

  server = createServer(async (request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
    const relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^\//, '').replace(/\/$/, '/index.html');
    const target = path.resolve(output, relativePath);
    if (target !== output && !target.startsWith(`${output}${path.sep}`)) {
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
  enabledBaseURL = `http://127.0.0.1:${server.address().port}`;
});

test.afterAll(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (temporary) rmSync(temporary, { force: true, recursive: true });
});

test('enabled artifact exposes fixed status and only the standard analytics requests', async ({ context, page }) => {
  const requests = [];
  const pageErrors = [];
  const webSockets = [];
  const enabledOrigin = new URL(enabledBaseURL).origin;
  context.on('request', (request) => {
    const url = new URL(request.url());
    if (['http:', 'https:'].includes(url.protocol) && url.origin !== enabledOrigin) {
      requests.push(`${request.method()} ${request.url()}`);
    }
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('websocket', (socket) => webSockets.push(socket.url()));
  await context.route(CLOUDFLARE_BEACON_URL, (route) => route.fulfill({
    body: cloudflareAnalyticsMockScript(token),
    contentType: 'text/javascript; charset=utf-8',
    status: 200
  }));
  await context.route(CLOUDFLARE_RUM_URL, (route) => route.fulfill({ status: 204 }));

  await page.goto(enabledBaseURL);
  await expect(page.locator('html')).toHaveAttribute('data-analytics-mode', 'enabled');
  await expect(page.locator('html')).toHaveAttribute('data-analytics-provider', CLOUDFLARE_PROVIDER);
  await expect(page.locator('[data-analytics-disclosure="status"]')).toContainText('公式 release');
  const beacon = page.locator(`script[src="${CLOUDFLARE_BEACON_URL}"]`);
  await expect(beacon).toHaveCount(1);
  await expect(beacon).toHaveAttribute('data-cf-beacon', JSON.stringify({ token }));
  await expect.poll(() => requests).toContain(`GET ${CLOUDFLARE_BEACON_URL}`);
  await expect.poll(() => requests).toContain(`POST ${CLOUDFLARE_RUM_URL}`);
  expect(requests).toHaveLength(2);
  expect(webSockets).toEqual([]);
  expect(pageErrors).toEqual([]);

  await page.locator('#privacySecurityButton').click();
  await expect(page.locator('#privacySecurityUserBody')).toContainText('Cloudflare Web Analytics');
  await expect(page.locator('#privacySecurityTechnicalBody')).toContainText('標準 RUM endpoint');
});

test('enabled no-JavaScript entry preserves the tagged disclosure and beacon markup', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    await page.goto(`${enabledBaseURL}/en/`);
    await expect(page.locator('html')).toHaveAttribute('data-analytics-mode', 'enabled');
    await expect(page.locator('[data-analytics-disclosure="status"]')).toContainText('official release');
    await expect(page.locator(`script[src="${CLOUDFLARE_BEACON_URL}"]`)).toHaveCount(1);
  } finally {
    await context.close();
  }
});
