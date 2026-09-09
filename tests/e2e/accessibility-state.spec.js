import { expect, expectNoPageOverflow, openLocale, test } from './fixtures.js';

test('document tabs expose synchronized selection state and keyboard navigation', async ({ page }) => {
  await openLocale(page, 'ja');
  await expect(page.locator('#resumeDocumentTab')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#resumeDocumentTab')).toHaveAttribute('tabindex', '0');
  await expect(page.locator('#careerDocumentTab')).toHaveAttribute('aria-selected', 'false');
  await expect(page.locator('#careerDocumentTab')).toHaveAttribute('tabindex', '-1');
  await page.locator('#resumeDocumentTab').focus();
  await page.locator('#resumeDocumentTab').press('ArrowRight');
  await expect(page.locator('#resumeDocumentTab')).toHaveAttribute('aria-selected', 'false');
  await expect(page.locator('#resumeDocumentTab')).toHaveAttribute('tabindex', '-1');
  await expect(page.locator('#careerDocumentTab')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#careerDocumentTab')).toHaveAttribute('tabindex', '0');
  await expect(page.locator('#careerFields')).not.toHaveAttribute('hidden', '');
  await page.locator('#careerDocumentTab').press('Home');
  await expect(page.locator('#resumeDocumentTab')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#resumeDocumentTab')).toHaveAttribute('tabindex', '0');
});

test('Japanese career detail sections support editable ordered entries, confirmation, focus, and reload', async ({ page }) => {
  await openLocale(page, 'ja');
  await page.locator('#careerDocumentTab').click();

  const career = page.locator('#careerList .career-editor-item').first();
  const details = career.locator('.career-detail-editor-item');
  await expect(details).toHaveCount(2);
  await expect(details.nth(0).locator('[data-career-detail-key="title"]')).toHaveValue('担当業務');
  await expect(details.nth(1).locator('[data-career-detail-key="title"]')).toHaveValue('実績・成果');
  await expect(details.nth(0).locator('[data-career-detail-key="title"]')).toHaveAccessibleName(/勤務先 1 の項目 1（担当業務）の項目名/);
  await expect(details.nth(0).locator('[data-remove-career-detail]')).toHaveAccessibleName(/勤務先 1 の項目 1（担当業務）を削除/);

  await details.nth(0).locator('[data-career-detail-key="content"]').fill('担当した架空の業務');
  await career.locator('[data-add-career-detail]').click();
  await expect(details).toHaveCount(3);
  const added = details.nth(2);
  await expect(added.locator('[data-career-detail-key="title"]')).toBeFocused();
  await added.locator('[data-career-detail-key="title"]').fill('プロジェクト概要');
  await added.locator('[data-career-detail-key="content"]').fill('架空プロジェクトの概要');
  await expect(page.locator('#documentPreview')).toContainText('プロジェクト概要');
  await expect(page.locator('#careerDetailLive')).toContainText('項目 3 を追加しました');

  const remove = added.locator('[data-remove-career-detail]');
  await remove.focus();
  await remove.click();
  await expect(page.locator('#sampleAdoptDialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#sampleAdoptDialog')).not.toBeVisible();
  await expect(added.locator('[data-career-detail-key="content"]')).toHaveValue('架空プロジェクトの概要');
  await expect(remove).toBeFocused();

  await remove.click();
  await page.locator('#confirmSampleAdoptButton').click();
  await expect(details).toHaveCount(2);
  await expect(details.nth(1).locator('[data-career-detail-key="title"]')).toBeFocused();
  await expect(page.locator('#careerDetailLive')).toContainText('項目を削除しました');

  await career.locator('[data-add-career-detail]').click();
  await expect(details).toHaveCount(3);
  await details.nth(2).locator('[data-remove-career-detail]').click();
  await expect(page.locator('#sampleAdoptDialog')).not.toBeVisible();
  await expect(details).toHaveCount(2);
  await expect(page.locator('#saveStatus')).toHaveText('暗号化してこの端末に保存済み');
  await page.reload();
  await page.locator('#careerDocumentTab').click();
  await expect(page.locator('#careerList .career-detail-editor-item').first().locator('[data-career-detail-key="content"]')).toHaveValue('担当した架空の業務');
});

test('[mobile] mobile view controls expose synchronized selection state', async ({ page }) => {
  await openLocale(page, 'ja');
  await expect(page.locator('[data-mobile-view="editor"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('[data-mobile-view="preview"]').click();
  await expect(page.locator('[data-mobile-view="editor"]')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('[data-mobile-view="preview"]')).toHaveAttribute('aria-pressed', 'true');

  await openLocale(page, 'zh-CN');
  await expect(page.locator('[data-zh-mobile-view="editor"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('[data-zh-mobile-view="preview"]').click();
  await expect(page.locator('[data-zh-mobile-view="editor"]')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('[data-zh-mobile-view="preview"]')).toHaveAttribute('aria-pressed', 'true');

  await openLocale(page, 'en');
  await expect(page.locator('[data-en-mobile-view="editor"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('[data-en-mobile-view="preview"]').click();
  await expect(page.locator('[data-en-mobile-view="editor"]')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('[data-en-mobile-view="preview"]')).toHaveAttribute('aria-pressed', 'true');
});

test('[mobile] Japanese document and view controls remain independent and reachable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 600 });
  await openLocale(page, 'ja');

  const resumeTab = page.locator('#resumeDocumentTab');
  const careerTab = page.locator('#careerDocumentTab');
  const editorPanel = page.locator('#japaneseWorkspace .editor-panel');
  const previewScroll = page.locator('#previewScroll');

  await expect(page.locator('.document-switcher')).toBeVisible();
  await expect(resumeTab).toHaveAttribute('aria-selected', 'true');
  await expect(careerTab).toHaveAttribute('aria-selected', 'false');

  await editorPanel.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await careerTab.click();
  await expect(careerTab).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#careerFields')).toBeVisible();
  await expect(editorPanel).toHaveJSProperty('scrollTop', 0);

  await editorPanel.evaluate((element) => {
    element.scrollTop = 120;
  });
  const editorScrollTop = await editorPanel.evaluate((element) => element.scrollTop);
  expect(editorScrollTop).toBeGreaterThan(0);
  await page.locator('[data-mobile-view="preview"]').click();
  await expect(page.locator('#japaneseWorkspace')).toHaveAttribute('data-mobile-mode', 'preview');
  await expect(page.locator('#previewDocumentName')).toHaveText('職務経歴書');
  await expect(careerTab).toHaveAttribute('aria-selected', 'true');

  await previewScroll.evaluate((element) => {
    element.scrollTop = 120;
  });
  expect(await previewScroll.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await resumeTab.click();
  await expect(resumeTab).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#previewDocumentName')).toHaveText('履歴書');
  await expect(previewScroll).toHaveJSProperty('scrollTop', 0);
  await expect(page.locator('#japaneseWorkspace')).toHaveAttribute('data-mobile-mode', 'preview');
  await page.locator('[data-mobile-view="editor"]').click();
  await expect(editorPanel).toHaveJSProperty('scrollTop', editorScrollTop);
  await expectNoPageOverflow(page);
});

test('[mobile] Japanese document controls fit the supported mobile breakpoint range', async ({ page }) => {
  for (const width of [320, 390, 820]) {
    await page.setViewportSize({ width, height: 844 });
    await openLocale(page, 'ja');

    const layout = await page.locator('.document-switcher').evaluate((switcher) => ({
      buttons: Array.from(switcher.querySelectorAll('.document-tab'), (button) => ({
        height: button.getBoundingClientRect().height,
        right: button.getBoundingClientRect().right,
        scrollWidth: button.scrollWidth,
        width: button.clientWidth
      })),
      left: switcher.getBoundingClientRect().left,
      right: switcher.getBoundingClientRect().right
    }));

    expect(layout.buttons).toHaveLength(2);
    for (const button of layout.buttons) {
      expect(button.height).toBeGreaterThanOrEqual(44);
      expect(button.scrollWidth).toBeLessThanOrEqual(button.width);
      expect(button.right).toBeLessThanOrEqual(layout.right);
    }
    expect(layout.left).toBeGreaterThanOrEqual(0);
    expect(layout.right).toBeLessThanOrEqual(width);
    await expectNoPageOverflow(page);
  }
});

test('[mobile] 320px header keeps readable locale choices and separate controls in every locale', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });

  for (const locale of ['ja', 'zh-CN', 'en']) {
    await openLocale(page, locale);

    const layout = await page.evaluate(() => {
      const rect = (selector) => document.querySelector(selector).getBoundingClientRect().toJSON();
      return {
        actions: rect('.header-actions'),
        brand: rect('.brand'),
        image: rect('.brand-mark'),
        locale: rect('#localeSelect'),
        menu: rect('#dataMenuSummary'),
        print: rect('#printButton')
      };
    });
    expect(layout.image.width).toBe(34);
    expect(layout.image.height).toBe(34);
    expect(layout.brand.right).toBeLessThanOrEqual(layout.actions.left);
    expect(layout.locale.right).toBeLessThanOrEqual(layout.menu.left);
    expect(layout.menu.right).toBeLessThanOrEqual(layout.print.left);
    await expect(page.locator('#localeSelect')).toHaveCSS('font-size', '11px');
    await expect(page.locator('#printButton')).toBeVisible();
    if (locale === 'ja') {
      const documentTabs = page.locator('.document-tab');
      await expect(documentTabs).toHaveCount(2);
      for (const tab of await documentTabs.all()) {
        await expect(tab).toBeVisible();
        const size = await tab.evaluate((element) => ({
          clientWidth: element.clientWidth,
          height: element.getBoundingClientRect().height,
          scrollWidth: element.scrollWidth
        }));
        expect(size.height).toBeGreaterThanOrEqual(44);
        expect(size.scrollWidth).toBeLessThanOrEqual(size.clientWidth);
      }
    } else {
      await expect(page.locator('.document-switcher')).toBeHidden();
    }
    await expectNoPageOverflow(page);
  }
});

test('brand link follows the active editor locale', async ({ page }) => {
  for (const [locale, entryPath, accessibleName] of [
    ['ja', '../', 'Resume Studio の紹介ページを開く'],
    ['zh-CN', '../zh-cn/', '打开 Resume Studio 简介页'],
    ['en', '../en/', 'Open the Resume Studio introduction']
  ]) {
    await openLocale(page, locale);
    await expect(page.locator('.brand')).toHaveAttribute('href', entryPath);
    await expect(page.locator('.brand')).toHaveAttribute('aria-label', accessibleName);
  }
});

test('localized public pages remain useful when JavaScript is disabled', async ({ baseURL, browser }) => {
  const context = await browser.newContext({ baseURL, javaScriptEnabled: false });
  const page = await context.newPage();
  for (const [path, language, heading] of [
    ['/', 'ja', '日本語の履歴書・職務経歴書を作成'],
    ['/zh-cn/', 'zh-CN', '创建简体中文简历'],
    ['/en/', 'en', 'Create an English resume']
  ]) {
    await page.goto(path);
    await expect(page.locator('html')).toHaveAttribute('lang', language);
    await expect(page.locator('h1')).toHaveText(heading);
    await expect(page.locator('.entry-mark')).toHaveAttribute('alt', '');
    await expect(page.locator('.entry-mark')).toHaveAttribute('width', '50');
    await expect(page.locator('.entry-mark')).toHaveAttribute('height', '50');
    await expect(page.locator('.entry-header')).toHaveCSS('padding', '30px');
    await expect(page.locator('.entry-main')).toHaveCSS('max-width', '650px');
    await expect(page.locator('.entry-main h1')).toHaveCSS('font-size', '31px');
    await expect(page.locator('.entry-lede')).toHaveCSS('font-size', '16px');
    await expect(page.locator('.entry-trust-row')).toHaveCount(2);
    await expect(page.locator('.entry-trust-dot').first()).toHaveCSS('height', '19px');
    await expect(page.locator('[data-analytics-disclosure="status"]')).toHaveCount(1);
    await expect(page.locator('.entry-button')).toBeVisible();
    const xContact = page.locator('.x-contact-link');
    await expect(xContact).toBeVisible();
    await expect(xContact).toHaveAccessibleName('X: @kanhigher');
    await expect(xContact).toHaveAttribute('href', 'https://x.com/kanhigher');
  }
  await context.close();
});

test('legacy Japanese URL remains useful without joining the public hreflang cluster', async ({ baseURL, browser }) => {
  const context = await browser.newContext({ baseURL, javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto('/ja/');
  await expect(page).toHaveURL(/\/ja\/$/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'ja');
  await expect(page.locator('h1')).toHaveText('日本語の履歴書・職務経歴書を作成');
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://herehigher.github.io/resume/');
  await expect(page.locator('link[rel="alternate"]')).toHaveCount(0);
  await expect(page.locator('.entry-button')).toHaveAttribute('href', '../editor/?lang=ja');
  await context.close();
});

test('homepage and locale CTAs lead to the matching editor locale', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#localeSelect')).toHaveCount(0);
  await expect(page.locator('a[href="./ja/"]')).toHaveCount(0);
  await expect(page.locator('.entry-button')).toHaveAttribute('href', './editor/?lang=ja');
  await page.locator('.entry-button').click();
  await expect(page.locator('#localeSelect')).toHaveValue('ja');
  await expect(page.locator('.brand')).toHaveAttribute('href', '../');

  for (const [landingPath, locale] of [
    ['/zh-cn/', 'zh-CN'],
    ['/en/', 'en']
  ]) {
    await page.goto(landingPath);
    await expect(page.locator('.entry-button')).toHaveAttribute('href', `../editor/?lang=${locale}`);
    await page.locator('.entry-button').click();
    await expect(page.locator('#localeSelect')).toHaveValue(locale);
    await expect(page.locator('.brand')).toHaveAttribute('href', `../${landingPath.slice(1)}`);
  }
});

test('[mobile] 320px localized public entries keep the centered brand, heading, and primary button separate', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  for (const path of ['/', '/zh-cn/', '/en/']) {
    await page.goto(path);
    const layout = await page.evaluate(() => {
      const rect = (selector) => document.querySelector(selector).getBoundingClientRect().toJSON();
      return {
        brand: rect('.entry-brand'),
        button: rect('.entry-button'),
        brandCopy: rect('.entry-brand-copy'),
        heading: rect('h1'),
        mark: rect('.entry-mark')
      };
    });
    expect(layout.mark.width).toBe(50);
    expect(layout.mark.height).toBe(50);
    expect(Math.abs((layout.mark.top + layout.mark.bottom) / 2 - (layout.brandCopy.top + layout.brandCopy.bottom) / 2)).toBeLessThanOrEqual(1);
    expect(layout.brand.bottom).toBeLessThanOrEqual(layout.heading.top);
    expect(layout.heading.bottom).toBeLessThanOrEqual(layout.button.top);
    await expect(page.locator('.entry-header')).toHaveCSS('padding', '20px');
    await expect(page.locator('.entry-main h1')).toHaveCSS('font-size', '23px');
    await expect(page.locator('.entry-lede')).toHaveCSS('font-size', '15px');
    await expect(page.locator('.entry-button')).toHaveCSS('min-height', '46px');
    await expect(page.locator('.x-contact-link')).toBeVisible();
    await expectNoPageOverflow(page);
  }
});
