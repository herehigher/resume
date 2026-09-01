import { expect, test } from '@playwright/test';
import { installNetworkGuard } from './fixtures.js';

test('ネットワークガードは外部HTTPとWebSocketを検出する', async ({ baseURL, context, page }) => {
  const guard = installNetworkGuard(context, baseURL);
  await page.goto('/');

  await page.evaluate(() => {
    fetch('http://127.0.0.1:9/leak').catch(() => {});
    const socket = new WebSocket('ws://127.0.0.1:9/leak');
    socket.addEventListener('error', () => socket.close());
  });

  await expect.poll(() => guard.externalRequests).toContain('GET http://127.0.0.1:9/leak');
  await expect.poll(() => guard.webSockets).toContain('ws://127.0.0.1:9/leak');
  guard.dispose();
});
