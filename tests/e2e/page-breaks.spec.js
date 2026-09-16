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

test('desktop: edit mode aligns paper-wide boundaries with paper-exterior icons and short tooltips', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await openLocale(page, 'en');
  const state = createEnglishSampleState(createDefaultState('en'));
  await page.locator('#importDataInput').setInputFiles({
    name: 'page-break-persistence.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(state))
  });
  await page.locator('#confirmSampleAdoptButton').click();
  const trigger = page.locator('[data-english-editor] [data-page-break-mode-toggle]');
  const boundary = page.locator('.page-break-boundary[data-page-break-key="summary"]');
  await expect(trigger).toHaveAttribute('aria-pressed', 'false');
  await expect(boundary).toHaveCount(0);
  await openDesktopPageBreakMode(page, '[data-english-editor]');
  await expect(boundary).toBeVisible();
  await expect(boundary).toHaveAttribute('aria-pressed', 'false');
  await expect.poll(() => boundary.evaluate((element) => {
    const button = element.getBoundingClientRect();
    const paper = document.querySelector('[data-en-preview] [data-section-key="summary"]').closest('.document-page').getBoundingClientRect();
    const target = document.querySelector('[data-en-preview] [data-section-key="summary"]').getBoundingClientRect();
    const previous = document.querySelector('[data-en-preview] [data-section-key="identity"]').getBoundingClientRect();
    const boundary = element.closest('.page-break-visual-boundary').getBoundingClientRect();
    return button.left >= paper.right + 4 && (button.left + button.width / 2) < innerWidth
      && Math.abs(boundary.left - paper.left) < 2 && Math.abs(boundary.width - paper.width) < 2
      && boundary.top >= previous.bottom && boundary.bottom <= target.top - 3;
  })).toBe(true);
  for (const width of [821, 900, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect.poll(() => boundary.evaluate((element) => {
      const button = element.getBoundingClientRect();
      const paper = document.querySelector('[data-en-preview] [data-section-key="summary"]').closest('.document-page').getBoundingClientRect();
      const target = document.querySelector('[data-en-preview] [data-section-key="summary"]').getBoundingClientRect();
      const boundary = element.closest('.page-break-visual-boundary').getBoundingClientRect();
      const hit = document.elementFromPoint(button.left + button.width / 2, button.top + button.height / 2);
      const sign = element.querySelector('.page-break-sign').getBoundingClientRect();
      const exterior = innerWidth >= 1024 ? button.left >= paper.right + 4 : sign.left >= Math.min(paper.right, innerWidth) - 15;
      const previous = document.querySelector('[data-en-preview] [data-section-key="identity"]').getBoundingClientRect();
      return exterior && (button.left + button.width / 2) < innerWidth
        && boundary.top >= previous.bottom && boundary.bottom <= target.top - 3
        && hit?.closest('.page-break-boundary') === element;
    })).toBe(true);
  }
  await boundary.hover();
  await expect(page.locator('[data-section-key="summary"]')).toHaveClass(/page-break-target-highlight/);
  await expect(boundary.locator('.page-break-tooltip')).toHaveCSS('opacity', '1');
  await expect.poll(() => boundary.evaluate((element) => {
    const line = element.closest('.page-break-visual-boundary').querySelector('.page-break-boundary-line').getBoundingClientRect();
    const target = document.querySelector('[data-en-preview] [data-section-key="summary"]').getBoundingClientRect();
    return line.bottom <= target.top - 3;
  })).toBe(true);
  await clickVisible(page, boundary);
  await expect(boundary).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-section-key="summary"]')).toHaveClass(/has-manual-page-break/);
  await expect(boundary).toHaveAttribute('aria-label', 'Remove page break between Contact information and Summary');
  await expect(page.locator('.page-break-feedback:not([hidden])')).toContainText('The PDF will start this content on a new page.');
  const undo = page.locator('.page-break-undo');
  await expect(undo).toBeVisible();
  await undo.click();
  await expect(page.locator('[data-section-key="summary"]')).not.toHaveClass(/has-manual-page-break/);
  await clickVisible(page, boundary);
  await expect(page.locator('[data-section-key="summary"]')).toHaveClass(/has-manual-page-break/);
  await trigger.click();
  await expect(trigger).toHaveAttribute('aria-pressed', 'false');
  await expect(boundary).toHaveCount(0);
  await expect(page.locator('#page-break-overlay-en .page-break-passive-marker[data-page-break-key="summary"]')).toBeVisible();
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

test('narrow desktop: Japanese and Chinese retain every paper-exterior boundary icon', async ({ page }) => {
  const locales = [
    { locale: 'ja', workspace: '#japaneseWorkspace', sample: '#loadSampleButton', key: 'qualifications' },
    { locale: 'zh-CN', workspace: '#chineseWorkspace', sample: '[data-zh-action="sample"]', key: 'summary' }
  ];
  for (const width of [821, 900]) {
    for (const item of locales) {
      await page.setViewportSize({ width, height: 900 });
      await openLocale(page, item.locale);
      await page.locator(item.sample).click();
      await page.waitForTimeout(260);
      const scaleBeforeEdit = await page.locator(`${item.workspace} .document-page`).evaluate((paper) => (
        paper.getBoundingClientRect().width / paper.offsetWidth
      ));
      const trigger = page.locator(`${item.workspace} [data-page-break-mode-toggle]`);
      const panel = page.locator(`#page-break-panel-${item.locale}`);
      const overlay = page.locator(`#page-break-overlay-${item.locale}`);
      await trigger.click();
      await expect(trigger).toHaveAttribute('aria-pressed', 'true');
      await expect(trigger).toHaveAttribute('aria-expanded', 'false');
      await expect(trigger).toHaveAttribute('aria-controls', `page-break-overlay-${item.locale}`);
      await expect(panel).toBeHidden();
      expect(await page.locator(`${item.workspace} .document-page`).evaluate((paper) => (
        paper.getBoundingClientRect().width / paper.offsetWidth
      ))).toBeCloseTo(scaleBeforeEdit, 3);
      const boundary = overlay.locator(`.page-break-boundary[data-page-break-key="${item.key}"]`);
      await expect(boundary).toBeVisible();
      await expect.poll(() => boundary.evaluate((element) => {
        const box = element.getBoundingClientRect();
        const paper = document.querySelector('.workspace:not([hidden]) .document-page, .workspace:not([hidden]) .zh-resume-document')?.getBoundingClientRect();
        const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
        const sign = element.querySelector('.page-break-sign')?.getBoundingClientRect();
        const visiblePaperRight = Math.min(paper?.right || 0, innerWidth);
        return Boolean(paper) && Boolean(sign) && (box.left + box.width / 2) < innerWidth
          && sign.left >= visiblePaperRight - 15
          && hit?.closest('.page-break-boundary') === element;
      })).toBe(true);
      await boundary.click();
      await expect(boundary).toHaveAttribute('aria-pressed', 'true');
      await trigger.click();
      await expect(trigger).toHaveAttribute('aria-pressed', 'false');
      const passive = overlay.locator(`.page-break-passive-marker[data-page-break-key="${item.key}"]`);
      await expect(passive).toBeVisible();
      await expect.poll(() => passive.evaluate((element) => {
        const marker = element.getBoundingClientRect();
        const paper = document.querySelector('.workspace:not([hidden]) .document-page, .workspace:not([hidden]) .zh-resume-document')?.getBoundingClientRect();
        const visiblePaperRight = Math.min(paper?.right || 0, innerWidth);
        const line = element.closest('.page-break-visual-boundary')?.querySelector('.page-break-boundary-line')?.getBoundingClientRect();
        return Boolean(line) && marker.left < innerWidth && marker.right > 0
          && marker.left >= visiblePaperRight - 15;
      })).toBe(true);
    }
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.locator('#page-break-panel-zh-CN')).toBeHidden();
  await expect(page.locator('#page-break-overlay-zh-CN')).toBeVisible();
  await expect(page.locator('#chineseWorkspace [data-page-break-mode-toggle]')).toHaveAttribute('aria-controls', 'page-break-overlay-zh-CN');
});

test('narrow desktop: English icons have independent hit targets without a text rail', async ({ page }) => {
  for (const width of [900, 950]) {
    await page.setViewportSize({ width, height: 900 });
    await openLocale(page, 'en');
    await page.locator('[data-en-load-sample]').click();
    const trigger = await openDesktopPageBreakMode(page, '[data-english-editor]');
    const overlay = page.locator('#page-break-overlay-en');
    const boundaries = overlay.locator('.page-break-boundary');
    await expect(overlay).toBeVisible();
    await expect(page.locator('#page-break-panel-en')).toBeHidden();
    await expect(trigger).toHaveAttribute('aria-controls', 'page-break-overlay-en');
    const keys = await boundaries.evaluateAll((controls) => controls.map((control) => control.dataset.pageBreakKey));
    expect(keys.length).toBeGreaterThan(1);
    await expect.poll(() => boundaries.evaluateAll((controls) => controls.every((control) => {
      const box = control.getBoundingClientRect();
      const paper = document.querySelector('[data-en-preview] .document-page')?.getBoundingClientRect();
      const hit = document.elementFromPoint(box.left + (box.width / 2), box.top + (box.height / 2));
      const sign = control.querySelector('.page-break-sign')?.getBoundingClientRect();
      const visiblePaperRight = Math.min(paper?.right || 0, innerWidth);
      return Boolean(paper) && Boolean(sign)
        && (box.left + box.width / 2) < innerWidth && sign.left >= visiblePaperRight - 15
        && box.top >= 0 && box.bottom <= innerHeight
        && hit?.closest('.page-break-boundary') === control;
    }))).toBe(true);
    for (const key of keys) {
      const boundary = overlay.locator(`.page-break-boundary[data-page-break-key="${key}"]`);
      await boundary.click();
      await expect(boundary).toHaveAttribute('aria-pressed', 'true');
    }
  }
});

test('narrow desktop: Chinese adjacent boundary hit regions resolve to their own marker', async ({ page }) => {
  for (const width of [821, 900]) {
    await page.setViewportSize({ width, height: 900 });
    await openLocale(page, 'zh-CN');
    await page.locator('[data-zh-action="sample"]').click();
    await openDesktopPageBreakMode(page, '#chineseWorkspace');
    const controls = page.locator('#page-break-overlay-zh-CN .page-break-boundary');
    await expect.poll(() => controls.evaluateAll((elements) => {
      const controls = elements.map((element) => ({
        element,
        box: element.getBoundingClientRect(),
        sign: element.querySelector('.page-break-sign')?.getBoundingClientRect()
      }));
      if (controls.length < 2 || controls.some((control) => !control.sign)) return false;
      const ownVisualHit = controls.every(({ element, sign }) => (
        document.elementFromPoint(sign.left + sign.width / 2, sign.top + sign.height / 2)?.closest('.page-break-boundary') === element
      ));
      const overlappingPairsResolve = controls.every((current, index) => controls.slice(index + 1).every((other) => {
        const left = Math.max(current.box.left, other.box.left);
        const right = Math.min(current.box.right, other.box.right);
        const top = Math.max(current.box.top, other.box.top);
        const bottom = Math.min(current.box.bottom, other.box.bottom);
        if (left >= right || top >= bottom) return true;
        const x = (left + right) / 2;
        const upper = current.box.top < other.box.top ? current : other;
        const lower = upper === current ? other : current;
        const midpoint = (upper.box.top + 15 + lower.box.top + 15) / 2;
        const upperHit = document.elementFromPoint(x, Math.max(top + .5, midpoint - 1))?.closest('.page-break-boundary');
        const lowerHit = document.elementFromPoint(x, Math.min(bottom - .5, midpoint + 1))?.closest('.page-break-boundary');
        const upperClip = getComputedStyle(upper.element).clipPath;
        const lowerClip = getComputedStyle(lower.element).clipPath;
        return upperHit === upper.element && lowerHit === lower.element && upperClip !== 'none' && lowerClip !== 'none';
      }));
      return ownVisualHit && overlappingPairsResolve;
    })).toBe(true);
  }
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
  await page.evaluate(() => window.dispatchEvent(new Event('resize')));
  await page.waitForTimeout(50);
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
    { id: 'record_lead', company: 'Lead fictional employer', role: 'Lead role', startDate: '2023-01', endDate: '2024-01', details: 'Fictional lead achievement.' },
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
  await page.locator('[data-en-list="experience"] [data-en-item]').nth(2).locator('[data-en-item-field="endDate"]').fill('2024-01');
  await expect(page.locator('[data-record-id="record_other"]')).toHaveText(/Other fictional employer/);
  await expect(page.locator('[data-record-id="record_target"]')).toHaveClass(/has-manual-page-break/);
  await expect(page.locator('.page-break-boundary[data-page-break-key="record:record_target"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-section-key="experience"]')).not.toHaveClass(/has-manual-page-break/);
});

test('desktop: short English record markers have independent hit targets and save their own IDs', async ({ page }) => {
  const state = createDefaultState('en');
  state.documents.en.resume.experience = [
    { id: 'record_first', company: 'First fictional employer', role: 'First role', startDate: '2023-01', endDate: '2024-01', details: 'First fictional achievement.' },
    { id: 'record_second', company: 'Second fictional employer', role: 'Second role', startDate: '2021-01', endDate: '2022-01', details: 'Second fictional achievement.' },
    { id: 'record_third', company: 'Third fictional employer', role: 'Third role', startDate: '2020-01', endDate: '2021-01', details: 'Third fictional achievement.' }
  ];
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openLocale(page, 'en');
  await page.locator('#importDataInput').setInputFiles({
    name: 'fictional-record-hit-targets.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(state))
  });
  await page.locator('#confirmSampleAdoptButton').click();
  await openDesktopPageBreakMode(page, '[data-english-editor]');
  const second = page.locator('.page-break-boundary[data-page-break-key="record:record_second"]');
  const third = page.locator('.page-break-boundary[data-page-break-key="record:record_third"]');
  await expect(page.locator('.page-break-boundary[data-page-break-key="record:record_first"]')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => [...document.querySelectorAll('.page-break-record-boundary')].map((element) => {
    const box = element.getBoundingClientRect();
    const hit = document.elementFromPoint(box.left + (box.width / 2), box.top + (box.height / 2));
    return { key: element.dataset.pageBreakKey, hit: hit?.closest('.page-break-boundary')?.dataset.pageBreakKey, top: box.top };
  }))).toEqual([
    { key: 'record:record_second', hit: 'record:record_second', top: expect.any(Number) },
    { key: 'record:record_third', hit: 'record:record_third', top: expect.any(Number) }
  ]);
  expect(await second.boundingBox()).not.toEqual(await third.boundingBox());
  await second.click();
  await third.click();
  await expect(second).toHaveAttribute('aria-pressed', 'true');
  await expect(third).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#dataMenuSummary').click();
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#exportDataButton').click();
  const exported = JSON.parse(await readFile(await (await downloadPromise).path(), 'utf8'));
  expect(exported.settings.pageBreaks.en.LETTER.resume.records).toEqual(['record_second', 'record_third']);
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

test('desktop: boundary geometry realigns after Japanese zoom transitions', async ({ page }) => {
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
    const button = element.getBoundingClientRect();
    const targetBox = target.getBoundingClientRect();
    const boundary = element.closest('.page-break-visual-boundary').getBoundingClientRect();
    const previousBox = document.querySelector('[data-section-key="history"]').getBoundingClientRect();
    return boundary.top >= previousBox.bottom && boundary.bottom <= targetBox.top - 3 && button.left >= boundary.right + 4;
  })).toBe(true);
});

test('desktop: zoom keeps the same icon surface instead of falling back to a desktop panel', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openLocale(page, 'ja');
  await page.locator('#loadSampleButton').click();
  const trigger = await openDesktopPageBreakMode(page, '#japaneseWorkspace');
  const overlay = page.locator('#page-break-overlay-ja');
  const panel = page.locator('#page-break-panel-ja');
  await expect(overlay).toBeVisible();
  await page.locator('#zoomInButton').click();
  await page.locator('#zoomInButton').click();
  await expect(panel).toBeHidden();
  await expect(overlay.locator('.page-break-boundary[data-page-break-key="qualifications"]')).toBeVisible();
  await expect(trigger).toHaveAttribute('aria-controls', 'page-break-overlay-ja');
  await page.locator('#zoomOutButton').click();
  await page.locator('#zoomOutButton').click();
  await expect(panel).toBeHidden();
  await expect(overlay).toBeVisible();
  await expect(trigger).toHaveAttribute('aria-controls', 'page-break-overlay-ja');
});

test('responsive and locale changes close stale pagination surfaces and keep ARIA controls accurate', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openLocale(page, 'en');
  await page.locator('[data-en-load-sample]').click();
  await openDesktopPageBreakMode(page, '[data-english-editor]');
  await expect(page.locator('#page-break-overlay-en')).toBeVisible();
  await page.locator('#localeSelect').selectOption('ja');
  await expect(page.locator('#page-break-overlay-en')).toBeHidden();
  await page.locator('#loadSampleButton').click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('[data-mobile-view="preview"]').click();
  const trigger = page.locator('#japaneseWorkspace [data-page-break-mode-toggle]');
  const panel = page.locator('#page-break-panel-ja');
  await expect(trigger).toHaveAttribute('aria-controls', 'page-break-panel-ja');
  await trigger.click();
  await expect(panel).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(panel).toBeHidden();
  await expect(page.locator('#page-break-overlay-ja')).toBeHidden();
  await expect(trigger).toHaveAttribute('aria-controls', 'page-break-overlay-ja');
});
