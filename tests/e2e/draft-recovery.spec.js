import { DRAFT_STORAGE_KEY, expect, openLocale, test } from './fixtures.js';

const LEGACY_STORAGE_KEY = 'resume-studio-data-v1';
const legacyDraft = JSON.stringify({ keep: 'legacy fixture' });

test('permanently unreadable drafts are automatically cleared into saveable defaults in every locale', async ({ page }) => {
  const cases = [
    ['ja', '[name="fullName"]', '保存済みの下書きに問題があったため、新しい既定の下書きに自動復旧しました。'],
    ['zh-CN', '[data-profile="fullName"]', '已因保存的草稿出现问题而自动恢复为新的默认草稿。'],
    ['en', '[data-profile-field="fullName"]', 'Because the saved draft had a problem, it was automatically recovered to a new default draft.']
  ];

  await page.addInitScript(({ draftKey, legacyKey, legacyValue }) => {
    localStorage.setItem(draftKey, '{not-json');
    localStorage.setItem(legacyKey, legacyValue);
  }, { draftKey: DRAFT_STORAGE_KEY, legacyKey: LEGACY_STORAGE_KEY, legacyValue: legacyDraft });

  for (const [locale, fieldSelector, message] of cases) {
    await openLocale(page, locale);
    await expect(page.locator('#globalMessage')).toHaveText(message);
    await expect(page.locator('#globalMessage')).not.toHaveClass(/is-error/);
    await expect(page.locator(fieldSelector)).toHaveValue('');
    await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), DRAFT_STORAGE_KEY)).toBeNull();
    await expect(page.evaluate((key) => localStorage.getItem(key), LEGACY_STORAGE_KEY)).resolves.toBe(legacyDraft);

    await page.locator(fieldSelector).fill(`Recovered ${locale}`);
    await expect.poll(() => page.evaluate((key) => Boolean(localStorage.getItem(key)), DRAFT_STORAGE_KEY)).toBe(true);
  }
});
