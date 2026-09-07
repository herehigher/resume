import { expect, openLocale, test } from './fixtures.js';
import { createDefaultState } from '../../site/assets/js/state/defaults.js';

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
  const geometry = await boundary.evaluate((element) => {
    const button = element.getBoundingClientRect();
    const paper = element.closest('.document-page').getBoundingClientRect();
    return { buttonLeft: button.left, paperRight: paper.right };
  });
  expect(geometry.buttonLeft).toBeGreaterThanOrEqual(geometry.paperRight);
  for (let index = 0; index < 3; index += 1) {
    await boundary.click();
    await expect(page.locator('.page-break-boundary[data-page-break-key="summary"]')).toHaveCount(1);
    await boundary.click();
    await expect(page.locator('.page-break-boundary[data-page-break-key="summary"]')).toHaveCount(1);
  }
  const summaryInput = page.locator('[data-resume-field="summary"]');
  await summaryInput.fill('');
  await expect(page.locator('.page-break-boundary[data-page-break-key="summary"]')).toHaveCount(0);
  await summaryInput.fill('Restored fictional summary.');
  const restored = page.locator('.page-break-boundary[data-page-break-key="summary"]');
  await expect(restored).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-section-key="summary"]')).toHaveClass(/has-manual-page-break/);
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
  for (let index = 0; index < 2; index += 1) {
    await row.press('Space');
    await expect(workspace.locator('.page-break-row[data-page-break-key="summary"]')).toHaveCount(1);
    await row.press('Space');
    await expect(workspace.locator('.page-break-row[data-page-break-key="summary"]')).toHaveCount(1);
  }
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
});

test('[mobile] identity-only documents hide the page-break menu and retain no illegal controls', async ({ page }) => {
  const state = createDefaultState('en');
  await openLocale(page, 'en');
  await page.locator('#importDataInput').setInputFiles({
    name: 'identity-only.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(state))
  });
  await page.locator('[data-en-mobile-view="preview"]').click();
  const workspace = page.locator('[data-english-editor]');
  await expect(workspace.locator('.page-break-menu')).toBeHidden();
  await expect(workspace.locator('.page-break-row')).toHaveCount(0);
  await expect(workspace.locator('.page-break-boundary')).toHaveCount(0);
});
