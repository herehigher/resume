import { readFile } from 'node:fs/promises';

import { expect, expectNoPageOverflow, openLocale, revealField, test } from './fixtures.js';

async function exportJapaneseState(page) {
  await page.locator('#dataMenuSummary').click();
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#exportDataButton').click();
  const download = await downloadPromise;
  return JSON.parse(await readFile(await download.path(), 'utf8'));
}

test('日本語の共有書式ガイドは両書類と入力例で使え、スマホでも表示を保つ', async ({ page }) => {
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await openLocale(page, 'ja');

    const guideToggle = page.locator('#japaneseFormatGuideToggle');
    const guidePanel = page.locator('#japaneseFormatGuidePanel');
    const editorPanel = page.locator('#japaneseWorkspace .editor-panel');
    await expect(guideToggle).toHaveCount(1);
    await expect(guideToggle).toBeVisible();
    await expect(page.locator('#loadSampleButton')).toBeVisible();
    await expect(page.locator('#japaneseWorkspace .draft-controls')).toHaveCSS('position', 'sticky');
    await expect(page.locator('#japaneseWorkspace .markdown-field, #japaneseWorkspace .markdown-field-heading, #japaneseWorkspace .markdown-help-panel, #japaneseWorkspace [data-limited-markdown-toggle]')).toHaveCount(0);
    for (const selector of [
      '#resumeFields [name="motivation"]',
      '#resumeFields [name="requests"]',
      '#careerFields [name="careerSummary"]',
      '#careerFields [name="skills"]',
      '#careerFields [name="selfPromotion"]',
      '#careerList [data-key="companyInfo"]',
      '#careerList [data-detail-key="content"]'
    ]) {
      await expect(page.locator(selector).first()).toHaveCount(1);
    }
    expect(await guideToggle.evaluate((button) => button.parentElement.contains(document.getElementById('loadSampleButton')))).toBe(true);
    await expect(guidePanel).toBeHidden();
    await expect(guideToggle).toHaveAttribute('aria-expanded', 'false');
    await expect(guideToggle).toHaveAttribute('aria-controls', 'japaneseFormatGuidePanel');

    await guideToggle.focus();
    await expect(guideToggle).toBeFocused();
    await guideToggle.press('Enter');
    await expect(guideToggle).toBeFocused();
    await expect(guideToggle).toHaveAttribute('aria-expanded', 'true');
    await expect(guidePanel).toBeVisible();
    expect(await guidePanel.evaluate((panel) => Number.parseFloat(getComputedStyle(panel).fontSize))).toBeGreaterThanOrEqual(11);
    await expect(guidePanel).toContainText('志望動機・自己PR');
    await expect(guidePanel).toContainText('活かせる経験・知識・技術');
    await expect(guidePanel).toContainText('**太字**');
    await expect(guidePanel).toContainText('[表示名](https://...)');
    await expect(guidePanel).toContainText('見出し・表・画像・HTML・水平線には対応しません。');

    const guideLayout = await page.evaluate(() => {
      const button = document.getElementById('japaneseFormatGuideToggle').getBoundingClientRect();
      const panel = document.getElementById('japaneseFormatGuidePanel').getBoundingClientRect();
      return {
        buttonHeight: button.height,
        buttonWidth: button.width,
        buttonBottom: button.bottom,
        panelLeft: panel.left,
        panelTop: panel.top,
        panelRight: panel.right,
        panelBottom: panel.bottom,
        panelHeight: panel.height,
        panelScrollHeight: document.getElementById("japaneseFormatGuidePanel").scrollHeight,
        panelClientHeight: document.getElementById("japaneseFormatGuidePanel").clientHeight,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight
      };
    });
    expect(guideLayout.buttonHeight).toBeGreaterThanOrEqual(44);
    expect(guideLayout.buttonWidth).toBeGreaterThanOrEqual(44);
    expect(guideLayout.panelLeft).toBeGreaterThanOrEqual(0);
    expect(guideLayout.panelRight).toBeLessThanOrEqual(guideLayout.viewportWidth);
    expect(guideLayout.panelTop).toBeGreaterThanOrEqual(guideLayout.buttonBottom);
    expect(guideLayout.panelBottom).toBeLessThanOrEqual(guideLayout.viewportHeight);
    expect(guideLayout.panelHeight).toBeLessThanOrEqual(248);
    expect(guideLayout.panelHeight).toBeLessThan(guideLayout.viewportHeight / 3);
    expect(guideLayout.panelScrollHeight).toBeLessThanOrEqual(guideLayout.panelClientHeight);
    await expectNoPageOverflow(page);

    const unrelatedControl = page.locator('#localeSelect');
    await unrelatedControl.focus();
    await expect(unrelatedControl).toBeFocused();
    await expect(guideToggle).toHaveAttribute('aria-expanded', 'true');
    await unrelatedControl.press('Escape');
    await expect(guidePanel).toBeVisible();
    await expect(unrelatedControl).toBeFocused();
    await guideToggle.focus();
    await guideToggle.press('Escape');
    await expect(guidePanel).toBeHidden();
    await expect(guideToggle).toBeFocused();
    await expect(guideToggle).toHaveAttribute('aria-expanded', 'false');

    await page.locator('#careerDocumentTab').click();
    await expect(guideToggle).toBeVisible();
    await expect(page.locator('#japaneseWorkspace #japaneseFormatGuideToggle')).toHaveCount(1);
    await expect(page.locator('#careerList [data-key="companyInfo"]')).toHaveCount(1);
    await expect(page.locator('#careerList [data-detail-key="content"]')).toHaveCount(2);

    await editorPanel.evaluate((element) => { element.scrollTop = element.scrollHeight; });
    await expect(guideToggle).toBeInViewport();
    await guideToggle.click();
    await expect(guidePanel).toBeVisible();
    const stickyGuideLayout = await page.evaluate(() => {
      const controls = document.querySelector('#japaneseWorkspace .draft-controls').getBoundingClientRect();
      const button = document.getElementById('japaneseFormatGuideToggle').getBoundingClientRect();
      const panel = document.getElementById('japaneseFormatGuidePanel').getBoundingClientRect();
      return { controlsTop: controls.top, buttonTop: button.top, panelBottom: panel.bottom, viewportHeight: window.innerHeight, panelHeight: panel.height };
    });
    expect(stickyGuideLayout.buttonTop).toBeGreaterThanOrEqual(stickyGuideLayout.controlsTop);
    expect(stickyGuideLayout.panelBottom).toBeLessThanOrEqual(stickyGuideLayout.viewportHeight);
    expect(stickyGuideLayout.panelHeight).toBeLessThanOrEqual(248);
    await guideToggle.click();

    await page.locator('#loadSampleButton').click();
    await expect(page.locator('#restoreDraftButton')).toBeVisible();
    await expect(page.locator('#adoptSampleButton')).toBeVisible();
    await expect(page.locator('#loadSampleButton')).toBeHidden();
    await expect(guideToggle).toBeVisible();
    await expect(page.locator('#documentPreview .ja-markdown strong')).not.toHaveCount(0);

    await page.locator('#careerDocumentTab').click();
    await expect(page.locator('#japaneseWorkspace #japaneseFormatGuideToggle')).toHaveCount(1);
    await expect(guideToggle).toBeVisible();
    await expect(page.locator('#documentPreview .ja-markdown strong')).not.toHaveCount(0);
    await expect(page.locator('#documentPreview .ja-markdown ul li')).not.toHaveCount(0);
    await expect(page.locator('#documentPreview .ja-markdown ol li')).not.toHaveCount(0);

    await editorPanel.evaluate((element) => { element.scrollTop = element.scrollHeight; });
    await expect(guideToggle).toBeInViewport();
    await guideToggle.focus();
    await expect(guideToggle).toBeFocused();
    await guideToggle.press('Enter');
    await expect(guidePanel).toBeVisible();
    const sampleGuideLayout = await page.evaluate(() => {
      const button = document.getElementById('japaneseFormatGuideToggle').getBoundingClientRect();
      const panel = document.getElementById('japaneseFormatGuidePanel').getBoundingClientRect();
      return { buttonHeight: button.height, buttonWidth: button.width, panelHeight: panel.height, panelBottom: panel.bottom, viewportHeight: window.innerHeight, panelScrollHeight: document.getElementById("japaneseFormatGuidePanel").scrollHeight, panelClientHeight: document.getElementById("japaneseFormatGuidePanel").clientHeight };
    });
    expect(sampleGuideLayout.buttonHeight).toBeGreaterThanOrEqual(44);
    expect(sampleGuideLayout.buttonWidth).toBeGreaterThanOrEqual(44);
    expect(sampleGuideLayout.panelHeight).toBeLessThanOrEqual(248);
    expect(sampleGuideLayout.panelHeight).toBeLessThan(sampleGuideLayout.viewportHeight / 3);
    expect(sampleGuideLayout.panelScrollHeight).toBeLessThanOrEqual(sampleGuideLayout.panelClientHeight);
    expect(sampleGuideLayout.panelBottom).toBeLessThanOrEqual(sampleGuideLayout.viewportHeight);
    await guideToggle.press('Escape');
    await expect(guidePanel).toBeHidden();
    await page.locator('#restoreDraftButton').click();
    await expect(guideToggle).toBeVisible();
  }
});

test('日本語 Markdown preview preserves paragraph indentation and repeated spaces', async ({ page }) => {
  const source = [
    '通常  文字',
    ' 1スペース行',
    '   3スペース行',
    '    4スペース行',
    '',
    '- リスト  内の空白'
  ].join('\n');
  await openLocale(page, 'ja');
  const field = page.locator('#resumeFields [name="motivation"]');
  await revealField(field);
  await field.fill(source);

  const paragraph = page.locator('#documentPreview .ja-markdown p').first();
  const listItem = page.locator('#documentPreview .ja-markdown li').first();
  await expect.poll(() => paragraph.innerText()).toBe('通常  文字\n 1スペース行\n   3スペース行\n    4スペース行');
  await expect.poll(() => listItem.innerText()).toBe('リスト  内の空白');
  expect(await paragraph.evaluate((element) => getComputedStyle(element).whiteSpace)).toBe('pre-wrap');
  expect(await listItem.evaluate((element) => getComputedStyle(element).whiteSpace)).toBe('pre-wrap');
});

test('日文 Markdown source は暗号化草稿・JSON 往復で code-unit 単位に保たれ、安全に表示する', async ({ page }) => {
  const source = [
    '**太字** と *斜体* と `コード`',
    '- 第一項目',
    '  - 第二階層',
    '3. 番号付き',
    '[架空リンク](https://example.test/resume)',
    '![外部画像](https://example.test/image.png)',
    '<img src="https://example.test/raw.png" onerror="alert(1)">',
    '[危険](javascript:alert(1))'
  ].join('\n');
  const values = {
    motivation: source,
    requests: '**希望**',
    careerSummary: '職務要約\n次の行',
    skills: '- 架空の技術',
    selfPromotion: '*強み* [安全な架空リンク](https://example.test/promotion) [危険](javascript:alert(1))',
    companyInfo: '**架空の会社情報**',
    detailContent: '1. 成果\n2. 末尾マーカー MARKDOWN-END'
  };

  await openLocale(page, 'ja');
  for (const name of ['motivation', 'requests']) {
    const field = page.locator(`[name="${name}"]`);
    await revealField(field);
    await field.fill(values[name]);
  }
  await page.locator('#careerDocumentTab').click();
  for (const name of ['careerSummary', 'skills', 'selfPromotion']) {
    const field = page.locator(`[name="${name}"]`);
    await revealField(field);
    await field.fill(values[name]);
  }
  const companyInfo = page.locator('#careerList [data-key="companyInfo"]').first();
  const detailContent = page.locator('#careerList [data-detail-key="content"]').first();
  await companyInfo.fill(values.companyInfo);
  await detailContent.fill(values.detailContent);
  await page.locator('#japaneseFormatGuideToggle').click();
  await expect(page.locator('#japaneseFormatGuidePanel')).toBeVisible();
  await expect(page.locator('#documentPreview')).toContainText('MARKDOWN-END');
  await expect(page.locator('#documentPreview .ja-markdown a')).toHaveCount(1);
  await expect(page.locator('#documentPreview .ja-markdown a')).toHaveAttribute('target', '_blank');
  await expect(page.locator('#documentPreview .ja-markdown a')).toHaveAttribute('rel', 'noopener noreferrer');
  await expect(page.locator('#documentPreview .ja-markdown a[href^="javascript:"]')).toHaveCount(0);
  await expect(page.locator('#documentPreview .ja-markdown img, #documentPreview .ja-markdown script')).toHaveCount(0);
  await expect.poll(() => page.locator('#saveStatus').textContent()).toBe('暗号化してこの端末に保存済み');

  await page.reload();
  for (const name of ['motivation', 'requests', 'careerSummary', 'skills', 'selfPromotion']) {
    await expect(page.locator(`[name="${name}"]`)).toHaveValue(values[name]);
  }
  await expect(page.locator('#careerList [data-key="companyInfo"]').first()).toHaveValue(values.companyInfo);
  await expect(page.locator('#careerList [data-detail-key="content"]').first()).toHaveValue(values.detailContent);
  await expect(page.locator('#japaneseFormatGuideToggle')).toHaveAttribute('aria-expanded', 'false');

  const exported = await exportJapaneseState(page);
  expect(exported.documents.ja.fields).toMatchObject({
    motivation: values.motivation,
    requests: values.requests,
    careerSummary: values.careerSummary,
    skills: values.skills,
    selfPromotion: values.selfPromotion
  });
  expect(exported.documents.ja.careers[0].companyInfo).toBe(values.companyInfo);
  expect(exported.documents.ja.careers[0].detailSections[0].content).toBe(values.detailContent);
  expect(Object.hasOwn(exported.documents.ja.fields, 'markdownHelpOpen')).toBe(false);

  await page.locator('[name="careerSummary"]').fill('変更後の値');
  await page.locator('#importDataInput').setInputFiles({
    name: 'fictional-limited-markdown.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(exported))
  });
  await expect(page.locator('#sampleAdoptDialog')).toBeVisible();
  await page.locator('#confirmSampleAdoptButton').click();
  await expect(page.locator('[name="careerSummary"]')).toHaveValue(values.careerSummary);
  await expect(page.locator('[name="motivation"]')).toHaveValue(values.motivation);
  await expect(page.locator('#documentPreview')).toContainText('MARKDOWN-END');
});
