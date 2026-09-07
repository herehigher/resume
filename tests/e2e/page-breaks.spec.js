import { expect, openLocale, test } from './fixtures.js';

test('desktop: English section boundary is a single button and persists its manual page break', async ({ page }) => {
  await openLocale(page, 'en');
  await page.locator('[data-en-action="sample"]').click();
  const boundary = page.locator('.page-break-boundary[data-page-break-key="summary"]');
  await expect(boundary).toBeVisible();
  await expect(boundary).toHaveAttribute('aria-pressed', 'false');
  await boundary.click();
  await expect(boundary).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-section-key="summary"]')).toHaveClass(/has-manual-page-break/);
  await expect(boundary).toContainText('Remove');
  expect(await boundary.evaluate((element) => getComputedStyle(element, '::before').borderTopStyle)).toBe('dashed');
  await page.reload();
  await expect(page.locator('[data-section-key="summary"]')).toHaveClass(/has-manual-page-break/);
});

test('[mobile] smartphone: page breaks use the toolbar list and Escape returns focus to its trigger', async ({ page }) => {
  await openLocale(page, 'zh-CN');
  await page.locator('[data-zh-action="sample"]').click();
  await page.locator('[data-zh-mobile-view="preview"]').click();
  const workspace = page.locator('#chineseWorkspace');
  await expect(workspace.locator('.page-break-boundary').first()).toBeHidden();
  const trigger = workspace.locator('.page-break-menu');
  await expect(trigger).toBeVisible();
  await trigger.press('Enter');
  const row = workspace.locator('.page-break-row[data-page-break-key="summary"]');
  await expect(row).toBeFocused();
  await row.press('Space');
  await expect(row).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
});
