import { DRAFT_STORAGE_KEY, expect, openLocale, readPersistedState, test, waitForPersistedState } from './fixtures.js';

const editors = {
  ja: { field: '#resumeForm [name="fullName"]', status: '#saveStatus', saved: '暗号化してこの端末に保存済み' },
  'zh-CN': { field: '#chineseWorkspace [data-profile="fullName"]', status: '[data-zh-draft-message]', saved: '已加密并保存到此设备' },
  en: { field: '[data-english-editor] [data-profile-field="fullName"]', status: '[data-en-save-status]', saved: 'Encrypted and saved on this device.' }
};

async function controlEncryption(page) {
  await page.evaluate(() => {
    const encrypt = crypto.subtle.encrypt.bind(crypto.subtle);
    window.__saveBarriers = [];
    Object.defineProperty(crypto.subtle, 'encrypt', {
      configurable: true,
      async value(...args) {
        await new Promise((resolve, reject) => window.__saveBarriers.push({ resolve, reject }));
        return encrypt(...args);
      }
    });
  });
}

async function waitForSave(page, index) {
  await page.waitForFunction((count) => window.__saveBarriers.length >= count, index + 1);
}

async function releaseSave(page, index, { fail = false } = {}) {
  await page.evaluate(({ entry, fail }) => {
    const barrier = window.__saveBarriers[entry];
    if (fail) barrier.reject(new Error('Fictional controlled encryption failure'));
    else barrier.resolve();
  }, { entry: index, fail });
}

for (const platform of ['', ' [mobile] [mobile-webkit]']) {
  for (const [locale, editor] of Object.entries(editors)) {
    test(`${locale}: 古い保存 A の完了後も B 完了まで保存中を保つ${platform}`, async ({ page }) => {
      await openLocale(page, locale);
      await controlEncryption(page);
      const field = page.locator(editor.field);
      const status = page.locator(editor.status);
      await field.fill('Fictional save A');
      await waitForSave(page, 0);
      await field.fill('Fictional save B');
      await expect(status).toHaveClass(/is-saving/);
      await releaseSave(page, 0);
      await waitForSave(page, 1);
      await waitForPersistedState(page, { profile: { fields: { fullName: 'Fictional save A' } } });
      await expect(status).toHaveClass(/is-saving/);
      await expect(status).not.toHaveClass(/is-success/);
      await expect(field).toHaveValue('Fictional save B');
      await releaseSave(page, 1);
      await waitForPersistedState(page, { profile: { fields: { fullName: 'Fictional save B' } } });
      await expect(status).toHaveClass(/is-success/);
      await expect(status).toHaveText(editor.saved);
      await page.reload();
      await expect(field).toHaveValue('Fictional save B');
    });

    test(`${locale}: 保存中の表示言語変更だけでは保存完了を無効にしない${platform}`, async ({ page }) => {
      await openLocale(page, locale);
      await controlEncryption(page);
      const field = page.locator(editor.field);
      const status = page.locator(editor.status);
      const nextLocale = { ja: 'en', 'zh-CN': 'ja', en: 'zh-CN' }[locale];
      await field.fill('Fictional pending locale-only save');
      await waitForSave(page, 0);
      await page.locator('#localeSelect').selectOption(nextLocale);
      await releaseSave(page, 0);
      await waitForPersistedState(page, { profile: { fields: { fullName: 'Fictional pending locale-only save' } } });
      await page.locator('#localeSelect').selectOption(locale);
      await expect(field).toHaveValue('Fictional pending locale-only save');
      await expect(status).toHaveText(editor.saved);
      await expect(status).toHaveClass(/is-success/);
    });

    test(`${locale}: 別言語の変更 B の保存完了で元の保存中表示も完了する${platform}`, async ({ page }) => {
      await openLocale(page, locale);
      await controlEncryption(page);
      const nextLocale = { ja: 'en', 'zh-CN': 'ja', en: 'zh-CN' }[locale];
      const nextEditor = editors[nextLocale];
      await page.locator(editor.field).fill('Fictional A before locale edit');
      await waitForSave(page, 0);
      await page.locator('#localeSelect').selectOption(nextLocale);
      await page.locator(nextEditor.field).fill('Fictional B in another locale');
      await releaseSave(page, 0);
      await waitForSave(page, 1);
      await page.locator('#localeSelect').selectOption(locale);
      await expect(page.locator(editor.status)).toHaveClass(/is-saving/);
      await releaseSave(page, 1);
      await waitForPersistedState(page, { profile: { fields: { fullName: 'Fictional B in another locale' } } });
      await expect(page.locator(editor.status)).toHaveText(editor.saved);
      await expect(page.locator(editor.status)).toHaveClass(/is-success/);
      await page.reload();
      await expect(page.locator(editor.field)).toHaveValue('Fictional B in another locale');
    });

    test(`${locale}: 古い保存 A の失敗は B の保存中表示を上書きしない${platform}`, async ({ page }) => {
      await openLocale(page, locale);
      await controlEncryption(page);
      const field = page.locator(editor.field);
      const status = page.locator(editor.status);
      await field.fill('Fictional failed A');
      await waitForSave(page, 0);
      await field.fill('Fictional successful B');
      await releaseSave(page, 0, { fail: true });
      await waitForSave(page, 1);
      await expect(status).toHaveClass(/is-saving/);
      await releaseSave(page, 1);
      await waitForPersistedState(page, { profile: { fields: { fullName: 'Fictional successful B' } } });
      await expect(status).toHaveClass(/is-success/);
      await page.reload();
      await expect(field).toHaveValue('Fictional successful B');
    });

    test(`${locale}: 最新保存 B の競合を A の成功として表示しない${platform}`, async ({ page }) => {
      await openLocale(page, locale);
      await controlEncryption(page);
      const field = page.locator(editor.field);
      const status = page.locator(editor.status);
      await field.fill('Fictional stored A');
      await waitForSave(page, 0);
      await field.fill('Fictional conflicted B');
      await releaseSave(page, 0);
      await waitForSave(page, 1);
      await expect(status).toHaveClass(/is-saving/);
      await page.evaluate((key) => localStorage.setItem(key, `${localStorage.getItem(key)} `), DRAFT_STORAGE_KEY);
      await releaseSave(page, 1);
      await expect(status).toHaveClass(/is-error/);
      await expect(status).not.toHaveClass(/is-success/);
      expect((await readPersistedState(page)).profile.fields.fullName).toBe('Fictional stored A');
      await expect(field).toHaveValue('Fictional conflicted B');
    });
  }
}
