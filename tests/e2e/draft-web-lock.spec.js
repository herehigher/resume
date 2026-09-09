import { DRAFT_STORAGE_KEY, expect, openLocale, test } from './fixtures.js';

const DRAFT_LOCK_NAME = 'resume-studio-web-v1:draft';

async function resetDraft(page) {
  await page.evaluate(async (draftKey) => {
    localStorage.removeItem(draftKey);
    await new Promise((resolve, reject) => {
      const request = indexedDB.deleteDatabase('resume-studio-web-v1-keys');
      request.onsuccess = resolve;
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('The test key database is still open.'));
    });
  }, DRAFT_STORAGE_KEY);
}

async function createStorageHarness(page, name) {
  await page.evaluate(async (storageName) => {
    const { createDefaultState } = await import('/assets/js/state/defaults.js');
    const { createDraftStorage } = await import('/assets/js/state/storage.js');
    window[storageName] = {
      storage: createDraftStorage(localStorage),
      state(fullName) {
        const state = createDefaultState('en');
        state.profile.fields.fullName = fullName;
        return state;
      }
    };
  }, name);
}

async function observeLockRequests(page) {
  await page.evaluate((lockName) => {
    const request = navigator.locks.request.bind(navigator.locks);
    window.__draftLockRequestCount = 0;
    Object.defineProperty(navigator.locks, 'request', {
      configurable: true,
      value(...args) {
        if (args[0] === lockName) window.__draftLockRequestCount += 1;
        return request(...args);
      }
    });
  }, DRAFT_LOCK_NAME);
}

async function holdDraftLock(page) {
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
}

async function releaseDraftLock(page) {
  await page.evaluate(() => window.__draftLockGate.unlock());
  await page.evaluate(() => window.__draftLockHold);
}

async function queueStorageOperation(page, storageName, operation, fullName = '') {
  await page.evaluate(({ name, action, value }) => {
    const harness = window[name];
    const request = action === 'save'
      ? harness.storage.save(harness.state(value))
      : harness.storage[action]();
    window.__draftStorageResult = request.then(
      (result) => ({ ok: true, result }),
      (error) => ({ ok: false, code: error.code })
    );
  }, { name: storageName, action: operation, value: fullName });
}

async function storageOperationResult(page) {
  return page.evaluate(() => window.__draftStorageResult);
}

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

test('同一 context の migration と stale save は lock 内で順序付けられ、移行結果を保護する', async ({ context, page }) => {
  await openLocale(page, 'en');
  const savingPage = await context.newPage();
  await openLocale(savingPage, 'en');
  await resetDraft(page);
  await createStorageHarness(savingPage, '__savingStorage');
  await savingPage.evaluate(async () => window.__savingStorage.storage.load());
  await savingPage.evaluate(() => {
    const state = window.__savingStorage.state('Bootstrap migration fixture');
    delete state.schemaRevision;
    localStorage.setItem('resume-studio-web-v1', JSON.stringify(state));
  });
  await createStorageHarness(page, '__migrationStorage');
  await observeLockRequests(page);
  await observeLockRequests(savingPage);
  await holdDraftLock(page);

  await queueStorageOperation(page, '__migrationStorage', 'load');
  await queueStorageOperation(savingPage, '__savingStorage', 'save', 'Stale save during migration');
  await savingPage.waitForFunction(() => window.__draftLockRequestCount === 1);
  await releaseDraftLock(page);

  const migration = await storageOperationResult(page);
  const staleSave = await storageOperationResult(savingPage);
  expect(migration).toMatchObject({ ok: true, result: { schemaRevision: 1 } });
  expect(staleSave).toEqual({ ok: false, code: 'storage-changed' });
  await expect.poll(() => page.evaluate((key) => JSON.parse(localStorage.getItem(key)).format, DRAFT_STORAGE_KEY)).toBe('resume-studio-local-encrypted-v1');
  await savingPage.close();
});

test('同一 context の初回 key generation は一方だけが commit する', async ({ context, page }) => {
  await openLocale(page, 'en');
  const secondPage = await context.newPage();
  await openLocale(secondPage, 'en');
  await resetDraft(page);
  await createStorageHarness(page, '__firstStorage');
  await createStorageHarness(secondPage, '__secondStorage');
  await observeLockRequests(page);
  await observeLockRequests(secondPage);
  await holdDraftLock(page);

  await queueStorageOperation(page, '__firstStorage', 'save', 'First key generation');
  await queueStorageOperation(secondPage, '__secondStorage', 'save', 'Second key generation');
  await secondPage.waitForFunction(() => window.__draftLockRequestCount === 1);
  await releaseDraftLock(page);

  expect(await storageOperationResult(page)).toMatchObject({ ok: true });
  expect(await storageOperationResult(secondPage)).toEqual({ ok: false, code: 'storage-changed' });
  await expect.poll(() => page.evaluate((key) => Boolean(localStorage.getItem(key)), DRAFT_STORAGE_KEY)).toBe(true);
  await secondPage.close();
});

test('同一 context の stale clear は新しい save を削除しない', async ({ context, page }) => {
  await openLocale(page, 'en');
  const clearingPage = await context.newPage();
  await openLocale(clearingPage, 'en');
  await resetDraft(page);
  await createStorageHarness(page, '__writerStorage');
  await createStorageHarness(clearingPage, '__clearStorage');
  await queueStorageOperation(page, '__writerStorage', 'save', 'Initial clear fixture');
  expect(await storageOperationResult(page)).toMatchObject({ ok: true });
  await clearingPage.evaluate(async () => window.__clearStorage.storage.load());
  await observeLockRequests(page);
  await observeLockRequests(clearingPage);
  await holdDraftLock(page);

  await queueStorageOperation(page, '__writerStorage', 'save', 'Newest clear fixture');
  await queueStorageOperation(clearingPage, '__clearStorage', 'remove');
  await clearingPage.waitForFunction(() => window.__draftLockRequestCount === 1);
  await releaseDraftLock(page);

  expect(await storageOperationResult(page)).toMatchObject({ ok: true });
  expect(await storageOperationResult(clearingPage)).toEqual({ ok: false, code: 'storage-changed' });
  const reloaded = await page.evaluate(async () => window.__writerStorage.storage.load());
  expect(reloaded.profile.fields.fullName).toBe('Newest clear fixture');
  await clearingPage.close();
});

test('同一 context の recovery は後続 save と lock 内で直列化される', async ({ context, page }) => {
  await openLocale(page, 'en');
  const savingPage = await context.newPage();
  await openLocale(savingPage, 'en');
  await resetDraft(page);
  await createStorageHarness(page, '__recoveryStorage');
  await createStorageHarness(savingPage, '__recoverySaveStorage');
  await savingPage.evaluate(async () => window.__recoverySaveStorage.storage.load());
  await page.evaluate((key) => localStorage.setItem(key, '{not-json'), DRAFT_STORAGE_KEY);
  await observeLockRequests(page);
  await observeLockRequests(savingPage);
  await holdDraftLock(page);

  await queueStorageOperation(page, '__recoveryStorage', 'loadAndRecoverUnreadableDraft');
  await queueStorageOperation(savingPage, '__recoverySaveStorage', 'save', 'Save after recovery');
  await savingPage.waitForFunction(() => window.__draftLockRequestCount === 1);
  await releaseDraftLock(page);

  expect(await storageOperationResult(page)).toEqual({ ok: true, result: { state: null, recovered: true } });
  expect(await storageOperationResult(savingPage)).toMatchObject({ ok: true });
  const reloaded = await page.evaluate(async () => window.__recoveryStorage.storage.load());
  expect(reloaded.profile.fields.fullName).toBe('Save after recovery');
  await savingPage.close();
});
