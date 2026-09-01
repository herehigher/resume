import { expect, test } from '@playwright/test';
import { installNetworkGuard } from './fixtures.js';

test('ネットワークガードは標準 Cloudflare Analytics だけを許可する', async ({ baseURL, context, page }) => {
  const guard = await installNetworkGuard(context, baseURL);
  await page.goto('/');

  await expect.poll(() => guard.analyticsRequests).toContain('GET https://static.cloudflareinsights.com/beacon.min.js');
  await expect.poll(() => guard.analyticsRequests).toContain('POST https://cloudflareinsights.com/cdn-cgi/rum');
  expect(guard.unexpectedRequests).toEqual([]);

  await page.evaluate(() => {
    fetch('http://127.0.0.1:9/leak').catch(() => {});
    fetch('/collect', { method: 'POST', body: 'personal-data' }).catch(() => {});
    fetch('/assets/js/main.js?personal-data').catch(() => {});
    fetch('https://cloudflareinsights.com/cdn-cgi/rum', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        location: `${window.location.href}?personal-data`,
        resume: 'personal-data',
        siteToken: '0b02ba35d9bc4d4d8dd63b42d6d51241'
      })
    }).catch(() => {});
    const socket = new WebSocket('ws://127.0.0.1:9/leak');
    socket.addEventListener('error', () => socket.close());
  });

  await expect.poll(() => guard.unexpectedRequests).toContain('GET http://127.0.0.1:9/leak');
  await expect.poll(() => guard.unexpectedRequests).toContain(`POST ${baseURL}/collect`);
  await expect.poll(() => guard.unexpectedRequests).toContain(`GET ${baseURL}/assets/js/main.js?personal-data`);
  await expect.poll(() => guard.unexpectedRequests).toContain('POST https://cloudflareinsights.com/cdn-cgi/rum');
  await expect.poll(() => guard.webSockets).toContain('ws://127.0.0.1:9/leak');
  await guard.dispose();
});
