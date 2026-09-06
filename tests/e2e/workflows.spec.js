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

test('日本語: 自動保存・例示保護・削除・安全なプレビュー', async ({ page }) => {
  await openLocale(page, 'ja');
  await expect(page.locator('.header-actions #saveStatus')).toHaveCount(0);
  await expect(page.locator('#japaneseWorkspace .draft-controls #saveStatus')).toBeVisible();
  await expect(page.locator('#draftControlsTitle, #saveDraftButton, #reloadDraftButton')).toHaveCount(0);
  await expect(page.locator('#clearDraftButton')).toHaveText('この端末の下書きを消去');
  await expect(page.locator('#japaneseWorkspace .draft-clear-notice')).toHaveCount(0);
  await expect(page.locator('#saveStatus')).toHaveText('入力すると暗号化してこの端末に保存されます');
  await expect(page.locator('#saveStatus')).toHaveAttribute('role', 'status');

  const name = page.locator('[name="fullName"]');
  const motivation = page.locator('[name="motivation"]');
  const addLink = page.locator('#addProfileLinkButton');
  await revealField(motivation);
  await revealField(addLink);
  await addLink.click();
  const github = page.locator('[data-profile-link-index="0"]');

  const maliciousName = '<img data-e2e-malicious src=x onerror=alert(1)> 山田';
  await name.fill(maliciousName);
  await motivation.fill('顧客課題を整理し、改善を最後まで推進します。');
  await github.fill('https://github.com/resume-studio-test');
  await addLink.click();
  await page.locator('[data-profile-link-index="1"]').fill('javascript:alert(1)');
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

  await expect.poll(() => page.evaluate((key) => Boolean(localStorage.getItem(key)), STORAGE_KEY)).toBe(true);
  await expect.poll(() => page.evaluate(async () => {
    const request = indexedDB.open('resume-studio-web-v1-keys');
    const database = await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const key = await new Promise((resolve, reject) => {
      const get = database.transaction('keys', 'readonly').objectStore('keys').get('draft-encryption-key');
      get.onsuccess = () => resolve(get.result);
      get.onerror = () => reject(get.error);
    });
    database.close();
    return key && { type: key.type, extractable: key.extractable, algorithm: key.algorithm.name, usages: [...key.usages].sort() };
  })).toEqual({ type: 'secret', extractable: false, algorithm: 'AES-GCM', usages: ['decrypt', 'encrypt'] });
  await page.reload();
  await expect(name).toHaveValue(maliciousName);

  await page.locator('#loadSampleButton').click();
  await expect(preview).toContainText('山田 太郎');
  await expect(page.locator('#saveStatus')).toHaveText('入力例を表示しています。保存済みの下書きは変更されません。');
  await expect(page.locator('#sampleModeActions .sample-mode-copy')).toHaveCount(0);
  await expect(page.locator('.header-actions')).not.toContainText('入力例は一時表示です');
  await page.locator('#adoptSampleButton').click();
  await expect(page.locator('#sampleAdoptDialog')).toBeVisible();
  await expect(page.locator('#cancelSampleAdoptButton')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('#sampleAdoptDialog')).not.toBeVisible();
  await expect(page.locator('#sampleModeActions')).toBeVisible();
  await page.locator('#restoreDraftButton').click();
  await expect(name).toHaveValue(maliciousName);

  await education.locator('.remove-row-button').click();
  await expect(preview).not.toContainText('E2E大学 入学');

  await page.locator('#dataMenuSummary').click();
  await page.locator('#clearDraftButton').click();
  await expect(page.locator('#confirmDialog')).toBeVisible();
  await expect(page.locator('#cancelClearButton')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('#confirmDialog')).not.toBeVisible();
  await expect(page.locator('#clearDraftButton')).toBeFocused();

  await page.locator('#clearDraftButton').click();
  await page.locator('#confirmClearButton').click();
  await expect(name).toHaveValue('');
  await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBeNull();
  await expect.poll(() => page.evaluate(async () => {
    const request = indexedDB.open('resume-studio-web-v1-keys');
    const database = await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const key = await new Promise((resolve, reject) => {
      const get = database.transaction('keys', 'readonly').objectStore('keys').get('draft-encryption-key');
      get.onsuccess = () => resolve(get.result);
      get.onerror = () => reject(get.error);
    });
    database.close();
    return key ?? null;
  })).toBeNull();
  await expect(page.locator('#clearDraftButton')).toBeVisible();
  await expect(page.locator('#clearDraftButton')).toBeFocused();
});

test('[mobile] 三言語の通常下書き状態は320–401pxで1行、操作は44px以上で横にはみ出さない', async ({ page }) => {
  const cases = [
    ['ja', '#japaneseWorkspace', '[name="fullName"]', '#saveStatus', '#loadSampleButton', '暗号化してこの端末に保存済み'],
    ['zh-CN', '#chineseWorkspace', '[data-profile="fullName"]', '[data-zh-draft-message]', '[data-zh-action="sample"]', '已加密并保存到此设备'],
    ['en', '[data-english-editor]', '[data-profile-field="fullName"]', '[data-en-save-status]', '[data-en-load-sample]', 'Encrypted and saved on this device.']
  ];

  for (const width of [320, 360, 375, 393, 401]) {
    for (const [locale, workspaceSelector, fieldSelector, statusSelector, sampleSelector, savedStatus] of cases) {
      await page.setViewportSize({ width, height: 844 });
      await openLocale(page, locale);
      const workspace = page.locator(workspaceSelector);
      await workspace.locator(fieldSelector).fill(`Mobile ${locale} ${width}`);
      await expect(workspace.locator(statusSelector)).toHaveText(savedStatus);
      const layout = await workspace.locator('.draft-controls').evaluate((controls, sample) => {
        const row = controls.querySelector('.draft-primary-row').getBoundingClientRect();
        const status = controls.querySelector('.draft-message').getBoundingClientRect();
        const action = controls.querySelector(sample).getBoundingClientRect();
        return { controls: controls.getBoundingClientRect(), row, status, action };
      }, sampleSelector);
      expect(layout.controls.height).toBeLessThanOrEqual(64);
      expect(layout.action.height).toBeGreaterThanOrEqual(44);
      expect(Math.abs(
        (layout.status.top + (layout.status.height / 2)) - (layout.action.top + (layout.action.height / 2))
      )).toBeLessThanOrEqual(1);
      await page.locator('#dataMenuSummary').click();
      await expect.poll(() => page.locator('#clearDraftButton').evaluate((button) => button.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
      await page.locator('#dataMenuSummary').click();
      await expectNoPageOverflow(page);
    }
  }
});

test('[mobile] 三言語の保存エラーは省略せず展開して表示する', async ({ page }) => {
  const cases = [
    ['ja', '#japaneseWorkspace', '[name="fullName"]', '#saveStatus'],
    ['zh-CN', '#chineseWorkspace', '[data-profile="fullName"]', '[data-zh-draft-message]'],
    ['en', '[data-english-editor]', '[data-profile-field="fullName"]', '[data-en-save-status]']
  ];

  await page.setViewportSize({ width: 320, height: 844 });
  for (const [locale, workspaceSelector, fieldSelector, statusSelector] of cases) {
    await openLocale(page, locale);
    await page.evaluate((key) => localStorage.setItem(key, '{"invalid":"draft"}'), STORAGE_KEY);
    const workspace = page.locator(workspaceSelector);
    await workspace.locator(fieldSelector).fill(`Save error ${locale}`);
    const controls = workspace.locator('.draft-controls');
    const status = workspace.locator(statusSelector);
    await expect(controls).toHaveClass(/is-error/);
    await expect.poll(() => status.evaluate((element) => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
      height: element.getBoundingClientRect().height
    }))).toEqual(expect.objectContaining({
      clientWidth: expect.any(Number),
      scrollWidth: expect.any(Number),
      height: expect.any(Number)
    }));
    await expect.poll(() => status.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    await expect.poll(() => controls.evaluate((element) => element.getBoundingClientRect().height)).toBeGreaterThan(64);
    await expectNoPageOverflow(page);
    await page.evaluate((key) => localStorage.removeItem(key), STORAGE_KEY);
  }
});

test('[mobile] 入力例モードの復元と採用は44px以上の押下領域を保つ', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 844 });
  await openLocale(page, 'ja');
  await page.locator('#loadSampleButton').click();
  const actions = page.locator('#sampleModeActions .secondary-button, #sampleModeActions .primary-button');
  for (const action of await actions.all()) {
    await expect.poll(() => action.evaluate((element) => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
  }
  await expectNoPageOverflow(page);
});

test('[mobile] 三言語の入力例は唯一のlive statusで説明し、320–401pxで横にはみ出さない', async ({ page }) => {
  const cases = [
    ['ja', '#japaneseWorkspace', '#loadSampleButton', '#saveStatus', '#sampleModeActions', '#restoreDraftButton', '入力例を表示しています。保存済みの下書きは変更されません。'],
    ['zh-CN', '#chineseWorkspace', '[data-zh-action="sample"]', '[data-zh-draft-message]', '[data-zh-sample-actions]', '[data-zh-action="restore"]', '正在查看填写示例，已保存的草稿不会被更改。'],
    ['en', '[data-english-editor]', '[data-en-load-sample]', '[data-en-save-status]', '[data-en-sample-actions]', '[data-en-restore-sample]', 'Viewing an example. Your saved draft will not be changed.']
  ];

  for (const width of [320, 360, 375, 393, 401]) {
    for (const [locale, workspaceSelector, sampleSelector, statusSelector, actionsSelector, restoreSelector, sampleStatus] of cases) {
      await page.setViewportSize({ width, height: 852 });
      await openLocale(page, locale);
      const workspace = page.locator(workspaceSelector);
      await workspace.locator(sampleSelector).click();
      await expect(workspace.locator(statusSelector)).toHaveText(sampleStatus);
      await expect(workspace.locator('.draft-message[role="status"]')).toHaveCount(1);
      await expect(workspace.locator('.sample-mode-copy')).toHaveCount(0);
      for (const action of await workspace.locator(`${actionsSelector} .secondary-button, ${actionsSelector} .primary-button`).all()) {
        await expect.poll(() => action.evaluate((element) => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
      }
      await expectNoPageOverflow(page);
      await workspace.locator(restoreSelector).click();
    }
  }
});

test('821pxの編集欄で入力例操作が折り返され、横にはみ出さない', async ({ page }) => {
  await page.setViewportSize({ width: 821, height: 900 });
  await openLocale(page, 'en');
  const workspace = page.locator('[data-english-editor]');
  await workspace.locator('[data-en-load-sample]').click();
  await expect.poll(() => workspace.locator('.draft-primary-row').evaluate((element) => (
    getComputedStyle(element).gridTemplateColumns.trim().split(/\s+/).length
  ))).toBe(1);
  await expect(workspace.locator('[data-en-sample-actions]')).toBeVisible();
  await expectNoPageOverflow(page);
});

test('1280pxの入力例モードでは状態文言を1行で表示する', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openLocale(page, 'ja');
  await page.locator('#loadSampleButton').click();
  const controls = page.locator('#japaneseWorkspace .draft-controls');
  const status = page.locator('#saveStatus');
  await expect(controls).toHaveClass(/is-sample-mode/);
  await expect.poll(() => controls.locator('.draft-primary-row').evaluate((element) => (
    getComputedStyle(element).gridTemplateColumns.trim().split(/\s+/).length
  ))).toBe(1);
  await expect.poll(() => status.evaluate((element) => {
    const box = element.getBoundingClientRect();
    return { height: box.height, width: box.width };
  })).toEqual(expect.objectContaining({ height: expect.any(Number), width: expect.any(Number) }));
  const statusBox = await status.boundingBox();
  expect(statusBox.width).toBeGreaterThan(150);
  expect(statusBox.height).toBeLessThan(30);
  await expectNoPageOverflow(page);
});

test('[mobile] Links は最大3件まで追加・編集・削除でき、横にはみ出さない', async ({ page }) => {
  await openLocale(page, 'ja');
  const add = page.locator('#addProfileLinkButton');
  await revealField(add);
  for (const url of ['https://github.com/mobile-example', 'https://www.linkedin.com/in/mobile-example', 'https://example.test/mobile']) {
    await add.click();
    await page.locator('[data-profile-link-index]').last().fill(url);
  }
  await expect(add).toBeDisabled();
  await expect(page.locator('#documentPreview')).toContainText('GitHub');
  await page.locator('[data-remove-profile-link="1"]').click();
  await expect(page.locator('[data-profile-link-index]')).toHaveCount(2);
  await expect(add).toBeEnabled();
  await expectNoPageOverflow(page);
});

test('入力例の採用は確認後だけ元の下書きを上書きする', async ({ page }) => {
  await openLocale(page, 'ja');
  const name = page.locator('[name="fullName"]');
  await name.fill('採用前の下書き');
  await expect.poll(() => page.evaluate((key) => Boolean(localStorage.getItem(key)), STORAGE_KEY)).toBe(true);

  await page.locator('#loadSampleButton').click();
  await page.locator('#adoptSampleButton').click();
  await expect(page.locator('#sampleAdoptDialog')).toBeVisible();
  await page.locator('#confirmSampleAdoptButton').click();
  await expect(page.locator('#sampleAdoptDialog')).not.toBeVisible();
  await expect(name).toHaveValue('山田 太郎');
  await expect(page.locator('#saveStatus')).toContainText('入力例を下書きとして保存しました');

  await page.locator('#loadSampleButton').click();
  await page.locator('#adoptSampleButton').click();
  await page.keyboard.press('Escape');
  await expect(page.locator('#sampleModeActions')).toBeVisible();
  await page.locator('#restoreDraftButton').click();
  await expect(name).toHaveValue('山田 太郎');
});

test('三言語の入力例モードはstickyな下書きコンポーネント内で確認してから採用する', async ({ page }) => {
  const cases = [
    {
      locale: 'ja', workspace: '#japaneseWorkspace', field: '[name="fullName"]', original: '日本語の元下書き', sample: '山田 太郎',
      normal: '#draftNormalActions', sampleActions: '#sampleModeActions', sampleButton: '#loadSampleButton', restore: '#restoreDraftButton', adopt: '#adoptSampleButton'
    },
    {
      locale: 'zh-CN', workspace: '#chineseWorkspace', field: '[data-profile="fullName"]', original: '中文原草稿', sample: '简立',
      normal: '[data-zh-normal-actions]', sampleActions: '[data-zh-sample-actions]', sampleButton: '[data-zh-action="sample"]', restore: '[data-zh-action="restore"]', adopt: '[data-zh-action="adopt"]'
    },
    {
      locale: 'en', workspace: '[data-english-editor]', field: '[data-profile-field="fullName"]', original: 'Original English draft', sample: 'Alex Morgan',
      normal: '[data-en-normal-actions]', sampleActions: '[data-en-sample-actions]', sampleButton: '[data-en-load-sample]', restore: '[data-en-restore-sample]', adopt: '[data-en-adopt-sample]'
    }
  ];

  for (const scenario of cases) {
    await openLocale(page, scenario.locale);
    const workspace = page.locator(scenario.workspace);
    const field = workspace.locator(scenario.field);
    await field.fill(scenario.original);
    await expect.poll(() => page.evaluate((key) => Boolean(localStorage.getItem(key)), STORAGE_KEY)).toBe(true);

    await workspace.locator(scenario.sampleButton).click();
    await expect(workspace.locator('.draft-controls')).toBeVisible();
    await expect(workspace.locator('.draft-controls')).toHaveCSS('position', 'sticky');
    await expect(workspace.locator('.draft-clear-notice')).toHaveCount(0);
    await expect(workspace.locator(scenario.sampleActions)).toBeVisible();
    await expect(workspace.locator(scenario.normal)).toBeHidden();
    await page.locator('#dataMenuSummary').click();
    await expect(page.locator('#clearDraftButton')).toBeVisible();
    await page.locator('#dataMenuSummary').click();

    await workspace.locator(scenario.adopt).click();
    await page.locator('#cancelSampleAdoptButton').click();
    await expect(workspace.locator(scenario.sampleActions)).toBeVisible();
    await workspace.locator(scenario.restore).click();
    await expect(field).toHaveValue(scenario.original);

    await workspace.locator(scenario.sampleButton).click();
    await workspace.locator(scenario.adopt).click();
    await page.locator('#confirmSampleAdoptButton').click();
    await expect(workspace.locator(scenario.normal)).toBeVisible();
    await expect(field).toHaveValue(scenario.sample);
  }
});

test('三言語エディターは Analytics 表示の下に著作権、MIT License、X 連絡先を常設する', async ({ page }) => {
  for (const [locale, workspace] of [
    ['ja', '#japaneseWorkspace'],
    ['zh-CN', '#chineseWorkspace'],
    ['en', '[data-english-editor]']
  ]) {
    await openLocale(page, locale);
    const legal = page.locator(`${workspace} .editor-legal`);
    const license = legal.locator('a[href="https://github.com/herehigher/resume/blob/main/LICENSE"]');
    const xContact = legal.locator('.x-contact-link');
    await expect(page.locator(`${workspace} .editor-footer .editor-legal`)).toHaveCount(1);
    await expect(page.locator(`${workspace} .editor-footer #clearDraftButton`)).toHaveCount(0);
    await expect(legal.locator('[data-analytics-disclosure="status"], [data-editor-analytics-disclosure="status"]')).toBeVisible();
    await expect(license).toHaveText('MIT License');
    await expect(license).toHaveAttribute('href', 'https://github.com/herehigher/resume/blob/main/LICENSE');
    await expect(license).toHaveAttribute('target', '_blank');
    await expect(license).toHaveAttribute('rel', 'noopener noreferrer');
    await expect(xContact).toBeVisible();
    await expect(xContact).toHaveText('@kanhigher');
    await expect(xContact).toHaveAccessibleName('X: @kanhigher');
    await expect(xContact).toHaveAttribute('href', 'https://x.com/kanhigher');
    await expect(xContact).toHaveAttribute('target', '_blank');
    await expect(xContact).toHaveAttribute('rel', 'noopener noreferrer');
    await expect(xContact.locator('.x-contact-icon')).toHaveAttribute('aria-hidden', 'true');
  }

  await openLocale(page, 'ja');
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('#japaneseWorkspace .editor-legal')).toBeHidden();
});

test('[mobile] 著作権表示は固定の trust capsule に隠れない', async ({ page }) => {
  await openLocale(page, 'ja');
  const legal = page.locator('#japaneseWorkspace .editor-legal');
  await legal.scrollIntoViewIfNeeded();
  const layout = await page.evaluate(() => {
    const legalBox = document.querySelector('#japaneseWorkspace .editor-copyright').getBoundingClientRect();
    const capsuleBox = document.getElementById('trustCapsule').getBoundingClientRect();
    return {
      legalBottom: legalBox.bottom,
      legalRight: legalBox.right,
      capsuleLeft: capsuleBox.left,
      capsuleTop: capsuleBox.top
    };
  });
  expect(layout.legalBottom <= layout.capsuleTop || layout.legalRight <= layout.capsuleLeft).toBe(true);
  await expectNoPageOverflow(page);
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

  await expect.poll(() => page.evaluate((key) => Boolean(localStorage.getItem(key)), STORAGE_KEY)).toBe(true);

  await workspace.locator('[data-zh-action="sample"]').click();
  await expect(workspace.locator('[data-zh-sample-actions]')).toBeVisible();
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
  await expect.poll(() => page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    return raw && !raw.includes('data:image') && JSON.parse(raw).format;
  }, STORAGE_KEY)).toBe('resume-studio-local-encrypted-v1');

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
  await expect.poll(() => page.evaluate((key) => JSON.parse(localStorage.getItem(key)).format, STORAGE_KEY)).toBe('resume-studio-local-encrypted-v1');

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
  await expect.poll(() => page.evaluate((key) => JSON.parse(localStorage.getItem(key)).format, STORAGE_KEY)).toBe('resume-studio-local-encrypted-v1');
  await expect.poll(() => page.evaluate(async (url) => {
    try {
      await fetch(url);
      return true;
    } catch {
      return false;
    }
  }, replacementBlobUrl)).toBe(false);
});

test('English: complete editing flow auto-saves, restores, protects samples, and removes entries', async ({ page }) => {
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

  await expect.poll(() => page.evaluate((key) => Boolean(localStorage.getItem(key)), STORAGE_KEY)).toBe(true);
  await page.reload();
  await expect(name).toHaveValue('Alex E2E');
  await expect(workspace.locator('[data-resume-field="headline"]')).toHaveValue('Product Engineering Lead');

  await workspace.locator('[data-en-load-sample]').click();
  await expect(workspace.locator('[data-en-sample-actions]')).toBeVisible();
  await workspace.locator('[data-en-restore-sample]').click();
  await expect(name).toHaveValue('Alex E2E');

  await experience.locator('[data-en-remove]').click();
  await expect(workspace.locator('[data-en-preview]')).not.toContainText('E2E Labs');
});

test('English: native month inputs keep their own English language metadata and YYYY-MM values in a Chinese browser locale', async ({ baseURL, browser }) => {
  const context = await browser.newContext({ locale: 'zh-CN', viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  await page.goto(`${baseURL}/editor/?lang=en`);
  const workspace = page.locator('[data-english-editor]');
  for (const type of ['experience', 'projects', 'education', 'certifications']) {
    const section = workspace.locator(`[data-en-add="${type}"]`).locator('xpath=ancestor::details[1]');
    if (!(await section.evaluate((element) => element.open))) await section.locator('summary').click();
  }
  const initialMonthInputs = workspace.locator('input[type="month"]');
  await expect(initialMonthInputs).toHaveCount(7);
  for (const input of await initialMonthInputs.all()) {
    await expect(input).toBeVisible();
    await expect(input).toHaveAttribute('lang', 'en-US');
    await input.fill('2025-06');
    await expect(input).toHaveValue('2025-06');
  }
  expect(await initialMonthInputs.first().evaluate((input) => typeof input.showPicker)).toBe('function');

  for (const type of ['experience', 'projects', 'education', 'certifications']) {
    const addButton = workspace.locator(`[data-en-add="${type}"]`);
    await expect(addButton).toBeVisible();
    await addButton.click();
    const added = workspace.locator(`[data-en-item="${type}"]`).last();
    const monthInputs = added.locator('input[type="month"]');
    await expect(monthInputs).toHaveCount(type === 'certifications' ? 1 : 2);
    for (const input of await monthInputs.all()) {
      await expect(input).toHaveAttribute('lang', 'en-US');
      await input.fill('2025-06');
      await expect(input).toHaveValue('2025-06');
    }
  }

  await expect(initialMonthInputs).toHaveCount(14);
  await expect.poll(() => initialMonthInputs.evaluateAll((inputs) => inputs.map((input) => input.value))).toEqual(Array(14).fill('2025-06'));
  await context.close();
});

test('JSON の書き出し・読込が往復し、不正データは既存下書きを壊さない', async ({ page }) => {
  await openLocale(page, 'ja');
  const name = page.locator('[name="fullName"]');
  await name.fill('書き出し前の氏名');
  await expect.poll(() => page.evaluate((key) => Boolean(localStorage.getItem(key)), STORAGE_KEY)).toBe(true);
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
    const raw = localStorage.getItem(key);
    return raw && !raw.includes('読み込んだ氏名') && JSON.parse(raw).format;
  }, STORAGE_KEY)).toBe('resume-studio-local-encrypted-v1');
});

test('三言語で暗号化保存の状態を表示し、削除をバックアップメニューへまとめる', async ({ page }) => {
  const cases = [
    ['ja', '#japaneseWorkspace', '#loadSampleButton', '入力例を表示', 'バックアップと復元', 'この端末の下書きを消去', '入力すると暗号化してこの端末に保存されます'],
    ['zh-CN', '#chineseWorkspace', '[data-zh-action="sample"]', '查看填写示例', '备份与恢复', '清除此设备上的草稿', '输入后将加密保存到此设备'],
    ['en', '[data-english-editor]', '[data-en-load-sample]', 'View example', 'Backup & restore', 'Clear draft from this device', 'Your input will be encrypted and saved on this device.']
  ];

  for (const [locale, workspaceSelector, sampleSelector, sampleLabel, backupLabel, clearLabel, unsavedStatus] of cases) {
    await openLocale(page, locale);
    const workspace = page.locator(workspaceSelector);
    const sampleButton = workspace.locator(sampleSelector);
    const backupMenu = page.locator('#dataMenuSummary');
    await expect(sampleButton).toBeVisible();
    await expect(sampleButton).toHaveText(sampleLabel);
    await expect(sampleButton.locator('xpath=ancestor::*[contains(@class, "draft-controls")]')).toHaveCount(1);
    await expect(workspace.locator('.draft-primary-row .draft-message')).toHaveAttribute('role', 'status');
    await expect(workspace.locator('.draft-primary-row .draft-message')).toHaveText(unsavedStatus);
    await expect(workspace.locator('.draft-clear-button, .draft-clear-notice')).toHaveCount(0);
    await expect(workspace.locator('.draft-controls')).toHaveCSS('position', 'sticky');
    await expect(page.locator('.header-actions').locator(sampleSelector)).toHaveCount(0);
    await expect(backupMenu).toHaveAttribute('aria-label', backupLabel);
    await expect(backupMenu.locator('#dataMenuLabel')).toHaveText(backupLabel);
    await expect(backupMenu.locator('#dataMenuLabel')).toBeVisible();
    await expect(backupMenu.locator('#dataMenuShortLabel')).toBeHidden();
    await backupMenu.click();
    await expect(page.locator('#clearDraftButton')).toHaveText(clearLabel);
    await expect(page.locator('#clearDraftButton')).toBeVisible();
    await backupMenu.click();

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
    ['ja', '#addProfileLinkButton', '[data-profile-link-index="0"]', '#documentPreview'],
    ['zh-CN', '[data-zh-add-profile-link]', '[data-profile-link-index="0"]', '[data-zh-preview]'],
    ['en', '[data-en-add-profile-link]', '[data-profile-link-index="0"]', '[data-en-preview]']
  ];

  for (const [locale, addSelector, fieldSelector, previewSelector] of cases) {
    await openLocale(page, locale);
    const add = page.locator(addSelector);
    await revealField(add);
    await add.click();
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

test('[mobile] 日本語: 編集・保存復元・書き出し・プレビューが操作できる', async ({ page }) => {
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
  await expect.poll(() => page.evaluate((key) => Boolean(localStorage.getItem(key)), STORAGE_KEY)).toBe(true);
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

test('[mobile] 简体中文: 编辑、保存恢复和预览均可操作', async ({ page }) => {
  await openLocale(page, 'zh-CN');
  const workspace = page.locator('#chineseWorkspace');
  const name = workspace.locator('[data-profile="fullName"]');
  await expect(name).toBeVisible();
  await name.fill('移动端 简立');
  await expect.poll(() => page.evaluate((key) => Boolean(localStorage.getItem(key)), STORAGE_KEY)).toBe(true);
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

test('[mobile] English: editing, save/restore, and preview remain operable', async ({ page }) => {
  await openLocale(page, 'en');
  const workspace = page.locator('[data-english-editor]');
  const name = workspace.locator('[data-profile-field="fullName"]');
  await expect(name).toBeVisible();
  await name.fill('Mobile Alex');
  await expect.poll(() => page.evaluate((key) => Boolean(localStorage.getItem(key)), STORAGE_KEY)).toBe(true);
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
