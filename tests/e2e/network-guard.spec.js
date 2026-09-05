import { expect, test } from '@playwright/test';
import { observeNetwork } from '../../scripts/network-contract.mjs';

test('source build は analytics を含むすべての外部 runtime request を拒否する', async ({ baseURL, context, page }) => {
  const guard = observeNetwork(context, { baseUrl: baseURL });
  await page.goto('/editor/');

  await page.evaluate(() => {
    fetch('http://127.0.0.1:9/leak').catch(() => {});
    fetch('/collect', { method: 'POST', body: 'fictional-network-guard-body' }).catch(() => {});
    fetch('/unknown-network-path').catch(() => {});
    fetch('/assets/js/main.js?personal-data').catch(() => {});
    fetch('https://cloudflareinsights.com/cdn-cgi/rum', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        location: `${window.location.href}?personal-data`,
        resume: 'personal-data',
        siteToken: 'a'.repeat(32)
      })
    }).catch(() => {});
    const socket = new WebSocket('ws://127.0.0.1:9/leak');
    socket.addEventListener('error', () => socket.close());
  });

  await expect.poll(() => guard.requests.some((request) => request.method === 'POST' && new URL(request.url).pathname === '/collect')).toBe(true);
  await expect.poll(() => guard.requests.some((request) => new URL(request.url).pathname === '/unknown-network-path')).toBe(true);
  await expect.poll(() => guard.requests.some((request) => request.url.includes('/assets/js/main.js?personal-data'))).toBe(true);
  await expect.poll(() => guard.requests.some((request) => request.url.includes('cloudflareinsights.com/cdn-cgi/rum'))).toBe(true);
  await expect.poll(() => guard.webSockets.length).toBeGreaterThan(0);
  expect(() => guard.assertClean({ canaries: ['fictional-network-guard-body'] }))
    .toThrow(/unexpected request \(GET external\).*resume canary appeared in a request URL or body.*WebSocket connection/);
  guard.dispose();
});
