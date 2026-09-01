import { readFile } from 'node:fs/promises';
import { createDefaultState } from '../../site/assets/js/state/defaults.js';
import { expect, expectNoPageOverflow, openLocale, revealField, test } from './fixtures.js';

const STORAGE_KEY = 'resume-studio-web-v1';
const PHOTO_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const PHOTO_DATA_URL = `data:image/png;base64,${PHOTO_BASE64}`;
const PROFILE_URL_CASES = [
  ['http://example.test/profile', true],
  ['https://example.test/profile', true],
  ['javascript:alert(1)', false],
  ['data:text/html,profile', false],
  ['/relative-profile', false],
  ['mailto:profile@example.test', false],
  ['ftp://example.test/profile', false]
];

test('日本語: 入力・保存復元・例示保護・削除・安全なプレビュー', async ({ page }) => {
  await openLocale(page, 'ja');
  await expect(page.locator('.header-actions #saveStatus')).toHaveCount(0);
  await expect(page.locator('#japaneseWorkspace .draft-controls #saveStatus')).toBeVisible();

  const name = page.locator('[name="fullName"]');
  const motivation = page.locator('[name="motivation"]');
  const github = page.locator('[name="github"]');
  const portfolio = page.locator('[name="portfolio"]');
  await revealField(motivation);
  await revealField(github);

  const maliciousName = '<img data-e2e-malicious src=x onerror=alert(1)> 山田';
  await name.fill(maliciousName);
  await motivation.fill('顧客課題を整理し、改善を最後まで推進します。');
  await github.fill('https://github.com/resume-studio-test');
  await portfolio.fill('javascript:alert(1)');
  await page.locator('[data-add="education"]').click();
  const education = page.locator('#educationList .repeating-row').last();
  await education.locator('[data-key="date"]').fill('2020-04');
  await education.locator('[data-key="detail"]').fill('E2E大学 入学');

  const preview = page.locator('#documentPreview');
  await expect(preview).toContainText(maliciousName);
  await expect(preview.locator('[data-e2e-malicious]')).toHaveCount(0);
  await expect(preview.locator('a[href="https://github.com/resume-studio-test"]')).toHaveCount(1);
  await expect(preview.locator('a[href^="javascript:"]')).toHaveCount(0);
  await expect(preview).toContainText('E2E大学 入学');

  await page.locator('#saveDraftButton').click();
  await expect.poll(() => page.evaluate((key) => Boolean(localStorage.getItem(key)), STORAGE_KEY)).toBe(true);
  await name.fill('一時変更');
  await page.locator('#reloadDraftButton').click();
  await expect(name).toHaveValue(maliciousName);

  await page.locator('#loadSampleButton').click();
  await expect(preview).toContainText('山田 太郎');
  await expect(page.locator('#sampleModePanel')).toContainText('入力例を一時表示しています');
  await expect(page.locator('.header-actions')).not.toContainText('入力例は一時表示です');
  await page.locator('#restoreDraftButton').click();
  await expect(name).toHaveValue(maliciousName);

  await education.locator('.remove-row-button').click();
  await expect(preview).not.toContainText('E2E大学 入学');

  await page.locator('#clearButton').click();
  await expect(page.locator('#confirmDialog')).toBeVisible();
  await page.locator('#confirmClearButton').click();
  await expect(name).toHaveValue('');
  await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBeNull();
});

test('简体中文: 完整编辑流程可保存、恢复、示例保护和删除条目', async ({ page }) => {
  await openLocale(page, 'zh-CN');
  const workspace = page.locator('#chineseWorkspace');
  const name = workspace.locator('[data-profile="fullName"]');

  await name.fill('简立 E2E');
  await workspace.locator('[data-resume="headline"]').fill('高级产品经理');
  await workspace.locator('[data-resume="summary"]').fill('负责企业服务产品规划与交付。');
  const skills = workspace.locator('[data-resume="skills"]');
  await revealField(skills);
  await skills.fill('产品策略、数据分析、团队协作');
  await workspace.locator('[data-zh-add="experience"]').click();
  const experience = workspace.locator('[data-zh-type="experience"]').last();
  await experience.locator('[data-zh-key="company"]').fill('E2E科技');
  await experience.locator('[data-zh-key="role"]').fill('产品负责人');
  await experience.locator('[data-zh-key="details"]').fill('将交付周期缩短30%');
  await expect(workspace.locator('[data-zh-preview]')).toContainText('将交付周期缩短30%');

  await workspace.locator('[data-zh-action="save"]').click();
  await name.fill('临时姓名');
  await workspace.locator('[data-zh-action="reload"]').click();
  await expect(name).toHaveValue('简立 E2E');

  await workspace.locator('[data-zh-action="sample"]').click();
  await expect(workspace.locator('[data-zh-sample-panel]')).toBeVisible();
  await workspace.locator('[data-zh-action="restore"]').click();
  await expect(name).toHaveValue('简立 E2E');

  await experience.locator('[data-zh-remove]').click();
  await expect(workspace.locator('[data-zh-preview]')).not.toContainText('E2E科技');
});

test('embedded photos stay as data URLs in storage but render only through revocable Blob URLs', async ({ page }) => {
  const state = createDefaultState('ja');
  state.profile.photo = PHOTO_DATA_URL;
  await page.addInitScript(({ key, storedState }) => {
    localStorage.setItem(key, JSON.stringify(storedState));
  }, { key: STORAGE_KEY, storedState: state });
  await openLocale(page, 'ja');

  const japaneseImages = page.locator('#photoThumbnail img, #documentPreview .profile-photo img');
  await expect(japaneseImages).toHaveCount(2);
  for (const image of await japaneseImages.all()) {
    await expect(image).toHaveAttribute('src', /^blob:/);
    await expect.poll(() => image.evaluate((element) => element.complete && element.naturalWidth > 0)).toBe(true);
  }
  await expect(page.locator('img[src^="data:image"]')).toHaveCount(0);
  await expect.poll(() => page.evaluate((key) => (
    JSON.parse(localStorage.getItem(key)).profile.photo
  ), STORAGE_KEY)).toBe(PHOTO_DATA_URL);

  const initialBlobUrl = await japaneseImages.first().getAttribute('src');
  await page.locator('#photoInput').setInputFiles({
    buffer: Buffer.from(PHOTO_BASE64, 'base64'),
    mimeType: 'image/png',
    name: 'replacement.png'
  });
  await expect.poll(() => japaneseImages.first().getAttribute('src')).not.toBe(initialBlobUrl);
  const replacementBlobUrl = await japaneseImages.first().getAttribute('src');
  await expect.poll(() => page.evaluate(async (url) => {
    try {
      await fetch(url);
      return true;
    } catch {
      return false;
    }
  }, initialBlobUrl)).toBe(false);
  await expect.poll(() => page.evaluate((key) => (
    JSON.parse(localStorage.getItem(key)).profile.photo.startsWith('data:image/jpeg;base64,')
  ), STORAGE_KEY)).toBe(true);

  await page.locator('#localeSelect').selectOption('zh-CN');
  const chineseImages = page.locator('[data-zh-photo-thumbnail] img, [data-zh-preview] .zh-profile-photo');
  await expect(chineseImages).toHaveCount(2);
  for (const image of await chineseImages.all()) {
    await expect(image).toHaveAttribute('src', replacementBlobUrl);
    await expect.poll(() => image.evaluate((element) => element.complete && element.naturalWidth > 0)).toBe(true);
  }
  await expect(page.locator('img[src^="data:image"]')).toHaveCount(0);

  await page.locator('[data-zh-action="remove-photo"]').click();
  await expect(chineseImages).toHaveCount(0);
  await expect.poll(() => page.evaluate((key) => (
    JSON.parse(localStorage.getItem(key)).profile.photo
  ), STORAGE_KEY)).toBe('');
  await expect.poll(() => page.evaluate(async (url) => {
    try {
      await fetch(url);
      return true;
    } catch {
      return false;
    }
  }, replacementBlobUrl)).toBe(false);
});

test('English: complete editing flow saves, restores, protects samples, and removes entries', async ({ page }) => {
  await openLocale(page, 'en');
  const workspace = page.locator('[data-english-editor]');
  const name = workspace.locator('[data-profile-field="fullName"]');

  await name.fill('Alex E2E');
  await workspace.locator('[data-resume-field="headline"]').fill('Product Engineering Lead');
  await workspace.locator('[data-resume-field="summary"]').fill('Builds accessible products with measurable outcomes.');
  const skills = workspace.locator('[data-resume-field="skills"]');
  await revealField(skills);
  await skills.fill('Product strategy, JavaScript, Accessibility');
  await workspace.locator('[data-en-add="experience"]').click();
  const experience = workspace.locator('[data-en-item="experience"]').last();
  await experience.locator('[data-en-item-field="company"]').fill('E2E Labs');
  await experience.locator('[data-en-item-field="role"]').fill('Lead');
  await experience.locator('[data-en-item-field="details"]').fill('Improved activation by 25%.');
  await expect(workspace.locator('[data-en-preview]')).toContainText('Improved activation by 25%.');

  await workspace.locator('[data-en-save]').click();
  await name.fill('Temporary Name');
  await workspace.locator('[data-en-reload]').click();
  await expect(name).toHaveValue('Alex E2E');

  await workspace.locator('[data-en-load-sample]').click();
  await expect(workspace.locator('[data-en-sample-panel]')).toBeVisible();
  await workspace.locator('[data-en-restore-sample]').click();
  await expect(name).toHaveValue('Alex E2E');

  await experience.locator('[data-en-remove]').click();
  await expect(workspace.locator('[data-en-preview]')).not.toContainText('E2E Labs');
});

test('JSON の書き出し・読込が往復し、不正データは既存下書きを壊さない', async ({ page }) => {
  await openLocale(page, 'ja');
  const name = page.locator('[name="fullName"]');
  await name.fill('書き出し前の氏名');
  await page.locator('#saveDraftButton').click();
  await page.locator('#dataMenuSummary').click();

  const downloadPromise = page.waitForEvent('download');
  await page.locator('#exportDataButton').click();
  const download = await downloadPromise;
  const exported = JSON.parse(await readFile(await download.path(), 'utf8'));
  expect(exported.version).toBe(1);
  expect(exported.profile.fields.fullName).toBe('書き出し前の氏名');

  exported.profile.fields.fullName = '読み込んだ氏名';
  await page.locator('#importDataInput').setInputFiles({
    name: 'resume-studio-valid.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(exported))
  });
  await expect(name).toHaveValue('読み込んだ氏名');

  await page.locator('#importDataInput').setInputFiles({
    name: 'resume-studio-invalid.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"version":999}')
  });
  await expect(page.locator('#globalMessage')).toContainText('読み込めませんでした');
  await expect(name).toHaveValue('読み込んだ氏名');
  await expect.poll(() => page.evaluate((key) => {
    const stored = JSON.parse(localStorage.getItem(key));
    return stored.profile.fields.fullName;
  }, STORAGE_KEY)).toBe('読み込んだ氏名');
});

test('三言語で入力例を草稿操作にまとめ、言語とPDFをヘッダー右端に表示する', async ({ page }) => {
  const cases = [
    ['ja', '#japaneseWorkspace', '#loadSampleButton', '入力例を表示', 'バックアップと復元'],
    ['zh-CN', '#chineseWorkspace', '[data-zh-action="sample"]', '查看填写示例', '备份与恢复'],
    ['en', '[data-english-editor]', '[data-en-load-sample]', 'View example', 'Backup & restore']
  ];

  for (const [locale, workspaceSelector, sampleSelector, sampleLabel, backupLabel] of cases) {
    await openLocale(page, locale);
    const workspace = page.locator(workspaceSelector);
    const sampleButton = workspace.locator(sampleSelector);
    const backupMenu = page.locator('#dataMenuSummary');
    await expect(sampleButton).toBeVisible();
    await expect(sampleButton).toHaveText(sampleLabel);
    await expect(sampleButton.locator('xpath=ancestor::*[contains(@class, "draft-controls")]')).toHaveCount(1);
    await expect(page.locator('.header-actions').locator(sampleSelector)).toHaveCount(0);
    await expect(backupMenu).toHaveAttribute('aria-label', backupLabel);
    await expect(backupMenu.locator('#dataMenuLabel')).toHaveText(backupLabel);
    await expect(backupMenu.locator('#dataMenuLabel')).toBeVisible();
    await expect(backupMenu.locator('#dataMenuShortLabel')).toBeHidden();

    const layout = await page.locator('.header-actions').evaluate((header) => {
      const headerBox = header.getBoundingClientRect();
      const printBox = header.querySelector('#printButton').getBoundingClientRect();
      return {
        headerRight: headerBox.right,
        printRight: printBox.right,
        viewportWidth: window.innerWidth
      };
    });
    expect(layout.viewportWidth - layout.headerRight).toBeLessThanOrEqual(24);
    expect(layout.viewportWidth - layout.printRight).toBeLessThanOrEqual(24);
  }
});

test('三言語のプロフィールURLはHTTP(S)だけがリンクになる', async ({ page }) => {
  const cases = [
    ['ja', '[name="github"]', '#documentPreview'],
    ['zh-CN', '[data-profile="github"]', '[data-zh-preview]'],
    ['en', '[data-profile-field="github"]', '[data-en-preview]']
  ];

  for (const [locale, fieldSelector, previewSelector] of cases) {
    await openLocale(page, locale);
    const field = page.locator(fieldSelector);
    const preview = page.locator(previewSelector);
    await revealField(field);

    for (const [url, clickable] of PROFILE_URL_CASES) {
      await field.fill(url);
      if (clickable) {
        await expect(preview.locator(`a[href="${url}"]`)).toHaveCount(1);
      } else {
        await expect(preview.locator('a')).toHaveCount(0);
      }
    }
  }
});

test('@mobile 日本語: 編集・保存復元・書き出し・プレビューが操作できる', async ({ page }) => {
  await openLocale(page, 'ja');
  expect(page.viewportSize()).toEqual({ width: 390, height: 844 });
  await expect(page.locator('#dataMenuSummary')).toHaveAttribute('aria-label', 'バックアップと復元');
  await expect(page.locator('#dataMenuLabel')).toBeHidden();
  await expect(page.locator('#dataMenuShortLabel')).toBeHidden();
  await expect(page.locator('#dataMenuSummary .data-menu-icon')).toBeVisible();
  const workspace = page.locator('#japaneseWorkspace');
  const name = page.locator('[name="fullName"]');
  await expect(name).toBeVisible();
  await name.fill('モバイル 山田');
  await page.locator('#saveDraftButton').click();
  await name.fill('一時変更');
  await page.locator('#reloadDraftButton').click();
  await expect(name).toHaveValue('モバイル 山田');
  await expectNoPageOverflow(page);

  await page.locator('#dataMenuSummary').click();
  await expect(page.locator('#exportDataButton')).toBeVisible();
  await expectNoPageOverflow(page);
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#exportDataButton').click();
  await downloadPromise;

  await page.locator('[data-mobile-view="preview"]').click();
  await expect(workspace).toHaveAttribute('data-mobile-mode', 'preview');
  await expect(page.locator('#documentPreview')).toContainText('モバイル 山田');
  await expectNoPageOverflow(page);
});

test('@mobile 简体中文: 编辑、保存恢复和预览均可操作', async ({ page }) => {
  await openLocale(page, 'zh-CN');
  const workspace = page.locator('#chineseWorkspace');
  const name = workspace.locator('[data-profile="fullName"]');
  await expect(name).toBeVisible();
  await name.fill('移动端 简立');
  await workspace.locator('[data-zh-action="save"]').click();
  await name.fill('临时姓名');
  await workspace.locator('[data-zh-action="reload"]').click();
  await expect(name).toHaveValue('移动端 简立');
  await expectNoPageOverflow(page);

  await page.locator('#dataMenuSummary').click();
  await expect(page.locator('#exportDataButton')).toBeVisible();
  await expectNoPageOverflow(page);
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#exportDataButton').click();
  await downloadPromise;

  await workspace.locator('[data-zh-mobile-view="preview"]').click();
  await expect(workspace).toHaveAttribute('data-mobile-mode', 'preview');
  await expect(workspace.locator('[data-zh-preview]')).toContainText('移动端 简立');
  await expectNoPageOverflow(page);
});

test('@mobile English: editing, save/restore, and preview remain operable', async ({ page }) => {
  await openLocale(page, 'en');
  const workspace = page.locator('[data-english-editor]');
  const name = workspace.locator('[data-profile-field="fullName"]');
  await expect(name).toBeVisible();
  await name.fill('Mobile Alex');
  await workspace.locator('[data-en-save]').click();
  await name.fill('Temporary Name');
  await workspace.locator('[data-en-reload]').click();
  await expect(name).toHaveValue('Mobile Alex');
  await expectNoPageOverflow(page);

  await page.locator('#dataMenuSummary').click();
  await expect(page.locator('#exportDataButton')).toBeVisible();
  await expectNoPageOverflow(page);
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#exportDataButton').click();
  await downloadPromise;

  await workspace.locator('[data-en-mobile-view="preview"]').click();
  await expect(workspace).toHaveAttribute('data-mobile-mode', 'preview');
  await expect(workspace.locator('[data-en-preview]')).toContainText('Mobile Alex');
  await expectNoPageOverflow(page);
});
