import { readFile } from 'node:fs/promises';

import { createDefaultState } from '../../site/assets/js/state/defaults.js';
import { DRAFT_STORAGE_KEY, expect, openLocale, test } from './fixtures.js';

const UNRELATED_STORAGE_KEY = 'unrelated-storage-acceptance-sentinel';
const UNRELATED_STORAGE_VALUE = 'keep-this-unrelated-storage-value';
const PHOTO_DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const BOOTSTRAP_IMPORT_FIXTURE = JSON.parse(await readFile(
  new URL('../fixtures/schema-migrations/bootstrap-b0.json', import.meta.url),
  'utf8'
));

function createBootstrapImport() {
  const state = structuredClone(BOOTSTRAP_IMPORT_FIXTURE);
  state.profile.fields.fullName = 'Schema integration profile canary';
  state.profile.photo = PHOTO_DATA_URL;
  state.documents.ja.fields.motivation = 'Schema integration Japanese document canary';
  state.documents['zh-CN'].resume.headline = 'Schema integration Chinese document canary';
  state.documents.en.resume.headline = 'Schema integration English document canary';
  state.settings.pageBreaks.ja.A4.resume = ['qualifications', 'motivation'];
  state.settings.pageBreaks.en.LETTER.resume = ['skills', 'certifications'];
  return state;
}

test('B0 JSON import preserves one shared profile, photo, three documents, page breaks, and unrelated storage', async ({ page }) => {
  const consoleMessages = [];
  page.on('console', (message) => consoleMessages.push(message.text()));
  await page.addInitScript(({ draftKey, sentinelKey, sentinelValue }) => {
    const originalGetItem = Storage.prototype.getItem;
    const originalSetItem = Storage.prototype.setItem;
    const originalRemoveItem = Storage.prototype.removeItem;
    const originalKey = Storage.prototype.key;
    const accesses = [];
    const record = (operation, key) => {
      if (key === sentinelKey || operation === 'key') accesses.push({ operation, key });
    };
    Storage.prototype.getItem = function getItem(key) {
      record('getItem', key);
      return originalGetItem.call(this, key);
    };
    Storage.prototype.setItem = function setItem(key, value) {
      record('setItem', key);
      return originalSetItem.call(this, key, value);
    };
    Storage.prototype.removeItem = function removeItem(key) {
      record('removeItem', key);
      return originalRemoveItem.call(this, key);
    };
    Storage.prototype.key = function key(index) {
      record('key', index);
      return originalKey.call(this, index);
    };
    originalSetItem.call(localStorage, sentinelKey, sentinelValue);
    window.__schemaAcceptanceStorage = {
      read() {
        return {
          accesses: [...accesses],
          draft: originalGetItem.call(localStorage, draftKey),
          sentinel: originalGetItem.call(localStorage, sentinelKey)
        };
      }
    };
  }, {
    draftKey: DRAFT_STORAGE_KEY,
    sentinelKey: UNRELATED_STORAGE_KEY,
    sentinelValue: UNRELATED_STORAGE_VALUE
  });

  const bootstrap = createBootstrapImport();
  await openLocale(page, 'ja');
  await page.locator('#importDataInput').setInputFiles({
    name: 'schema-integration-bootstrap.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(bootstrap))
  });
  await expect(page.locator('#sampleAdoptDialog')).toBeVisible();
  await page.locator('#confirmSampleAdoptButton').click();
  await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), DRAFT_STORAGE_KEY))
    .toContain('"format":"resume-studio-local-encrypted-v1"');
  await page.reload();

  await page.locator('#localeSelect').selectOption('ja');
  await expect(page.locator('[name="fullName"]')).toHaveValue('Schema integration profile canary');
  await expect(page.locator('[name="motivation"]')).toHaveValue('Schema integration Japanese document canary');
  await expect(page.locator('#photoThumbnail img')).toHaveAttribute('src', /^blob:/);

  await page.locator('#localeSelect').selectOption('zh-CN');
  await expect(page.locator('[data-profile="fullName"]')).toHaveValue('Schema integration profile canary');
  await expect(page.locator('[data-resume="headline"]')).toHaveValue('Schema integration Chinese document canary');
  await expect(page.locator('[data-zh-photo-thumbnail] img')).toHaveAttribute('src', /^blob:/);

  await page.locator('#localeSelect').selectOption('en');
  await expect(page.locator('[data-profile-field="fullName"]')).toHaveValue('Schema integration profile canary');
  await expect(page.locator('[data-resume-field="headline"]')).toHaveValue('Schema integration English document canary');

  await page.locator('#dataMenuSummary').click();
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#exportDataButton').click();
  const download = await downloadPromise;
  const exported = JSON.parse(await readFile(await download.path(), 'utf8'));
  expect(exported).toMatchObject({
    version: 1,
    schemaRevision: 1,
    profile: { photo: PHOTO_DATA_URL, fields: { fullName: 'Schema integration profile canary' } },
    documents: {
      ja: { fields: { motivation: 'Schema integration Japanese document canary' } },
      'zh-CN': { resume: { headline: 'Schema integration Chinese document canary' } },
      en: { resume: { headline: 'Schema integration English document canary' } }
    }
  });
  expect(exported.settings.pageBreaks.ja.A4.resume).toEqual(['qualifications', 'motivation']);
  expect(exported.settings.pageBreaks.en.LETTER.resume).toEqual(['skills', 'certifications']);

  const storage = await page.evaluate(() => window.__schemaAcceptanceStorage.read());
  expect(storage.draft).toContain('"format":"resume-studio-local-encrypted-v1"');
  expect(storage.sentinel).toBe(UNRELATED_STORAGE_VALUE);
  expect(storage.accesses).toEqual([]);
  expect(consoleMessages.join('\n')).not.toContain('Schema integration');
});

test('future and unsupported JSON imports leave the current draft, preference, and unrelated storage unchanged', async ({ page }) => {
  await page.addInitScript(({ sentinelKey, sentinelValue }) => {
    localStorage.setItem(sentinelKey, sentinelValue);
  }, { sentinelKey: UNRELATED_STORAGE_KEY, sentinelValue: UNRELATED_STORAGE_VALUE });
  await openLocale(page, 'en');
  const name = page.locator('[data-profile-field="fullName"]');
  await name.fill('Current import protection canary');
  await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), DRAFT_STORAGE_KEY)).not.toBeNull();
  const rawBefore = await page.evaluate((key) => localStorage.getItem(key), DRAFT_STORAGE_KEY);
  const preferenceBefore = await page.evaluate(() => localStorage.getItem('resume-studio-locale-v1'));

  const future = createDefaultState('ja');
  future.schemaRevision = 2;
  const unsupported = createBootstrapImport();
  unsupported.unrecognized = 'not a B0 payload';
  for (const [fileName, payload] of [
    ['future-schema.json', future],
    ['unsupported-bootstrap.json', unsupported]
  ]) {
    await page.locator('#importDataInput').setInputFiles({
      name: fileName,
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(payload))
    });
    await expect(page.locator('#sampleAdoptDialog')).not.toBeVisible();
    await expect(page.locator('#globalMessage')).toHaveClass(/is-error/);
    await expect(name).toHaveValue('Current import protection canary');
    await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), DRAFT_STORAGE_KEY)).toBe(rawBefore);
  }
  await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), 'resume-studio-locale-v1')).toBe(preferenceBefore);
  await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), UNRELATED_STORAGE_KEY)).toBe(UNRELATED_STORAGE_VALUE);
});
