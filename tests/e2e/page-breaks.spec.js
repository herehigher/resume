import { expect, openLocale, test } from './fixtures.js';
import { createDefaultState } from '../../site/assets/js/state/defaults.js';
import { createEnglishSampleState } from '../../site/assets/js/data/en-sample.js';

test('desktop: English section boundary is a single button and persists its manual page break', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await openLocale(page, 'en');
  const state = createEnglishSampleState(createDefaultState('en'));
  await page.locator('#importDataInput').setInputFiles({
    name: 'page-break-persistence.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(state))
  });
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
    const preview = element.closest('.preview-scroll').getBoundingClientRect();
    return { buttonLeft: button.left, buttonRight: button.right, paperRight: paper.right, previewRight: preview.right };
  });
  expect(geometry.buttonLeft).toBeGreaterThanOrEqual(geometry.paperRight);
  expect(geometry.buttonRight).toBeLessThanOrEqual(geometry.previewRight);
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
  await expect(page.locator('[data-en-save-status]')).toContainText('Encrypted and saved');
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
  await expect(row).toHaveAttribute('aria-label', '基本信息之后、个人概述之前添加分页');
  await row.press('Space');
  await expect(row).toHaveAttribute('aria-pressed', 'true');
  await expect(workspace.locator('.page-break-live')).toHaveText('个人概述之前的分页已添加');
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

test('desktop: a saved target stays applied when preceding optional sections become empty', async ({ page }) => {
  await openLocale(page, 'en');
  await page.locator('[data-en-load-sample]').click();
  const experience = page.locator('.page-break-boundary[data-page-break-key="experience"]');
  await experience.click();
  await expect(experience).toHaveAttribute('aria-pressed', 'true');
  const summaryInput = page.locator('[data-resume-field="summary"]');
  await summaryInput.fill('');
  await expect(page.locator('.page-break-boundary[data-page-break-key="experience"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-section-key="experience"]')).toHaveClass(/has-manual-page-break/);
  await summaryInput.fill('Restored summary.');
  await expect(page.locator('.page-break-boundary[data-page-break-key="experience"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-section-key="experience"]')).toHaveClass(/has-manual-page-break/);
});

test('desktop: active classes follow English paper size and Japanese document type', async ({ page }) => {
  const state = createEnglishSampleState(createDefaultState('en'));
  state.settings.pageBreaks.en.LETTER.resume = ['summary'];
  state.settings.pageBreaks.en.A4.resume = ['experience'];
  state.settings.pageBreaks.ja.A4.resume = ['qualifications'];
  state.settings.pageBreaks.ja.A4.career = ['career-history'];
  await openLocale(page, 'en');
  await page.locator('#importDataInput').setInputFiles({
    name: 'isolated-breaks.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(state))
  });
  await expect(page.locator('[data-section-key="summary"]')).toHaveClass(/has-manual-page-break/);
  await page.locator('[data-en-page-size]').selectOption('A4');
  await expect(page.locator('[data-section-key="experience"]')).toHaveClass(/has-manual-page-break/);
  await expect(page.locator('[data-section-key="summary"]')).not.toHaveClass(/has-manual-page-break/);
  await page.locator('#localeSelect').selectOption('ja');
  const qualifications = page.locator('.page-break-boundary[data-page-break-key="qualifications"]');
  await expect(qualifications).toContainText('解除');
  await expect(qualifications).toHaveAttribute('aria-label', '学歴・職歴の後、免許・資格の前に改ページを解除');
  await expect(page.locator('[data-section-key="qualifications"]')).toHaveClass(/has-manual-page-break/);
  await page.locator('#careerDocumentTab').click();
  await expect(page.locator('.page-break-boundary[data-page-break-key="career-history"]')).toContainText('解除');
  await expect(page.locator('[data-section-key="career-history"]')).toHaveClass(/has-manual-page-break/);
});
