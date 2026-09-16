import { readFile } from 'node:fs/promises';

import { expect, openLocale, test } from './fixtures.js';
import { createDefaultState } from '../../site/assets/js/state/defaults.js';
import { createEnglishSampleState } from '../../site/assets/js/data/en-sample.js';

async function clickVisible(_page, locator) {
  await expect(locator).toBeVisible();
  await locator.click();
}

async function openDesktopPageBreakMode(page, rootSelector) {
  const trigger = page.locator(`${rootSelector} [data-page-break-mode-toggle]`);
  await trigger.click();
  await expect(trigger).toHaveAttribute('aria-pressed', 'true');
  return trigger;
}

async function ensureChineseMobilePreview(page) {
  const workspace = page.locator('#chineseWorkspace');
  if (await workspace.getAttribute('data-mobile-mode') === 'preview') return;
  const previewButton = workspace.locator('[data-zh-mobile-view="preview"]');
  await expect(previewButton).toBeVisible();
  await previewButton.click();
  await expect(workspace).toHaveAttribute('data-mobile-mode', 'preview');
}

async function centerChinesePreviewTarget(page, key) {
  const previewScroll = page.locator('[data-zh-preview-scroll]');
  await previewScroll.evaluate(async (scroll, targetKey) => {
    const target = scroll.querySelector(`[data-section-key="${targetKey}"]`);
    if (!target) throw new Error(`Missing preview target: ${targetKey}`);
    const scrollBox = scroll.getBoundingClientRect();
    const targetBox = target.getBoundingClientRect();
    scroll.scrollBy({ top: targetBox.top - scrollBox.top - (scrollBox.height / 2) + (targetBox.height / 2) });
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }, key);
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
  await expect(boundary).toHaveAttribute('aria-label', /Position 1 of \d+, before Summary, Set/);
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

test('desktop: pagination rail uses one Tab stop, arrow navigation, detailed status, and the all-positions panel', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openLocale(page, 'en');
  await page.locator('[data-en-load-sample]').click();
  const trigger = page.locator('[data-english-editor] [data-page-break-mode-toggle]');
  await expect(trigger).toHaveAttribute('aria-label', /Edit page breaks, \d+ candidates/);
  await trigger.press('Enter');
  const overlay = page.locator('#page-break-overlay-en');
  const rail = overlay.getByRole('toolbar', { name: 'Page break position candidates' });
  const candidates = rail.locator('.page-break-boundary');
  await expect(overlay).toHaveAttribute('aria-hidden', 'false');
  expect(await candidates.count()).toBeGreaterThan(1);
  await expect(rail.locator('.page-break-boundary[tabindex="0"]')).toHaveCount(1);
  await expect(candidates.first()).toBeFocused();
  await page.keyboard.press('ArrowDown');
  const selected = candidates.nth(1);
  await expect(selected).toBeFocused();
  await expect(selected).toHaveAttribute('aria-label', /Position 2 of \d+, before .+, Not set/);
  await page.keyboard.press('Enter');
  await expect(selected).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#statusAnnouncer')).toHaveText(/Position 2 of \d+, before .+, Set/);
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveAttribute('aria-pressed', 'false');
  await trigger.press('Enter');
  const allPositions = page.locator('.page-break-all-positions');
  await expect(allPositions).toBeVisible();
  await allPositions.click();
  const panel = page.locator('#page-break-panel-en');
  await expect(panel).toBeVisible();
  const panelRow = panel.locator('.page-break-row').nth(1);
  await panelRow.focus();
  await expect(page.locator('[data-en-preview] [data-section-key="experience"]')).toHaveClass(/page-break-target-highlight/);
  await panelRow.press('Space');
  await expect(panelRow).toHaveAttribute('aria-pressed', 'false');
});

test('desktop: a context switch resets the roving entry when its focused candidate no longer exists', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openLocale(page, 'ja');
  await page.locator('#loadSampleButton').click();
  const trigger = page.locator('#japaneseWorkspace [data-page-break-mode-toggle]');
  await page.locator('#careerDocumentTab').click();
  await trigger.click();
  const careerCandidate = page.locator('#page-break-overlay-ja .page-break-boundary[data-page-break-key="self-promotion"]');
  await careerCandidate.focus();
  await expect(careerCandidate).toBeFocused();
  await page.locator('#resumeDocumentTab').click();
  if (await trigger.getAttribute('aria-pressed') !== 'true') await trigger.click();
  const rail = page.locator('#page-break-overlay-ja [role="toolbar"]');
  await expect(rail.locator('.page-break-boundary[tabindex="0"]')).toHaveCount(1);
  const allPositions = page.locator('.page-break-all-positions');
  await allPositions.click();
  await expect(page.locator('#page-break-panel-ja .page-break-row[tabindex="0"]')).toHaveCount(1);
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
      await expect(trigger).toHaveAttribute('aria-expanded', 'true');
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

test('desktop: later Chinese and English records anchor their line to the physical previous record', async ({ page }) => {
  const locales = [
    { locale: 'zh-CN', workspace: '#chineseWorkspace', sample: '[data-zh-action="sample"]' },
    { locale: 'en', workspace: '[data-english-editor]', sample: '[data-en-load-sample]' }
  ];
  await page.setViewportSize({ width: 1440, height: 1000 });
  for (const item of locales) {
    await openLocale(page, item.locale);
    await page.locator(item.sample).click();
    await openDesktopPageBreakMode(page, item.workspace);
    const control = page.locator(`#page-break-overlay-${item.locale} .page-break-record-boundary`).first();
    await expect(control).toBeVisible();
    await expect.poll(() => control.evaluate((element) => {
      const key = element.dataset.pageBreakKey?.replace('record:', '');
      const target = document.querySelector(`[data-record-id="${key}"]`);
      const records = [...target?.closest('[data-section-key]')?.querySelectorAll('[data-record-id]') || []];
      const targetIndex = records.indexOf(target);
      const previous = records[targetIndex - 1];
      const line = element.closest('.page-break-visual-boundary')?.querySelector('.page-break-boundary-line')?.getBoundingClientRect();
      const marker = element.getBoundingClientRect();
      if (!target || !previous || !line) return false;
      const targetBox = target.getBoundingClientRect();
      const previousBox = previous.getBoundingClientRect();
      const midpoint = (previousBox.bottom + targetBox.top) / 2;
      return previousBox.bottom < line.top && line.top <= midpoint
        && line.bottom <= targetBox.top - 2
        && Math.abs((marker.top + marker.height / 2) - line.top) < 1;
    })).toBe(true);
  }
});

test('[mobile][mobile-webkit] smartphone: supplemental rows use one Tab stop and hand the selection to the action bar', async ({ page }) => {
  await openLocale(page, 'zh-CN');
  await page.locator('[data-zh-action="sample"]').click();
  await page.locator('[data-zh-mobile-view="preview"]').click();
  const workspace = page.locator('#chineseWorkspace');
  const trigger = workspace.locator('.page-break-menu');
  const panelToggle = workspace.locator('.page-break-panel-toggle');
  const panel = workspace.locator('#page-break-panel-zh-CN');
  await expect(panel).toBeHidden();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await trigger.press('Enter');
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await expect(panelToggle).toBeFocused();
  await panelToggle.press('Enter');
  const rows = panel.locator('.page-break-row');
  await expect(panel).toBeVisible();
  await expect(panelToggle).toHaveAttribute('aria-expanded', 'true');
  await expect(panel.locator('.page-break-row[tabindex="0"]')).toHaveCount(1);
  await expect(rows.first()).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(rows.nth(1)).toBeFocused();
  await expect(panel.locator('.page-break-row[tabindex="0"]')).toHaveCount(1);
  await page.keyboard.press('Enter');
  const actionBar = page.locator('.page-break-action-bar:not([hidden])');
  const action = actionBar.locator('.page-break-action');
  const target = page.locator('[data-section-key="experience"]');
  await expect(actionBar).toBeVisible();
  await expect(action).toBeFocused();
  await expect(target).toHaveClass(/page-break-target-highlight/);
  await panelToggle.focus();
  await page.keyboard.press('Enter');
  await expect(panel).toBeVisible();
  await expect(rows.nth(1)).toBeFocused();
  await page.keyboard.press('ArrowDown');
  const replacement = rows.nth(2);
  const replacementKey = await replacement.getAttribute('data-page-break-key');
  await expect(replacement).toBeFocused();
  await page.keyboard.press('Enter');
  const replacementTarget = replacementKey?.startsWith('record:')
    ? page.locator(`[data-record-id="${replacementKey.slice('record:'.length)}"]`)
    : page.locator(`[data-section-key="${replacementKey}"]`);
  const selectedMarkers = page.locator('#page-break-overlay-zh-CN .page-break-visual-boundary.is-selected');
  await expect(target).not.toHaveClass(/page-break-target-highlight/);
  await expect(replacementTarget).toHaveClass(/page-break-target-highlight/);
  await expect(selectedMarkers).toHaveCount(1);
  await expect(selectedMarkers).toHaveAttribute('data-page-break-key', replacementKey || '');
  await expect(action).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#statusAnnouncer')).toHaveText(/位置 \d+ \/ \d+、.+之前、已设置/);
  await expect(replacementTarget).not.toHaveClass(/page-break-target-highlight/);
  await page.keyboard.press('Escape');
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await expect(trigger).toBeFocused();
});

test('[mobile] Japanese mobile panel is closed by default and uses a single roving Tab stop when opened', async ({ page }) => {
  await openLocale(page, 'ja');
  await page.locator('#loadSampleButton').click();
  await page.locator('[data-mobile-view="preview"]').click();
  const workspace = page.locator('#japaneseWorkspace');
  const trigger = workspace.locator('[data-page-break-mode-toggle]');
  const panelToggle = workspace.locator('.page-break-panel-toggle');
  const panel = workspace.locator('#page-break-panel-ja');
  await expect(panel).toBeHidden();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await expect(trigger).toHaveAttribute('aria-pressed', 'false');
  await expect(trigger).toHaveText('改ページを編集');
  await trigger.press('Enter');
  await expect(panelToggle).toBeVisible();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await expect(trigger).toHaveAttribute('aria-pressed', 'true');
  await panelToggle.press('Enter');
  const rows = panel.locator('.page-break-row');
  expect(await rows.count()).toBeGreaterThan(1);
  await expect(panel.locator('.page-break-row[tabindex="0"]')).toHaveCount(1);
  await expect(rows.first()).toBeFocused();
  await page.keyboard.press('End');
  await expect(rows.last()).toBeFocused();
  await expect(panel.locator('.page-break-row[tabindex="0"]')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  await expect(panelToggle).toBeFocused();
});

test('[mobile][mobile-webkit] smartphone markers select a boundary before the bottom action confirms it', async ({ page }) => {
  await openLocale(page, 'zh-CN');
  await page.locator('[data-zh-action="sample"]').click();
  await page.locator('[data-zh-mobile-view="preview"]').click();
  const workspace = page.locator('#chineseWorkspace');
  const trigger = workspace.locator('.page-break-menu');
  await trigger.press('Enter');
  const marker = page.locator('#page-break-overlay-zh-CN .page-break-boundary[data-page-break-key="summary"]');
  await expect(marker).toBeVisible();
  await expect(marker).toHaveAttribute('aria-pressed', 'false');
  await marker.press('Space');
  await expect(marker).toHaveAttribute('aria-pressed', 'false');
  await expect(marker.locator('xpath=..')).toHaveClass(/is-selected/);
  const actionBar = page.locator('.page-break-action-bar:not([hidden])');
  await expect(actionBar).toBeVisible();
  await expect(actionBar).toContainText('个人概述之前');
  await expect(actionBar.locator('.page-break-action')).toHaveText('从新页面开始');
  await expect(page.locator('[data-section-key="summary"]')).not.toHaveClass(/has-manual-page-break/);
  await actionBar.locator('.page-break-action').click();
  await expect(actionBar).toBeHidden();
  await expect(page.locator('[data-section-key="summary"]')).toHaveClass(/has-manual-page-break/);
  await expect(page.locator('#statusAnnouncer')).toHaveText(/位置 \d+ \/ \d+、.+之前、已设置/);
  await marker.press('Space');
  await expect(actionBar.locator('.page-break-action')).toHaveText('取消分页');
  await actionBar.locator('.page-break-action').click();
  await expect(page.locator('[data-section-key="summary"]')).not.toHaveClass(/has-manual-page-break/);
  await expect(page.locator('#statusAnnouncer')).toHaveText(/位置 \d+ \/ \d+、.+之前、未设置/);
  await page.locator('.page-break-undo').click();
  await expect(page.locator('[data-section-key="summary"]')).toHaveClass(/has-manual-page-break/);
});

test('[mobile][mobile-webkit] 320–390px portrait and landscape keep a full touch target and action bar on screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openLocale(page, 'zh-CN');
  await page.locator('[data-zh-action="sample"]').click();
  await ensureChineseMobilePreview(page);
  for (const viewport of [{ width: 320, height: 650 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport);
    await centerChinesePreviewTarget(page, 'summary');
    const trigger = page.locator('#chineseWorkspace .page-break-menu');
    await trigger.click();
    const marker = page.locator('#page-break-overlay-zh-CN .page-break-boundary[data-page-break-key="summary"]');
    const trustCapsule = page.locator('#trustCapsule');
    await expect(marker).toBeVisible();
    await expect(trustCapsule).toBeHidden();
    await expect.poll(() => marker.evaluate((element) => {
      const marker = element.getBoundingClientRect();
      const line = element.closest('.page-break-visual-boundary')?.querySelector('.page-break-boundary-line')?.getBoundingClientRect();
      return Boolean(line) && marker.width >= 44 && marker.height >= 44
        && marker.left >= 0 && marker.right <= innerWidth
        && marker.top >= 0 && marker.bottom <= innerHeight
        && Math.abs((marker.top + marker.height / 2) - line.top) < 1
        && document.elementFromPoint(marker.left + marker.width / 2, marker.top + marker.height / 2)?.closest('.page-break-boundary') === element;
    })).toBe(true);
    await marker.tap();
    const bar = page.locator('.page-break-action-bar:not([hidden])');
    await expect(bar).toBeVisible();
    await expect.poll(() => bar.evaluate((element) => {
      const box = element.getBoundingClientRect();
      const action = element.querySelector('.page-break-action')?.getBoundingClientRect();
      const hit = action && document.elementFromPoint(action.left + action.width / 2, action.top + action.height / 2);
      return Boolean(action) && box.left >= 0 && box.right <= innerWidth && box.bottom <= innerHeight
        && action.width >= 44 && action.height >= 44 && hit?.closest('.page-break-action') === element.querySelector('.page-break-action');
    })).toBe(true);
    await trigger.click();
    await expect(trustCapsule).toBeVisible();
  }
});

test('[mobile][mobile-webkit] supplemental panel hands a selection to the bottom action bar without changing state', async ({ page }) => {
  await openLocale(page, 'zh-CN');
  await page.locator('[data-zh-action="sample"]').click();
  await page.locator('[data-zh-mobile-view="preview"]').click();
  const workspace = page.locator('#chineseWorkspace');
  const trigger = workspace.locator('.page-break-menu');
  const panelToggle = workspace.locator('.page-break-panel-toggle');
  const summary = workspace.locator('.page-break-row[data-page-break-key="summary"]');
  await trigger.tap();
  await expect(panelToggle).toBeVisible();
  await panelToggle.tap();
  await expect(summary).toBeVisible();
  await summary.tap();
  await expect(page.locator('[data-section-key="summary"]')).not.toHaveClass(/has-manual-page-break/);
  await expect(page.locator('.page-break-action-bar:not([hidden])')).toBeVisible();
  await page.locator('.page-break-action-bar:not([hidden]) .page-break-action').tap();
  await expect(page.locator('[data-section-key="summary"]')).toHaveClass(/has-manual-page-break/);
});

test('[mobile][mobile-webkit] selected mobile boundary survives geometry changes and closes safely when its locale becomes inactive', async ({ page }) => {
  await openLocale(page, 'zh-CN');
  await page.locator('[data-zh-action="sample"]').click();
  await page.locator('[data-zh-mobile-view="preview"]').click();
  const workspace = page.locator('#chineseWorkspace');
  const trigger = workspace.locator('.page-break-menu');
  await trigger.click();
  const marker = page.locator('#page-break-overlay-zh-CN .page-break-boundary[data-page-break-key="summary"]');
  await marker.click();
  const actionBar = page.locator('.page-break-action-bar:not([hidden])');
  await expect(actionBar).toBeVisible();
  await expect(actionBar).toContainText('个人概述之前');
  await centerChinesePreviewTarget(page, 'summary');
  const zoomLabel = workspace.locator('[data-zh-zoom-label]');
  const zoomBefore = await zoomLabel.textContent();
  await workspace.locator('[data-zh-action="zoom-in"]').click();
  await expect(zoomLabel).not.toHaveText(zoomBefore || '');
  await expect.poll(() => page.locator('#page-break-overlay-zh-CN .page-break-visual-boundary.is-selected').evaluate((boundary) => {
    const action = document.querySelector('.page-break-action-bar:not([hidden])');
    return boundary.dataset.pageBreakKey === 'summary' && action?.textContent?.includes('个人概述之前');
  })).toBe(true);
  await page.setViewportSize({ width: 844, height: 390 });
  await expect(marker.locator('xpath=..')).toHaveClass(/is-selected/);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(marker.locator('xpath=..')).toHaveClass(/is-selected/);
  await page.locator('#localeSelect').selectOption('en');
  await expect(page.locator('.page-break-action-bar:not([hidden])')).toHaveCount(0);
  await expect(page.locator('#trustCapsule')).toBeVisible();
  await expect(page.locator('body')).not.toHaveAttribute('data-page-break-editing-locale');
});

test('[mobile][mobile-webkit] a desktop breakpoint hides mobile pagination controls without discarding its selected boundary', async ({ page }) => {
  await openLocale(page, 'zh-CN');
  await page.locator('[data-zh-action="sample"]').click();
  await ensureChineseMobilePreview(page);
  const workspace = page.locator('#chineseWorkspace');
  const trigger = workspace.locator('.page-break-menu');
  const panel = workspace.locator('.page-break-panel');
  const panelToggle = workspace.locator('.page-break-panel-toggle');
  await trigger.click();
  const marker = page.locator('#page-break-overlay-zh-CN .page-break-boundary[data-page-break-key="summary"]');
  await marker.click();
  await expect(panel).toBeHidden();
  await expect(page.locator('.page-break-action-bar:not([hidden])')).toBeVisible();
  await expect(page.locator('#trustCapsule')).toBeHidden();
  await expect(page.locator('body')).toHaveAttribute('data-page-break-editing-locale', 'zh-CN');
  await page.setViewportSize({ width: 1024, height: 768 });
  await expect(panel).toBeHidden();
  await expect(panelToggle).toBeHidden();
  await expect(page.locator('.page-break-action-bar:not([hidden])')).toHaveCount(0);
  await expect(page.locator('#trustCapsule')).toBeVisible();
  await expect(page.locator('body')).not.toHaveAttribute('data-page-break-editing-locale');
  await expect(marker.locator('xpath=..')).toHaveClass(/is-selected/);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.page-break-action-bar:not([hidden])')).toBeVisible();
  await expect(marker.locator('xpath=..')).toHaveClass(/is-selected/);
  await expect(page.locator('#trustCapsule')).toBeHidden();
  await trigger.click();
  await expect(page.locator('#trustCapsule')).toBeVisible();
  await expect(page.locator('body')).not.toHaveAttribute('data-page-break-editing-locale');
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
  const candidateCount = await page.locator('#page-break-overlay-en .page-break-boundary').count();
  await page.locator('[data-en-preview] [data-record-id]').evaluateAll((records) => {
    records.forEach((record) => { record.style.cssText = 'height: 10px; margin: 0; min-height: 0; overflow: hidden; padding: 0;'; });
  });
  await page.evaluate(() => window.dispatchEvent(new Event('resize')));
  await expect.poll(() => page.locator('#page-break-overlay-en [data-page-break-cluster-count]').count()).toBeGreaterThan(0);
  await expect(page.locator('#page-break-overlay-en .page-break-boundary')).toHaveCount(candidateCount);
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
  await expect(qualifications).toHaveAttribute('aria-label', /位置 \d+ \/ \d+、免許・資格の前、設定済み/);
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
  const panelToggle = page.locator('#japaneseWorkspace .page-break-panel-toggle');
  await expect(trigger).toHaveAttribute('aria-controls', 'page-break-overlay-ja');
  await trigger.click();
  await expect(page.locator('#page-break-overlay-ja')).toBeVisible();
  await panelToggle.click();
  await expect(panel).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(panel).toBeHidden();
  await expect(page.locator('#page-break-overlay-ja')).toBeVisible();
  await expect(trigger).toHaveAttribute('aria-controls', 'page-break-overlay-ja');
});
