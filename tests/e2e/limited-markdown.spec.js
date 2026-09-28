import { readFile } from 'node:fs/promises';

import { expect, expectNoPageOverflow, openLocale, revealField, test } from './fixtures.js';

async function exportJapaneseState(page) {
  await page.locator('#dataMenuSummary').click();
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#exportDataButton').click();
  const download = await downloadPromise;
  return JSON.parse(await readFile(await download.path(), 'utf8'));
}

test('日文 Markdown 帮助只在目标长文 textarea 出现，并支持 keyboard 与手机内联展开', async ({ page }) => {
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await openLocale(page, 'ja');

    for (const name of ['motivation', 'requests']) {
      const field = page.locator(`#resumeFields [name="${name}"]`);
      await expect(field).toHaveCount(1);
      expect(await field.evaluate((element) => Boolean(element.closest('.markdown-field')))).toBe(true);
    }
    for (const name of ['careerSummary', 'skills', 'selfPromotion']) {
      const field = page.locator(`#careerFields [name="${name}"]`);
      await expect(field).toHaveCount(1);
      expect(await field.evaluate((element) => Boolean(element.closest('.markdown-field')))).toBe(true);
    }

    const companyInfo = page.locator('#careerList [data-key="companyInfo"]').first();
    const detailContent = page.locator('#careerList [data-detail-key="content"]').first();
    await expect(companyInfo).toHaveCount(1);
    await expect(detailContent).toHaveCount(1);
    expect(await companyInfo.evaluate((element) => Boolean(element.closest('.markdown-field')))).toBe(true);
    expect(await detailContent.evaluate((element) => Boolean(element.closest('.markdown-field')))).toBe(true);

    const excludedFields = [
      page.locator('[name="fullName"]'),
      page.locator('#educationList [data-key="detail"]'),
      page.locator('#careerList [data-key="company"]'),
      page.locator('#careerList [data-detail-key="title"]')
    ];
    for (const field of excludedFields) {
      expect(await field.first().evaluate((element) => Boolean(element.closest('.markdown-field')))).toBe(false);
    }

    const motivation = page.locator('#jp-motivation');
    await revealField(motivation);
    const motivationToggle = page.locator('#jp-motivation-toggle');
    const motivationPanel = page.locator('#jp-motivation-help');
    await expect(motivationToggle).toHaveText('Markdown の書き方');
    await expect(motivationToggle).toHaveAttribute('aria-controls', 'jp-motivation-help');
    await expect(motivationToggle).toHaveAttribute('aria-expanded', 'false');
    await motivationToggle.focus();
    await expect(motivationToggle).toBeFocused();
    await motivationToggle.press('Enter');
    await expect(motivationToggle).toBeFocused();
    await expect(motivationToggle).toHaveAttribute('aria-expanded', 'true');
    await expect(motivationPanel).toBeVisible();
    await expect(motivationPanel).toContainText('**太字**');
    await expect(motivationPanel).toContainText('[表示名](https://...)');
    await expect(motivationPanel).toContainText('見出し・表・画像・HTML・水平線には対応しません。');

    const motivationLayout = await page.evaluate(() => {
      const button = document.getElementById('jp-motivation-toggle').getBoundingClientRect();
      const panel = document.getElementById('jp-motivation-help').getBoundingClientRect();
      const textarea = document.getElementById('jp-motivation').getBoundingClientRect();
      const wrapper = document.getElementById('jp-motivation').closest('.markdown-field').getBoundingClientRect();
      return {
        buttonHeight: button.height,
        buttonWidth: button.width,
        panelWidth: panel.width,
        wrapperWidth: wrapper.width,
        panelBelowButton: panel.top >= button.bottom,
        fieldBelowPanel: textarea.top >= panel.bottom
      };
    });
    expect(motivationLayout.buttonHeight).toBeGreaterThanOrEqual(44);
    expect(motivationLayout.buttonWidth).toBeGreaterThanOrEqual(44);
    expect(motivationLayout.panelWidth).toBeLessThanOrEqual(motivationLayout.wrapperWidth);
    expect(motivationLayout.panelBelowButton).toBe(true);
    expect(motivationLayout.fieldBelowPanel).toBe(true);
    await expectNoPageOverflow(page);

    await page.locator('#careerDocumentTab').click();
    await revealField(companyInfo);
    const companyToggle = companyInfo.locator('xpath=ancestor::div[contains(@class,"markdown-field")]').locator('[data-limited-markdown-toggle]');
    await companyToggle.click();
    await expect(companyToggle).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator(`#${await companyToggle.getAttribute('aria-controls')}`)).toBeVisible();
  }

  for (const locale of ['zh-CN', 'en']) {
    await openLocale(page, locale);
    await expect(page.locator('#japaneseWorkspace')).toBeHidden();
    await expect(page.locator('#japaneseWorkspace [data-limited-markdown-toggle]').first()).toBeHidden();
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
  const field = page.locator('#jp-motivation');
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
  await page.locator('#jp-careerSummary-toggle').click();
  await expect(page.locator('#jp-careerSummary-help')).toBeVisible();
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
  await expect(page.locator('#jp-careerSummary-toggle')).toHaveAttribute('aria-expanded', 'false');

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
