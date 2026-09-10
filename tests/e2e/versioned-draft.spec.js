import { STORAGE_KEY } from '../../site/assets/js/config.js';
import { expect, openLocale, test } from './fixtures.js';

const OUT_OF_RANGE_STORAGE_KEY = 'resume-studio-web-v1';
const OUT_OF_RANGE_RAW = JSON.stringify({ marker: 'fictional-out-of-range-draft' });

test('out-of-range draft namespaces never block, change, or disappear during current editing', async ({ page }) => {
  await page.addInitScript(({ storageKey, raw }) => {
    localStorage.setItem(storageKey, raw);
  }, { storageKey: OUT_OF_RANGE_STORAGE_KEY, raw: OUT_OF_RANGE_RAW });

  await openLocale(page, 'ja');
  await expect(page.locator('#globalMessage')).toHaveText('');
  await expect(page.locator('[name="fullName"]')).toHaveValue('');

  await page.locator('[name="fullName"]').fill('Versioned namespace fixture');
  await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).not.toBeNull();
  await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), OUT_OF_RANGE_STORAGE_KEY)).toBe(OUT_OF_RANGE_RAW);

  await page.locator('#dataMenuSummary').click();
  await page.locator('#clearDraftButton').click();
  await page.locator('#confirmClearButton').click();

  await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBeNull();
  await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), OUT_OF_RANGE_STORAGE_KEY)).toBe(OUT_OF_RANGE_RAW);
});

test('a listed compatible namespace is removed only after the new namespace is durable', async ({ page }) => {
  await openLocale(page, 'ja');
  const sourceKey = 'resume-studio-web-v2-e2e-source';
  const currentKey = 'resume-studio-web-v2-e2e-current';

  const result = await page.evaluate(async ({ sourceKey, currentKey }) => {
    const [{ createDefaultState }, { loadVersionedDraft }] = await Promise.all([
      import('/assets/js/state/defaults.js'),
      import('/assets/js/state/versioned-draft.js')
    ]);
    const source = createDefaultState('ja');
    source.profile.fields.fullName = 'Compatible migration fixture';
    localStorage.setItem(sourceKey, JSON.stringify(source));

    const loaded = await loadVersionedDraft(localStorage, {
      currentStorageKey: currentKey,
      compatibleStorageKeys: [sourceKey]
    });
    return {
      loadedName: loaded.state.profile.fields.fullName,
      sourceRemoved: loaded.sourceRemoved,
      sourceRaw: localStorage.getItem(sourceKey),
      currentEnvelope: JSON.parse(localStorage.getItem(currentKey))
    };
  }, { sourceKey, currentKey });

  expect(result.loadedName).toBe('Compatible migration fixture');
  expect(result.sourceRemoved).toBe(true);
  expect(result.sourceRaw).toBeNull();
  expect(result.currentEnvelope.format).toBe('resume-studio-local-encrypted-v1');
});
