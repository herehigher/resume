import { DRAFT_STORAGE_KEY, expect, openLocale, test } from './fixtures.js';

const UNRELATED_STORAGE_KEY = 'unrelated-storage-sentinel';
const unrelatedStorageValue = JSON.stringify({ keep: 'unrelated fixture' });

test('permanently unreadable drafts are automatically cleared into saveable defaults in every locale', async ({ page }) => {
  const cases = [
    ['ja', '[name="fullName"]', '保存済みの下書きに問題があったため、新しい既定の下書きに自動復旧しました。'],
    ['zh-CN', '[data-profile="fullName"]', '已因保存的草稿出现问题而自动恢复为新的默认草稿。'],
    ['en', '[data-profile-field="fullName"]', 'Because the saved draft had a problem, it was automatically recovered to a new default draft.']
  ];

  await page.addInitScript(({ draftKey, sentinelKey, sentinelValue }) => {
    const storage = window.localStorage;
    const getItem = Storage.prototype.getItem;
    const setItem = Storage.prototype.setItem;
    const removeItem = Storage.prototype.removeItem;
    const key = Storage.prototype.key;
    const accesses = [];
    const record = (operation, keyName) => {
      if (keyName === sentinelKey || operation === 'key') accesses.push({ operation, key: keyName });
    };
    Storage.prototype.getItem = function (keyName) {
      record('getItem', keyName);
      return getItem.call(this, keyName);
    };
    Storage.prototype.setItem = function (keyName, value) {
      record('setItem', keyName);
      return setItem.call(this, keyName, value);
    };
    Storage.prototype.removeItem = function (keyName) {
      record('removeItem', keyName);
      return removeItem.call(this, keyName);
    };
    Storage.prototype.key = function (index) {
      record('key', index);
      return key.call(this, index);
    };
    setItem.call(storage, draftKey, '{not-json');
    setItem.call(storage, sentinelKey, sentinelValue);
    window.__unrelatedStorageSentinel = {
      accesses: () => accesses.slice(),
      value: () => getItem.call(storage, sentinelKey)
    };
  }, { draftKey: DRAFT_STORAGE_KEY, sentinelKey: UNRELATED_STORAGE_KEY, sentinelValue: unrelatedStorageValue });

  for (const [locale, fieldSelector, message] of cases) {
    await openLocale(page, locale);
    await expect(page.locator('#globalMessage')).toHaveText(message);
    await expect(page.locator('#globalMessage')).not.toHaveClass(/is-error/);
    await expect(page.locator(fieldSelector)).toHaveValue('');
    await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), DRAFT_STORAGE_KEY)).toBeNull();
    await expect(page.evaluate(() => window.__unrelatedStorageSentinel.value())).resolves.toBe(unrelatedStorageValue);

    await page.locator(fieldSelector).fill(`Recovered ${locale}`);
    await expect.poll(() => page.evaluate((key) => Boolean(localStorage.getItem(key)), DRAFT_STORAGE_KEY)).toBe(true);
  }

  await expect(page.evaluate(() => window.__unrelatedStorageSentinel.accesses())).resolves.toEqual([]);
});
