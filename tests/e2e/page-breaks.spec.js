import { expect, openLocale, test } from './fixtures.js';
import { createDefaultState } from '../../site/assets/js/state/defaults.js';
import { createEnglishSampleState } from '../../site/assets/js/data/en-sample.js';

async function clickVisible(page, locator) {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.click(box.x + (box.width / 2), box.y + (box.height / 2));
}

async function blurFocusedControlOnNextPointerDown(locator) {
  await locator.evaluate((element) => {
    element.addEventListener('pointerdown', () => {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    }, { once: true });
  });
}

test('desktop: English section boundary is a single button and persists its manual page break', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await openLocale(page, 'en');
  const state = createEnglishSampleState(createDefaultState('en'));
  await page.locator('#importDataInput').setInputFiles({
    name: 'page-break-persistence.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(state))
  });
  const boundary = page.locator('.page-break-boundary[data-page-break-key="summary"]');
  const previewScroll = page.locator('[data-en-preview-scroll]');
  await expect(boundary).toBeVisible();
  await expect(boundary).toHaveAttribute('aria-pressed', 'false');
  await expect.poll(() => boundary.evaluate((element) => {
    const button = element.getBoundingClientRect();
    const icon = element.querySelector('.page-break-plus').getBoundingClientRect();
    const paper = element.closest('.document-page').getBoundingClientRect();
    const preview = element.closest('.preview-scroll').getBoundingClientRect();
    return icon.left >= paper.right && button.right <= preview.right;
  })).toBe(true);
  const iconPaperOffsetBeforeToggle = await boundary.evaluate((element) => {
    const icon = element.querySelector('.page-break-plus').getBoundingClientRect();
    const paper = element.closest('.document-page');
    const paperRect = paper.getBoundingClientRect();
    const scale = paperRect.width / paper.offsetWidth;
    return (icon.left - paperRect.right) / scale;
  });
  const scrollLeftBeforeToggle = await previewScroll.evaluate((element) => element.scrollLeft);
  await clickVisible(page, boundary);
  await expect(boundary).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-section-key="summary"]')).toHaveClass(/has-manual-page-break/);
  await expect(boundary).toContainText('Remove');
  expect(await boundary.evaluate((element) => getComputedStyle(element.closest('[data-section-key]'), '::before').borderTopStyle)).toBe('dashed');
  const geometry = await boundary.evaluate((element) => {
    const button = element.getBoundingClientRect();
    const icon = element.querySelector('.page-break-plus').getBoundingClientRect();
    const paper = element.closest('.document-page').getBoundingClientRect();
    const preview = element.closest('.preview-scroll').getBoundingClientRect();
    const section = element.closest('[data-section-key]');
    const sectionRect = section.getBoundingClientRect();
    const guide = getComputedStyle(section, '::before');
    const scale = paper.width / element.closest('.document-page').offsetWidth;
    return {
      buttonRight: button.right,
      guideEnd: sectionRect.right - (Number.parseFloat(guide.right) * scale),
      guideBorder: guide.borderTopStyle,
      guideStart: sectionRect.left + (Number.parseFloat(guide.left) * scale),
      iconLeft: icon.left,
      paperLeft: paper.left,
      paperRight: paper.right,
      previewRight: preview.right,
      scale
    };
  });
  expect(geometry.iconLeft - geometry.paperRight).toBeCloseTo(16 * geometry.scale, 0);
  expect((geometry.iconLeft - geometry.paperRight) / geometry.scale).toBeCloseTo(iconPaperOffsetBeforeToggle, 1);
  expect(geometry.buttonRight).toBeLessThanOrEqual(geometry.previewRight);
  expect(geometry.guideBorder).toBe('dashed');
  expect(geometry.guideStart).toBeCloseTo(geometry.paperLeft, 1);
  expect(geometry.guideEnd).toBeCloseTo(geometry.paperRight, 1);
  expect(await previewScroll.evaluate((element) => element.scrollLeft)).toBe(scrollLeftBeforeToggle);
  for (let index = 0; index < 3; index += 1) {
    await clickVisible(page, boundary);
    await expect(page.locator('.page-break-boundary[data-page-break-key="summary"]')).toHaveCount(1);
    await clickVisible(page, boundary);
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

test('[mobile][mobile-webkit] smartphone: page-break rows support keyboard navigation and Escape returns focus to the trigger', async ({ page }) => {
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
  await expect(row).toBeFocused();
  await page.keyboard.press('Tab');
  const experience = workspace.locator('.page-break-row[data-page-break-key="experience"]');
  await expect(experience).toBeFocused();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await experience.press('Enter');
  await expect(experience).toHaveAttribute('aria-pressed', 'true');
  await expect(experience).toBeFocused();
  await expect(experience).toHaveCount(1);
  await expect(workspace.locator('.page-break-live')).toHaveText('工作经历之前的分页已添加');
  await page.keyboard.press('Escape');
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await expect(trigger).toBeFocused();
});

test('[mobile][mobile-webkit] later page-break rows survive touch focus loss and rerender in Chromium and WebKit', async ({ page }) => {
  await openLocale(page, 'zh-CN');
  await page.locator('[data-zh-action="sample"]').click();
  await page.locator('[data-zh-mobile-view="preview"]').click();
  const workspace = page.locator('#chineseWorkspace');
  const trigger = workspace.locator('.page-break-menu');
  const summary = workspace.locator('.page-break-row[data-page-break-key="summary"]');
  const experience = workspace.locator('.page-break-row[data-page-break-key="experience"]');
  const projects = workspace.locator('.page-break-row[data-page-break-key="projects"]');

  await trigger.tap();
  await expect(summary).toBeFocused();
  await blurFocusedControlOnNextPointerDown(experience);
  await experience.tap();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await expect(experience).toHaveCount(1);
  await expect(experience).toHaveAttribute('aria-pressed', 'true');
  await expect(experience).toBeFocused();
  await expect(page.locator('[data-section-key="experience"]')).toHaveClass(/has-manual-page-break/);
  await expect(workspace.locator('.page-break-live')).toHaveText('工作经历之前的分页已添加');

  await blurFocusedControlOnNextPointerDown(experience);
  await experience.tap();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await expect(experience).toHaveCount(1);
  await expect(experience).toHaveAttribute('aria-pressed', 'false');
  await expect(experience).toBeFocused();
  await expect(page.locator('[data-section-key="experience"]')).not.toHaveClass(/has-manual-page-break/);
  await expect(workspace.locator('.page-break-live')).toHaveText('工作经历之前的分页已取消');

  await blurFocusedControlOnNextPointerDown(projects);
  await projects.tap();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await expect(projects).toHaveCount(1);
  await expect(projects).toHaveAttribute('aria-pressed', 'true');
  await expect(projects).toBeFocused();
  await expect(page.locator('[data-section-key="projects"]')).toHaveClass(/has-manual-page-break/);
  await expect(workspace.locator('.page-break-live')).toHaveText('项目经历之前的分页已添加');

  await blurFocusedControlOnNextPointerDown(trigger);
  await trigger.tap();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
});

test('[mobile][mobile-webkit] page-break list closes when focus or a click moves outside it', async ({ page }) => {
  await openLocale(page, 'zh-CN');
  await page.locator('[data-zh-action="sample"]').click();
  await page.locator('[data-zh-mobile-view="preview"]').click();
  const workspace = page.locator('#chineseWorkspace');
  const trigger = workspace.locator('.page-break-menu');
  await trigger.click();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await page.locator('#localeSelect').focus();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await trigger.click();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await workspace.locator('[data-zh-preview-scroll]').click({ position: { x: 4, y: 4 } });
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await trigger.click();
  const row = workspace.locator('.page-break-row[data-page-break-key="summary"]');
  await row.dispatchEvent('pointerdown', { isPrimary: true, pointerId: 139, pointerType: 'touch' });
  await row.dispatchEvent('pointercancel', { isPrimary: true, pointerId: 139, pointerType: 'touch' });
  await page.locator('#localeSelect').focus();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await trigger.click();
  await row.dispatchEvent('pointerdown', { isPrimary: true, pointerId: 140, pointerType: 'touch' });
  await page.keyboard.press('Escape');
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await trigger.press('Enter');
  await page.locator('#localeSelect').focus();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
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
  await clickVisible(page, experience);
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
