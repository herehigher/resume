import { readFile } from 'node:fs/promises';

import { expect, openLocale, test } from './fixtures.js';
import { createDefaultState } from '../../site/assets/js/state/defaults.js';
import { createEnglishSampleState } from '../../site/assets/js/data/en-sample.js';

async function clickVisible(_page, locator) {
  await expect(locator).toBeVisible();
  await locator.click();
}

async function blurFocusedControlOnNextPointerUp(locator) {
  await locator.evaluate((element) => {
    element.addEventListener('pointerup', () => {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    }, { once: true });
  });
}

async function openDesktopPageBreakMode(page, rootSelector) {
  const trigger = page.locator(`${rootSelector} [data-page-break-mode-toggle]`);
  await trigger.click();
  await expect(trigger).toHaveAttribute('aria-pressed', 'true');
  return trigger;
}

test('desktop: edit mode places a labeled rail outside the document and offers PDF-status undo', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await openLocale(page, 'en');
  const state = createEnglishSampleState(createDefaultState('en'));
  await page.locator('#importDataInput').setInputFiles({
    name: 'page-break-persistence.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(state))
  });
  await page.locator('#confirmSampleAdoptButton').click();
  const trigger = page.locator('[data-english-editor] [data-page-break-mode-toggle]');
  const boundary = page.locator('.page-break-boundary[data-page-break-key="summary"]');
  const previewScroll = page.locator('[data-en-preview-scroll]');
  await expect(trigger).toHaveAttribute('aria-pressed', 'false');
  await expect(boundary).toHaveCount(0);
  await openDesktopPageBreakMode(page, '[data-english-editor]');
  await expect(boundary).toBeVisible();
  await expect(boundary).toHaveAttribute('aria-pressed', 'false');
  await expect.poll(() => boundary.evaluate((element) => {
    const button = element.getBoundingClientRect();
    const paper = document.querySelector('[data-section-key="summary"]').closest('.document-page').getBoundingClientRect();
    const preview = document.querySelector('[data-en-preview-scroll]').getBoundingClientRect();
    return button.left > paper.right && button.left >= preview.left && button.right <= preview.right;
  })).toBe(true);
  for (const width of [821, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect.poll(() => boundary.evaluate((element) => {
      const button = element.getBoundingClientRect();
      const paper = document.querySelector('[data-section-key="summary"]').closest('.document-page').getBoundingClientRect();
      const preview = document.querySelector('[data-en-preview-scroll]').getBoundingClientRect();
      return button.left > paper.right && button.left >= preview.left && button.right <= preview.right;
    })).toBe(true);
  }
  const scrollLeftBeforeToggle = await previewScroll.evaluate((element) => element.scrollLeft);
  await boundary.hover();
  await expect(page.locator('[data-section-key="summary"]')).toHaveClass(/page-break-target-highlight/);
  await clickVisible(page, boundary);
  await expect(boundary).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-section-key="summary"]')).toHaveClass(/has-manual-page-break/);
  await expect(boundary).toContainText('Remove page break between Contact information and Summary');
  await expect(page.locator('[data-english-editor] .page-break-feedback')).toContainText('The PDF will start this content on a new page.');
  const undo = page.locator('[data-english-editor] .page-break-undo');
  await expect(undo).toBeVisible();
  await undo.click();
  await expect(page.locator('[data-section-key="summary"]')).not.toHaveClass(/has-manual-page-break/);
  await clickVisible(page, boundary);
  await expect(page.locator('[data-section-key="summary"]')).toHaveClass(/has-manual-page-break/);
  expect(await page.locator('[data-section-key="summary"]').evaluate((element) => getComputedStyle(element, '::before').borderTopStyle)).toBe('dashed');
  expect(await previewScroll.evaluate((element) => element.scrollLeft)).toBe(scrollLeftBeforeToggle);
  await trigger.click();
  await expect(trigger).toHaveAttribute('aria-pressed', 'false');
  await expect(boundary).toHaveCount(0);
  await expect(page.locator('.page-break-passive-marker[data-page-break-key="summary"]')).toBeVisible();
  await openDesktopPageBreakMode(page, '[data-english-editor]');
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
  await expect(page.locator('#statusAnnouncer')).toHaveText('导出 PDF 时将从新页面开始。');
  await expect(row).toBeFocused();
  await page.keyboard.press('Tab');
  const experience = workspace.locator('.page-break-row[data-page-break-key="experience"]');
  await expect(experience).toBeFocused();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await experience.press('Enter');
  await expect(experience).toHaveAttribute('aria-pressed', 'true');
  await expect(experience).toBeFocused();
  await expect(experience).toHaveCount(1);
  await expect(page.locator('#statusAnnouncer')).toHaveText('导出 PDF 时将从新页面开始。');
  const lastRow = workspace.locator('.page-break-row').last();
  await lastRow.focus();
  await page.keyboard.press('Tab');
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await trigger.focus();
  await trigger.press('Enter');
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Escape');
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await expect(trigger).toBeFocused();
});

test('[mobile][mobile-webkit] page-break rows survive delayed touch focus loss and rerender in Chromium and WebKit', async ({ page }) => {
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
  await blurFocusedControlOnNextPointerUp(summary);
  await summary.tap();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await expect(summary).toHaveCount(1);
  await expect(summary).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-section-key="summary"]')).toHaveClass(/has-manual-page-break/);
  await expect(page.locator('#statusAnnouncer')).toHaveText('导出 PDF 时将从新页面开始。');

  await blurFocusedControlOnNextPointerUp(experience);
  await experience.tap();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await expect(experience).toHaveCount(1);
  await expect(experience).toHaveAttribute('aria-pressed', 'true');
  await expect(experience).toBeFocused();
  await expect(page.locator('[data-section-key="experience"]')).toHaveClass(/has-manual-page-break/);
  await expect(page.locator('#statusAnnouncer')).toHaveText('导出 PDF 时将从新页面开始。');

  await blurFocusedControlOnNextPointerUp(experience);
  await experience.tap();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await expect(experience).toHaveCount(1);
  await expect(experience).toHaveAttribute('aria-pressed', 'false');
  await expect(experience).toBeFocused();
  await expect(page.locator('[data-section-key="experience"]')).not.toHaveClass(/has-manual-page-break/);
  await expect(page.locator('#statusAnnouncer')).toHaveText('已取消 PDF 导出时的分页。');

  await blurFocusedControlOnNextPointerUp(projects);
  await projects.tap();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await expect(projects).toHaveCount(1);
  await expect(projects).toHaveAttribute('aria-pressed', 'true');
  await expect(projects).toBeFocused();
  await expect(page.locator('[data-section-key="projects"]')).toHaveClass(/has-manual-page-break/);
  await expect(page.locator('#statusAnnouncer')).toHaveText('导出 PDF 时将从新页面开始。');

  await blurFocusedControlOnNextPointerUp(trigger);
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
  await page.locator('#localeSelect').focus();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await trigger.click();
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
  await page.locator('#confirmSampleAdoptButton').click();
  await page.locator('[data-en-mobile-view="preview"]').click();
  const workspace = page.locator('[data-english-editor]');
  await expect(workspace.locator('.page-break-menu')).toBeHidden();
  await expect(workspace.locator('.page-break-row')).toHaveCount(0);
  await expect(workspace.locator('.page-break-boundary')).toHaveCount(0);
});

test('desktop: a saved target stays applied when preceding optional sections become empty', async ({ page }) => {
  await openLocale(page, 'en');
  await page.locator('[data-en-load-sample]').click();
  await openDesktopPageBreakMode(page, '[data-english-editor]');
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

test('desktop: an English record page break follows its stable ID after rendered date reordering', async ({ page }) => {
  const state = createDefaultState('en');
  state.documents.en.resume.experience = [
    { id: 'record_target', company: 'Target fictional employer', role: 'Target role', startDate: '2021-01', endDate: '2023-01', details: 'Fictional target achievement.' },
    { id: 'record_other', company: 'Other fictional employer', role: 'Other role', startDate: '2020-01', endDate: '2022-01', details: 'Fictional other achievement.' }
  ];
  state.settings.pageBreaks.en.LETTER.resume.records = ['record_target'];
  await openLocale(page, 'en');
  await page.locator('#importDataInput').setInputFiles({
    name: 'fictional-record-reorder.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(state))
  });
  await page.locator('#confirmSampleAdoptButton').click();
  await openDesktopPageBreakMode(page, '[data-english-editor]');
  await expect(page.locator('[data-record-id="record_target"]')).toHaveClass(/has-manual-page-break/);
  await expect(page.locator('[data-section-key="experience"]')).not.toHaveClass(/has-manual-page-break/);
  await page.locator('[data-en-list="experience"] [data-en-item]').nth(1).locator('[data-en-item-field="endDate"]').fill('2024-01');
  await expect(page.locator('[data-record-id="record_other"]')).toHaveText(/Other fictional employer/);
  await expect(page.locator('[data-record-id="record_target"]')).toHaveClass(/has-manual-page-break/);
  await expect(page.locator('.page-break-boundary[data-page-break-key="record:record_target"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-section-key="experience"]')).not.toHaveClass(/has-manual-page-break/);
});

test('desktop: short English record markers have independent hit targets and save their own IDs', async ({ page }) => {
  const state = createDefaultState('en');
  state.documents.en.resume.experience = [
    { id: 'record_first', company: 'First fictional employer', role: 'First role', startDate: '2022-01', endDate: '2023-01', details: 'First fictional achievement.' },
    { id: 'record_second', company: 'Second fictional employer', role: 'Second role', startDate: '2020-01', endDate: '2021-01', details: 'Second fictional achievement.' }
  ];
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openLocale(page, 'en');
  await page.locator('#importDataInput').setInputFiles({
    name: 'fictional-record-hit-targets.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(state))
  });
  await page.locator('#confirmSampleAdoptButton').click();
  await openDesktopPageBreakMode(page, '[data-english-editor]');
  const first = page.locator('.page-break-boundary[data-page-break-key="record:record_first"]');
  const second = page.locator('.page-break-boundary[data-page-break-key="record:record_second"]');
  await expect.poll(() => page.evaluate(() => [...document.querySelectorAll('.page-break-record-boundary')].map((element) => {
    const box = element.getBoundingClientRect();
    const hit = document.elementFromPoint(box.left + (box.width / 2), box.top + (box.height / 2));
    return { key: element.dataset.pageBreakKey, hit: hit?.closest('.page-break-boundary')?.dataset.pageBreakKey, top: box.top };
  }))).toEqual([
    { key: 'record:record_first', hit: 'record:record_first', top: expect.any(Number) },
    { key: 'record:record_second', hit: 'record:record_second', top: expect.any(Number) }
  ]);
  expect(await first.boundingBox()).not.toEqual(await second.boundingBox());
  await first.click();
  await second.click();
  await expect(first).toHaveAttribute('aria-pressed', 'true');
  await expect(second).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#dataMenuSummary').click();
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#exportDataButton').click();
  const exported = JSON.parse(await readFile(await (await downloadPromise).path(), 'utf8'));
  expect(exported.settings.pageBreaks.en.LETTER.resume.records).toEqual(['record_first', 'record_second']);
  await page.locator('[data-en-list="experience"] [data-en-item]').nth(1).locator('[data-en-item-field="endDate"]').fill('2024-01');
  await expect(page.locator('[data-record-id="record_first"]')).toHaveClass(/has-manual-page-break/);
  await expect(page.locator('[data-record-id="record_second"]')).toHaveClass(/has-manual-page-break/);
});

test('desktop: active classes follow English paper size and Japanese document type', async ({ page }) => {
  const state = createEnglishSampleState(createDefaultState('en'));
  state.settings.pageBreaks.en.LETTER.resume.sections = ['summary'];
  state.settings.pageBreaks.en.A4.resume.sections = ['experience'];
  state.settings.pageBreaks.ja.A4.resume.sections = ['qualifications'];
  state.settings.pageBreaks.ja.A4.career.sections = ['career-history'];
  await openLocale(page, 'en');
  await page.locator('#importDataInput').setInputFiles({
    name: 'isolated-breaks.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(state))
  });
  await page.locator('#confirmSampleAdoptButton').click();
  await expect(page.locator('[data-section-key="summary"]')).toHaveClass(/has-manual-page-break/);
  await page.locator('[data-en-page-size]').selectOption('A4');
  await expect(page.locator('[data-section-key="experience"]')).toHaveClass(/has-manual-page-break/);
  await expect(page.locator('[data-section-key="summary"]')).not.toHaveClass(/has-manual-page-break/);
  await page.locator('#localeSelect').selectOption('ja');
  await openDesktopPageBreakMode(page, '#japaneseWorkspace');
  const qualifications = page.locator('.page-break-boundary[data-page-break-key="qualifications"]');
  await expect(qualifications).toContainText('解除');
  await expect(qualifications).toHaveAttribute('aria-label', '学歴・職歴の後、免許・資格の前に改ページを解除');
  await expect(page.locator('[data-section-key="qualifications"]')).toHaveClass(/has-manual-page-break/);
  await page.locator('#careerDocumentTab').click();
  await expect(page.locator('.page-break-boundary[data-page-break-key="career-history"]')).toContainText('解除');
  await expect(page.locator('[data-section-key="career-history"]')).toHaveClass(/has-manual-page-break/);
});

test('desktop: rail realigns after Japanese zoom transitions', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openLocale(page, 'ja');
  await page.locator('#loadSampleButton').click();
  await openDesktopPageBreakMode(page, '#japaneseWorkspace');
  const boundary = page.locator('.page-break-boundary[data-page-break-key="qualifications"]');
  await expect(boundary).toBeVisible();
  await page.locator('#zoomOutButton').click();
  await page.waitForTimeout(260);
  await expect.poll(() => boundary.evaluate((element) => {
    const target = document.querySelector('[data-section-key="qualifications"]');
    const pageBox = target.closest('.document-page');
    const scale = pageBox.getBoundingClientRect().width / pageBox.offsetWidth;
    const button = element.getBoundingClientRect();
    const targetBox = target.getBoundingClientRect();
    const paper = pageBox.getBoundingClientRect();
    return Math.abs(button.left - (paper.right + Math.max(12, 16 * scale))) < 3
      && Math.abs(button.top - (targetBox.top - 11 * scale)) < 3;
  })).toBe(true);
});

test('responsive and locale changes close stale pagination surfaces and keep ARIA controls accurate', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 900 });
  await openLocale(page, 'en');
  await page.locator('[data-en-load-sample]').click();
  await openDesktopPageBreakMode(page, '[data-english-editor]');
  await expect(page.locator('#page-break-rail-en')).toBeVisible();
  await page.locator('#localeSelect').selectOption('ja');
  await expect(page.locator('#page-break-rail-en')).toBeHidden();
  await page.locator('#loadSampleButton').click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('[data-mobile-view="preview"]').click();
  const trigger = page.locator('#japaneseWorkspace [data-page-break-mode-toggle]');
  const panel = page.locator('#page-break-panel-ja');
  await expect(trigger).toHaveAttribute('aria-controls', 'page-break-panel-ja');
  await trigger.click();
  await expect(panel).toBeVisible();
  await page.setViewportSize({ width: 1024, height: 900 });
  await expect(panel).toBeHidden();
  await expect(page.locator('#page-break-rail-ja')).toBeHidden();
  await expect(trigger).toHaveAttribute('aria-controls', 'page-break-rail-ja');
});
