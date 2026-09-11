import { readFile } from 'node:fs/promises';

import { createDefaultState } from '../../site/assets/js/state/defaults.js';
import { expect, expectNoPageOverflow, openLocale, test } from './fixtures.js';

const PHOTO_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

test('English optional personal details persist, localize across editors, and round-trip through JSON', async ({ page }) => {
  await openLocale(page, 'en');
  const switchControl = page.locator('[data-en-optional-details-switch]');
  const preview = page.locator('[data-en-preview]');

  await page.locator('[data-profile-field="birthDate"]').fill('1990-02-03');
  await page.locator('[data-profile-field="gender"]').selectOption('female');
  await page.locator('[data-profile-field="address"]').fill('42 Fictional Avenue');
  await page.locator('[data-profile-field="nationality"]').fill('Fictionland');
  await page.locator('[data-en-photo-input]').setInputFiles({
    name: 'fictional-photo.png', mimeType: 'image/png', buffer: Buffer.from(PHOTO_BASE64, 'base64')
  });
  await expect(switchControl).not.toBeChecked();
  await expect(preview).not.toContainText('Fictionland');
  await expect(preview.locator('.en-optional-personal-details')).toHaveCount(0);

  await switchControl.check();
  await expect(preview).toContainText('Birth date:');
  await expect(preview).toContainText('Gender: Female');
  await expect(preview).toContainText('Nationality: Fictionland');
  await expect(preview.locator('.en-profile-photo')).toHaveAttribute('src', /^blob:/);

  await page.locator('#dataMenuSummary').click();
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#exportDataButton').click();
  const exported = JSON.parse(await readFile(await (await downloadPromise).path(), 'utf8'));
  expect(exported.profile.fields).toMatchObject({ gender: 'female', nationality: 'Fictionland' });
  expect(exported.documents.en.resume.showOptionalPersonalDetails).toBe(true);

  await expect(page.locator('[data-en-save-status]')).toContainText('Encrypted and saved on this device.');
  await page.reload();
  await expect(switchControl).toBeChecked();
  await expect(page.locator('[data-profile-field="nationality"]')).toHaveValue('Fictionland');

  await page.locator('#localeSelect').selectOption('ja');
  await expect(page.locator('[name="gender"]')).toHaveValue('female');
  await expect(page.locator('[name="nationality"]')).toHaveValue('Fictionland');
  await expect(page.locator('#documentPreview')).toContainText('女性');
  await expect(page.locator('#documentPreview')).toContainText('国籍');

  await page.locator('#localeSelect').selectOption('zh-CN');
  await expect(page.locator('[data-profile="gender"]')).toHaveValue('female');
  await expect(page.locator('[data-profile="nationality"]')).toHaveValue('Fictionland');
  await expect(page.locator('[data-zh-preview]')).toContainText('性别：女');
  await expect(page.locator('[data-zh-preview]')).toContainText('国籍：Fictionland');

  const imported = createDefaultState('en');
  imported.profile.fields.nationality = 'Imported Fictionland';
  imported.profile.fields.gender = 'male';
  imported.documents.en.resume.showOptionalPersonalDetails = false;
  await page.locator('#importDataInput').setInputFiles({
    name: 'fictional-optional-details.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(imported))
  });
  await page.locator('#confirmSampleAdoptButton').click();
  await page.locator('#localeSelect').selectOption('en');
  await expect(switchControl).not.toBeChecked();
  await expect(page.locator('[data-profile-field="nationality"]')).toHaveValue('Imported Fictionland');
  await expect(preview).not.toContainText('Imported Fictionland');
});

test('[mobile] English optional personal-details controls remain usable without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openLocale(page, 'en');
  await page.locator('[data-profile-field="nationality"]').fill('Fictionland');
  await page.locator('[data-en-optional-details-switch]').check();
  await expect(page.locator('[data-en-preview]')).toContainText('Nationality: Fictionland');
  await expectNoPageOverflow(page);
});
