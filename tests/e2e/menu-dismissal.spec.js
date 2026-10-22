import { expect, openLocale, test } from './fixtures.js';
import { getMessages } from '../../site/assets/js/i18n/index.js';

for (const locale of ['ja', 'zh-CN', 'en']) {
  test(`${locale}: PDF remains a direct action and other export formats have a separate disclosure`, async ({ page }) => {
    await openLocale(page, locale);
    const copy = getMessages(locale);
    const menu = page.locator('.export-menu');
    const trigger = page.locator('#exportMenuSummary');
    const pdf = page.locator('#printButton');
    await expect(pdf).toHaveAccessibleName(copy.printDocument);
    await expect(trigger).toHaveAccessibleName(copy.exportMenuLabel);
    await expect(page.locator('.data-menu #exportMarkdownButton, .data-menu #printButton')).toHaveCount(0);
    await page.evaluate(() => { window.printCalls = 0; window.print = () => { window.printCalls += 1; }; });
    await pdf.click();
    expect(await page.evaluate(() => window.printCalls)).toBe(1);
    await expect(menu).not.toHaveAttribute('open', '');

    await trigger.focus();
    await page.keyboard.press('Enter');
    await expect(menu).toHaveAttribute('open', '');
    await page.keyboard.press('Tab');
    await expect(page.locator('#exportMarkdownButton')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(menu).not.toHaveAttribute('open', '');
    await expect(trigger).toBeFocused();

    await trigger.click();
    await page.locator('#dataMenuSummary').click();
    await expect(menu).not.toHaveAttribute('open', '');
    await expect(page.locator('.data-menu')).toHaveAttribute('open', '');
    await trigger.click();
    await expect(page.locator('.data-menu')).not.toHaveAttribute('open', '');
    await expect(menu).toHaveAttribute('open', '');
    await page.locator('#localeSelect').focus();
    await expect(menu).not.toHaveAttribute('open', '');
    await expect(page.locator('#localeSelect')).toBeFocused();
  });
}

test('backup and restore menu closes after export and on focus loss', async ({ page }) => {
  await openLocale(page, 'en');
  const menu = page.locator('.data-menu');
  const trigger = page.locator('#dataMenuSummary');
  await trigger.click();
  await expect(menu).toHaveAttribute('open', '');
  await page.locator('#clearDraftButton').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#sampleAdoptDialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#sampleAdoptDialog')).not.toBeVisible();
  await expect(menu).toHaveAttribute('open', '');
  await expect(page.locator('#clearDraftButton')).toBeFocused();
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#exportDataButton').click();
  await downloadPromise;
  await expect(menu).not.toHaveAttribute('open', '');
  await trigger.click();
  await expect(menu).toHaveAttribute('open', '');
  await page.locator('#localeSelect').focus();
  await expect(menu).not.toHaveAttribute('open', '');
  await expect(page.locator('#localeSelect')).toBeFocused();
  await trigger.click();
  await expect(menu).toHaveAttribute('open', '');
  await page.locator('.editor-heading:visible').click();
  await expect(menu).not.toHaveAttribute('open', '');
  await trigger.click();
  await expect(menu).toHaveAttribute('open', '');
  await page.keyboard.press('Escape');
  await expect(menu).not.toHaveAttribute('open', '');
  await expect(trigger).toBeFocused();
});
