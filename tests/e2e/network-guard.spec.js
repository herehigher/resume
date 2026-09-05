import { expect, test } from '@playwright/test';
import { observeNetwork } from '../../scripts/network-contract.mjs';

const forbiddenCases = [
  {
    name: '外部 request',
    action: () => fetch('http://127.0.0.1:9/leak').catch(() => {}),
    matches: (request) => request.url === 'http://127.0.0.1:9/leak',
    expected: /unexpected request \(GET external\)/
  },
  {
    name: '同一 origin POST と本文',
    action: () => fetch('/collect', { method: 'POST', body: 'fictional-network-guard-body' }).catch(() => {}),
    canaries: ['fictional-network-guard-body'],
    matches: (request) => request.method === 'POST' && new URL(request.url).pathname === '/collect',
    expected: /unexpected request \(POST same-origin\).*resume canary appeared in a request URL or body/
  },
  {
    name: '未知の同一 origin path',
    action: () => fetch('/unknown-network-path').catch(() => {}),
    matches: (request) => new URL(request.url).pathname === '/unknown-network-path',
    expected: /unexpected request \(GET same-origin\)/
  },
  {
    name: '同一 origin query',
    action: () => fetch('/assets/js/main.js?personal-data').catch(() => {}),
    matches: (request) => request.url.includes('/assets/js/main.js?personal-data'),
    expected: /unexpected request \(GET same-origin\)/
  },
  {
    name: '外部 RUM POST',
    action: () => fetch('https://cloudflareinsights.com/cdn-cgi/rum', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ siteToken: 'a'.repeat(32) })
    }).catch(() => {}),
    matches: (request) => request.method === 'POST' && request.url === 'https://cloudflareinsights.com/cdn-cgi/rum',
    expected: /unexpected request \(POST external\)/
  },
  {
    name: 'WebSocket',
    action: () => {
      const socket = new WebSocket('ws://127.0.0.1:9/leak');
      socket.addEventListener('error', () => socket.close());
    },
    expected: /WebSocket connection/,
    webSocket: true
  }
];

for (const forbidden of forbiddenCases) {
  test(`source build は ${forbidden.name} を実ブラウザで拒否する`, async ({ baseURL, context, page }) => {
    const guard = observeNetwork(context, { baseUrl: baseURL });
    await page.goto('/editor/');
    await context.route('**/*', (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.origin !== new URL(baseURL).origin) return route.abort();
      if (request.method !== 'GET') return route.abort();
      return route.continue();
    });
    await page.evaluate(forbidden.action);
    if (forbidden.webSocket) {
      await expect.poll(() => guard.webSockets.length).toBeGreaterThan(0);
    } else {
      await expect.poll(() => guard.requests.some(forbidden.matches)).toBe(true);
    }
    expect(() => guard.assertClean({ canaries: forbidden.canaries })).toThrow(forbidden.expected);
    guard.dispose();
  });
}
