import assert from 'node:assert/strict';
import { createReadStream } from 'node:fs';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from '@playwright/test';

import {
  CLOUDFLARE_BEACON_URL,
  CLOUDFLARE_RUM_URL,
  cloudflareAnalyticsScriptTags,
  isAllowedCloudflareAnalyticsRequest
} from './cloudflare-analytics.mjs';

const tokenPattern = /^[0-9a-f]{32}$/;
const contentTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8']
]);

function configuredToken(html) {
  const tags = html.match(/<script\b[^>]*\bdata-cf-beacon\s*=\s*(["']).*?\1[^>]*><\/script>/gis) || [];
  for (const tag of tags) {
    const configuration = tag.match(/\bdata-cf-beacon\s*=\s*(["'])(.*?)\1/is)?.[2]?.replaceAll('&quot;', '"');
    try {
      const token = JSON.parse(configuration || '').token;
      if (tokenPattern.test(token || '') && cloudflareAnalyticsScriptTags(html, token).length === 1) return token;
    } catch {
      // The artifact validator reports malformed beacon markup separately.
    }
  }
  return null;
}

function staticServer(directory) {
  const server = createServer(async (request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
    const relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^\//, '').replace(/\/$/, '/index.html');
    const target = path.resolve(directory, relativePath);
    if (!target.startsWith(`${directory}${path.sep}`)) {
      response.writeHead(403).end('Forbidden');
      return;
    }
    try {
      if (!(await stat(target)).isFile()) throw new Error('Not a file');
      response.setHeader('Content-Type', contentTypes.get(path.extname(target)) || 'application/octet-stream');
      createReadStream(target).pipe(response);
    } catch {
      response.writeHead(404).end('Not Found');
    }
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function requestPayload(request) {
  try {
    const payload = JSON.parse(request.postData || '');
    return payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : null;
  } catch {
    return null;
  }
}

function hasRequiredRUMLifecycle(requests) {
  const eventTypes = new Set(requests.map(requestPayload).filter(Boolean).map((payload) => payload.eventType));
  return requests.length >= 3 && eventTypes.has(1) && eventTypes.has(3);
}

function lifecycleObservation(requests) {
  const eventTypes = [...new Set(requests.map(requestPayload).filter(Boolean).map((payload) => payload.eventType))].sort();
  return `requests: ${requests.length}; event types: ${eventTypes.join(',') || 'none'}`;
}

function rumContractObservation(requests) {
  const payloads = requests.map(requestPayload).filter(Boolean);
  const eventTypes = [...new Set(payloads.map((payload) => payload.eventType))].sort();
  const fieldNames = [...new Set(payloads.flatMap((payload) => Object.keys(payload)))].sort();
  return `RUM event types: ${eventTypes.join(',') || 'none'}; fields: ${fieldNames.join(',') || 'none'}`;
}

async function waitForRUMLifecycle(requests) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (hasRequiredRUMLifecycle(requests)) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`The live beacon did not produce the required load and Web Vitals lifecycle requests (${lifecycleObservation(requests)}).`);
}

async function waitForRUMEventType(requests, eventType) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (requests.map(requestPayload).some((payload) => payload?.eventType === eventType)) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`The live beacon did not emit event type ${eventType}.`);
}

export function summarizeCloudflareAnalyticsCompatibility({
  beaconStatus,
  expectedOrigin,
  expectedToken,
  requests,
  unexpectedRequests = [],
  webSocketCount = 0,
  beaconConfigurationLoaded = true,
  pageErrorCount = 0,
  minimumRumRequestCount = 1,
  simulatedHiddenPerformanceCount = 0
}) {
  assert.ok(beaconStatus >= 200 && beaconStatus < 300, 'The live Cloudflare beacon did not load successfully.');
  assert.equal(unexpectedRequests.length, 0, 'The live beacon made an unexpected external request.');
  assert.equal(webSocketCount, 0, 'The live beacon opened a WebSocket.');
  assert.equal(pageErrorCount, 0, 'The live beacon generated a page error.');
  assert.ok(requests.length >= minimumRumRequestCount,
    `The live beacon made fewer RUM requests than the observed lifecycle requires (configuration: ${beaconConfigurationLoaded ? 'loaded' : 'missing'}; page errors: ${pageErrorCount}).`);
  assert.equal(requests.every((request) => isAllowedCloudflareAnalyticsRequest({
    expectedOrigin,
    expectedToken,
    ...request
  })), true, 'A live beacon RUM request did not satisfy the privacy contract.');
  const payloads = requests.map(requestPayload).filter(Boolean);
  const pageLoadIds = new Set(payloads.filter((payload) => payload.eventType === 1)
    .map((payload) => payload.pageloadId).filter((value) => typeof value === 'string'));
  assert.ok(pageLoadIds.size >= 2, 'The live lifecycle did not create distinct page-load identifiers.');
  assert.equal(payloads.some((payload) => Object.hasOwn(payload, 'bi')), true,
    'The live beacon did not include the documented browser-information field.');
  return Object.freeze({
    beacon: Object.freeze({ status: beaconStatus, transport: 'loaded-from-provider' }),
    observationScope: 'editor-input-photo-import-reload-leave-and-page-hidden-on-loopback',
    lifecycle: Object.freeze({
      nativePageViewCount: payloads.filter((payload) => payload.eventType === 1).length,
      simulatedHiddenPerformanceCount
    }),
    providerReceipt: 'not-checked-rum-intercepted',
    rum: Object.freeze({
      biObserved: true,
      eventTypes: Object.freeze([...new Set(payloads.map((payload) => payload.eventType))].sort()),
      fieldNames: Object.freeze([...new Set(payloads.flatMap((payload) => Object.keys(payload)))].sort()),
      pageLoadIdCount: pageLoadIds.size,
      requestCount: requests.length,
      transport: 'intercepted-contract-compliant'
    }),
    schemaVersion: 1
  });
}

export async function checkCloudflareAnalyticsCompatibility(directory) {
  const absoluteDirectory = path.resolve(directory);
  const token = configuredToken(await readFile(path.join(absoluteDirectory, 'index.html'), 'utf8'));
  assert.ok(token, 'The prepared artifact must contain one valid Cloudflare beacon configuration.');

  const server = await staticServer(absoluteDirectory);
  const origin = `http://127.0.0.1:${server.address().port}`;
  let browser;
  let context;
  let network;
  const requests = [];
  const unexpectedRequests = [];
  let webSocketCount = 0;
  let pageErrorCount = 0;
  let phase = 'starting-browser';
  try {
    const [{ observeNetwork }, { exercisePrivacyCanary }] = await Promise.all([
      import('./network-contract.mjs'),
      import('./privacy-canary-check.mjs')
    ]);
    browser = await chromium.launch();
    context = await browser.newContext({ serviceWorkers: 'block' });
    context.setDefaultNavigationTimeout(10_000);
    context.setDefaultTimeout(10_000);
    const rumEndpoint = new URL(CLOUDFLARE_RUM_URL);
    await context.route('**/*', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.origin === origin || url.href === CLOUDFLARE_BEACON_URL) {
        await route.continue();
        return;
      }
      if (url.origin === rumEndpoint.origin) {
        requests.push({
          headers: request.headers(),
          method: request.method(),
          postData: request.postData(),
          resourceType: request.resourceType(),
          url: request.url()
        });
        await route.fulfill({ status: 204 });
        return;
      }
      unexpectedRequests.push({ method: request.method(), target: `${url.origin}${url.pathname}${url.search ? '?…' : ''}` });
      await route.abort();
    });
    network = observeNetwork(context, { baseUrl: `${origin}/`, expectedToken: token });
    const page = await context.newPage();
    page.on('websocket', () => { webSocketCount += 1; });
    page.on('pageerror', () => { pageErrorCount += 1; });
    const beaconResponse = page.waitForResponse((response) => response.url() === CLOUDFLARE_BEACON_URL);
    phase = 'loading-editor';
    const response = await page.goto(`${origin}/editor/?lang=ja`, { waitUntil: 'load' });
    assert.equal(response?.status(), 200, 'The prepared artifact editor did not load.');
    assert.equal(await page.locator('#localeSelect').inputValue(), 'ja', 'The provider check must use the Japanese editor lifecycle.');
    const beacon = await beaconResponse;
    phase = 'exercising-fictional-canary';
    let simulatedHiddenPerformanceCount = 0;
    const canary = await exercisePrivacyCanary(page, {
      beforeReload: async (editorPage) => {
        const requestCountBeforeHidden = requests.length;
        phase = 'simulating-page-hidden-lifecycle';
        await editorPage.evaluate(() => {
          Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
          document.dispatchEvent(new Event('visibilitychange'));
          delete document.visibilityState;
        });
        await waitForRUMEventType(requests, 3);
        simulatedHiddenPerformanceCount = requests.slice(requestCountBeforeHidden)
          .map(requestPayload).filter((payload) => payload?.eventType === 3).length;
      },
      leaveUrl: `${origin}/`
    });
    const beaconConfigurationLoaded = await page.evaluate(() => Boolean(window.__cfBeacon?.token));
    phase = 'waiting-for-rum-lifecycle';
    await waitForRUMLifecycle(requests);
    phase = 'validating-network-contract';
    try {
      network.assertClean({ canaries: canary.canaries });
    } catch (error) {
      throw new Error(`${error.message}; ${rumContractObservation(requests)}.`);
    }
    await page.close();
    const summary = summarizeCloudflareAnalyticsCompatibility({
      beaconStatus: beacon.status(),
      expectedOrigin: origin,
      expectedToken: token,
      requests,
      unexpectedRequests,
      webSocketCount,
      beaconConfigurationLoaded,
      minimumRumRequestCount: 3,
      simulatedHiddenPerformanceCount,
      pageErrorCount
    });
    return summary;
  } catch (error) {
    throw new Error(`Cloudflare provider compatibility failed during ${phase}: ${error.message}`);
  } finally {
    network?.dispose();
    await context?.close();
    await browser?.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

async function main() {
  const [directoryFlag, directory, outputFlag, output] = process.argv.slice(2);
  if (directoryFlag !== '--directory' || !directory || outputFlag !== '--output' || !output || process.argv.length !== 6) {
    throw new Error('Usage: check-cloudflare-analytics-compatibility.mjs --directory ARTIFACT_DIRECTORY --output EVIDENCE_JSON');
  }
  const result = await checkCloudflareAnalyticsCompatibility(directory);
  await writeFile(output, `${JSON.stringify(result)}\n`);
  console.log(JSON.stringify(result));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
