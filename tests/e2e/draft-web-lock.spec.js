import { DRAFT_STORAGE_KEY, expect, openLocale, test } from './fixtures.js';

const DRAFT_LOCK_NAME = 'resume-studio-web-v1:draft';

test('同一 context の古い page は新しい encrypted draft を上書きできない', async ({ context, page }) => {
  await openLocale(page, 'en');
  const firstName = page.locator('[data-english-editor] [data-profile-field="fullName"]');
  await firstName.fill('Initial lock fixture');
  await expect(page.locator('[data-en-save-status]')).toHaveText('Encrypted and saved on this device.');
  const initialRaw = await page.evaluate((key) => localStorage.getItem(key), DRAFT_STORAGE_KEY);

  const stalePage = await context.newPage();
  await stalePage.addInitScript((lockName) => {
    const request = navigator.locks.request.bind(navigator.locks);
    Object.defineProperty(navigator.locks, 'request', {
      configurable: true,
      value(...args) {
        if (args[0] === lockName) window.__draftLockRequestObserved = true;
        return request(...args);
      }
    });
  }, DRAFT_LOCK_NAME);
  await openLocale(stalePage, 'en');
  await expect(stalePage.locator('[data-english-editor] [data-profile-field="fullName"]')).toHaveValue('Initial lock fixture');

  await firstName.fill('Newest lock fixture');
  await expect(page.locator('[data-en-save-status]')).toHaveText('Encrypted and saved on this device.');
  const newestRaw = await page.evaluate((key) => localStorage.getItem(key), DRAFT_STORAGE_KEY);
  expect(newestRaw).not.toBe(initialRaw);

  await page.evaluate((lockName) => {
    let release;
    window.__draftLockGate = {
      acquired: new Promise((resolve) => { window.__draftLockAcquired = resolve; }),
      release: new Promise((resolve) => { release = resolve; }),
      unlock: () => release()
    };
    window.__draftLockHold = navigator.locks.request(lockName, async () => {
      window.__draftLockAcquired();
      await window.__draftLockGate.release;
    });
  }, DRAFT_LOCK_NAME);
  await page.evaluate(() => window.__draftLockGate.acquired);

  await stalePage.locator('[data-english-editor] [data-profile-field="fullName"]').fill('Stale lock fixture');
  await stalePage.waitForFunction(() => window.__draftLockRequestObserved === true);
  await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), DRAFT_STORAGE_KEY)).toBe(newestRaw);
  await page.evaluate(() => window.__draftLockGate.unlock());
  await page.evaluate(() => window.__draftLockHold);
  await expect(stalePage.locator('[data-en-save-status]')).toHaveClass(/is-error/);
  await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), DRAFT_STORAGE_KEY)).toBe(newestRaw);
  await stalePage.close();
});
