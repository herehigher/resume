import { expect, test } from '@playwright/test';

const STORAGE_KEY = 'resume-studio-web-v1';
const KEY_DATABASE = 'resume-studio-web-v1-keys';
const KEY_STORE = 'keys';
const KEY_ID = 'draft-encryption-key';
const encryptedDraft = JSON.stringify({
  format: 'resume-studio-local-encrypted-v1',
  algorithm: 'AES-GCM',
  nonce: 'AAAAAAAAAAAAAAAA',
  ciphertext: 'AAAAAAAAAAAAAAAAAAAAAA=='
});
const cases = [
  {
    locale: 'ja',
    message: 'このページでは下書きを安全に保存できません。https://、http://localhost、または http://127.0.0.1 で開き直してください。保存済みデータは変更していません。',
    privacyBody: 'このページでは安全な下書き保存を利用できません。',
    save: '#saveDraftButton',
    reload: '#reloadDraftButton',
    sample: '#loadSampleButton',
    status: '#saveStatus',
    nextLocale: 'zh-CN'
  },
  {
    locale: 'zh-CN',
    message: '此页面无法安全保存草稿。请使用 https://、http://localhost 或 http://127.0.0.1 重新打开。已保存的数据未被修改。',
    privacyBody: '此页面无法使用安全草稿存储',
    save: '[data-zh-action="save"]',
    reload: '[data-zh-action="reload"]',
    sample: '[data-zh-action="sample"]',
    status: '[data-zh-draft-message]',
    nextLocale: 'en'
  },
  {
    locale: 'en',
    message: 'This page cannot save drafts securely. Reopen it with https://, http://localhost, or http://127.0.0.1. Saved data was not changed.',
    privacyBody: 'Secure draft storage is unavailable on this page',
    save: '[data-en-save]',
    reload: '[data-en-reload]',
    sample: '[data-en-load-sample]',
    status: '[data-en-save-status]',
    nextLocale: 'ja'
  }
];

async function readKey(page) {
  return page.evaluate(async ({ database, store, key }) => {
    const request = indexedDB.open(database, 1);
    const db = await new Promise((resolve, reject) => {
      request.onupgradeneeded = () => request.result.createObjectStore(store);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const value = await new Promise((resolve, reject) => {
      const get = db.transaction(store, 'readonly').objectStore(store).get(key);
      get.onsuccess = () => resolve(get.result);
      get.onerror = () => reject(get.error);
    });
    db.close();
    return value;
  }, { database: KEY_DATABASE, store: KEY_STORE, key: KEY_ID });
}

test('non-secure HTTP origin keeps encrypted drafts untouched and gives actionable guidance', async ({ page }) => {
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), {
    key: STORAGE_KEY,
    value: encryptedDraft
  });

  for (const scenario of cases) {
    await page.goto(`http://0.0.0.0:4184/?lang=${encodeURIComponent(scenario.locale)}`);
    await expect.poll(() => page.evaluate(() => ({
      secure: isSecureContext,
      subtle: Boolean(globalThis.crypto?.subtle)
    }))).toEqual({ secure: false, subtle: false });
    await expect(page.locator('#globalMessage')).toHaveText(scenario.message);
    await expect(page.locator(scenario.reload)).toBeEnabled();
    await page.locator('#privacySecurityButton').click();
    await expect(page.locator('#privacySecurityStorageBody')).toContainText(scenario.privacyBody);
    await page.locator('#privacySecurityCloseButton').click();

    await page.evaluate(async ({ database, store, key }) => {
      const request = indexedDB.open(database, 1);
      const db = await new Promise((resolve, reject) => {
        request.onupgradeneeded = () => request.result.createObjectStore(store);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      await new Promise((resolve, reject) => {
        const transaction = db.transaction(store, 'readwrite');
        transaction.objectStore(store).put({ marker: 'fictional-test-key' }, key);
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error);
      });
      db.close();
    }, { database: KEY_DATABASE, store: KEY_STORE, key: KEY_ID });
    const keyBefore = await readKey(page);

    await page.locator(scenario.save).click();
    await expect(page.locator(scenario.status)).toHaveText(scenario.message);
    await page.locator(scenario.reload).click();
    await expect(page.locator(scenario.status)).toHaveText(scenario.message);
    await page.locator(scenario.sample).click();
    await expect(page.locator(scenario.status)).toHaveText(scenario.message);
    await page.locator('#localeSelect').selectOption(scenario.nextLocale);
    await expect(page.locator('#globalMessage')).toHaveText(scenario.message);
    await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBe(encryptedDraft);
    await expect.poll(() => readKey(page)).toEqual(keyBefore);
  }
});
