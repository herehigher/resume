import { createDefaultState } from '../../site/assets/js/state/defaults.js';
import {
  DRAFT_STORAGE_KEY,
  expect,
  LOCALE_PREFERENCE_KEY,
  openLocale,
  readLocalePreference,
  test,
  writeLocalePreference
} from './fixtures.js';

async function clearDraftWithUi(page) {
  await page.locator('#clearButton').click();
  await page.locator('#confirmClearButton').click();
  await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), DRAFT_STORAGE_KEY)).toBeNull();
}

test('URL query は保存 preference より優先し、query がなければ preference を復元する', async ({ page }) => {
  await page.goto('/editor/');
  await writeLocalePreference(page, 'en');

  await page.goto('/editor/?lang=ja');
  await expect(page.locator('#localeSelect')).toHaveValue('ja');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ja');
  await expect(readLocalePreference(page)).resolves.toBe('en');

  await page.goto('/editor/');
  await expect(page.locator('#localeSelect')).toHaveValue('en');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
});

test('locale 切替は次回起動後も独立 preference から復元する', async ({ page }) => {
  await openLocale(page, 'ja');
  await page.locator('#localeSelect').selectOption('zh-CN');
  await expect(page.locator('#localeSelect')).toHaveValue('zh-CN');
  await expect(readLocalePreference(page)).resolves.toBe('zh-CN');

  await page.goto('/editor/');
  await expect(page.locator('#localeSelect')).toHaveValue('zh-CN');
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
});

test('draft clear は表示 locale preference を削除しない', async ({ page }) => {
  await page.goto('/editor/');
  await writeLocalePreference(page, 'en');
  await openLocale(page, 'ja');
  await page.locator('[name="fullName"]').fill('Locale preference E2E');
  await expect.poll(() => page.evaluate((key) => Boolean(localStorage.getItem(key)), DRAFT_STORAGE_KEY)).toBe(true);

  await clearDraftWithUi(page);
  await expect(readLocalePreference(page)).resolves.toBe('en');

  await page.goto('/editor/');
  await expect(page.locator('#localeSelect')).toHaveValue('en');
});

test('import の settings.locale は表示 locale と preference を変更しない', async ({ page }) => {
  await page.goto('/editor/');
  await writeLocalePreference(page, 'en');
  await openLocale(page, 'ja');
  const imported = createDefaultState('zh-CN');
  imported.profile.fields.fullName = 'Imported Fictional Person';

  await page.locator('#importDataInput').setInputFiles({
    name: 'resume-studio-fictional-import.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(imported))
  });
  await expect(page.locator('[name="fullName"]')).toHaveValue('Imported Fictional Person');
  await expect(page.locator('#localeSelect')).toHaveValue('ja');
  await expect(readLocalePreference(page)).resolves.toBe('en');

  await page.goto('/editor/');
  await expect(page.locator('#localeSelect')).toHaveValue('en');
});

test('preference 保存失敗でも UI を切り替え、locale 別の注意を表示する', async ({ page }) => {
  await page.addInitScript((key) => {
    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function setItem(name, value) {
      if (name === key) throw new Error('fictional preference storage failure');
      return originalSetItem.call(this, name, value);
    };
  }, LOCALE_PREFERENCE_KEY);

  for (const [currentLocale, nextLocale, message] of [
    ['en', 'ja', '表示言語は切り替えましたが、次回は記憶されない可能性があります。'],
    ['ja', 'zh-CN', '显示语言已切换，但下次打开时可能无法记住。'],
    ['zh-CN', 'en', 'The display language changed, but it may not be remembered next time.']
  ]) {
    await openLocale(page, currentLocale);
    await page.locator('#localeSelect').selectOption(nextLocale);
    await expect(page.locator('#localeSelect')).toHaveValue(nextLocale);
    await expect(page.locator('#globalMessage')).toHaveText(message);
  }
});
