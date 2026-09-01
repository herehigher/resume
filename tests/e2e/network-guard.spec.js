import { expect, test } from '@playwright/test';
import { installNetworkGuard } from './fixtures.js';

test('ネットワークガードは外部通信と同一オリジンのデータ送信を検出する', async ({ baseURL, context, page }) => {
  const guard = installNetworkGuard(context, baseURL);
  await page.goto('/');

  await page.evaluate(() => {
    fetch('http://127.0.0.1:9/leak').catch(() => {});
    fetch('/collect', { method: 'POST', body: 'personal-data' }).catch(() => {});
    fetch('/assets/js/main.js?personal-data').catch(() => {});
    const socket = new WebSocket('ws://127.0.0.1:9/leak');
    socket.addEventListener('error', () => socket.close());
  });

  await expect.poll(() => guard.unexpectedRequests).toContain('GET http://127.0.0.1:9/leak');
  await expect.poll(() => guard.unexpectedRequests).toContain(`POST ${baseURL}/collect`);
  await expect.poll(() => guard.unexpectedRequests).toContain(`GET ${baseURL}/assets/js/main.js?personal-data`);
  await expect.poll(() => guard.webSockets).toContain('ws://127.0.0.1:9/leak');
  guard.dispose();
});
