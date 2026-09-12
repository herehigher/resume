import { createDefaultState } from '../../site/assets/js/state/defaults.js';
import { expect, expectNoPageOverflow, openLocale, test } from './fixtures.js';

const cases = [
  ['ja', '#saveStatus', '[name="fullName"]', '暗号化してこの端末に保存済み'],
  ['zh-CN', '[data-zh-draft-message]', '[data-profile="fullName"]', '已加密并保存到此设备'],
  ['en', '[data-en-save-status]', '[data-profile-field="fullName"]', 'Encrypted and saved on this device.']
];

test('[mobile] App Notice wraps in document flow at 320–401px and export closes the backup menu', async ({ page }) => {
  for (const width of [320, 360, 401]) {
    await page.setViewportSize({ width, height: 844 });
    await openLocale(page, 'ja');
    await page.locator('#dataMenuSummary').click();
    await page.locator('#exportDataButton').click();
    await expect(page.locator('.data-menu')).not.toHaveAttribute('open', '');
    await expect(page.locator('#appNotice')).toBeVisible();
    const layout = await page.evaluate(() => {
      const box = (selector) => document.querySelector(selector)?.getBoundingClientRect();
      const header = box('.app-header');
      const notice = box('#appNotice');
      const switcher = box('.mobile-view-switch');
      return { header, notice, switcher, viewport: document.documentElement.clientWidth };
    });
    expect(layout.notice.left).toBeGreaterThanOrEqual(0);
    expect(layout.notice.right).toBeLessThanOrEqual(layout.viewport);
    expect(layout.notice.top).toBeGreaterThanOrEqual(layout.header.bottom);
    expect(layout.notice.bottom).toBeLessThanOrEqual(layout.switcher.top);
    await expectNoPageOverflow(page);
  }
});

test('import updates the active Draft Status while App Notice announces the result once in every locale', async ({ page }) => {
  for (const [locale, statusSelector, fieldSelector, savedStatus] of cases) {
    await openLocale(page, locale);
    const imported = createDefaultState(locale);
    imported.profile.fields.fullName = `Fictional imported ${locale}`;
    await page.locator('#importDataInput').setInputFiles({
      name: `fictional-${locale}.json`,
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(imported))
    });
    await page.locator('#confirmSampleAdoptButton').click();
    await expect(page.locator(fieldSelector)).toHaveValue(`Fictional imported ${locale}`);
    await expect(page.locator(statusSelector)).toHaveText(savedStatus);
    await expect(page.locator('#appNotice')).toBeVisible();
    await expect(page.locator('[aria-live]')).toHaveCount(1);
    await expect(page.locator('#statusAnnouncer')).toHaveAttribute('aria-atomic', 'true');
    await expect(page.locator('#statusAnnouncer')).toHaveText(/.+/);
  }
});
