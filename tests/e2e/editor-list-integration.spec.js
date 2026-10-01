import { createDefaultState, createJapaneseCareer } from '../../site/assets/js/state/defaults.js';
import { createEnglishItem } from '../../site/assets/js/ui/english-editor.js';
import { createChineseItem } from '../../site/assets/js/ui/chinese-editor.js';
import { DRAFT_STORAGE_KEY, expect, expectNoPageOverflow, openLocale, test } from './fixtures.js';

function fixture() {
  const state = createDefaultState();
  state.profile.fields.links = ['https://fictional.example/first', 'https://fictional.example/second'];
  for (const locale of ['en', 'zh-CN']) {
    for (const type of ['experience', 'projects', 'education', 'certifications']) {
      state.documents[locale].resume[type] = ['2020-02', '2024-06', '2018-01'].map((date, index) => {
        const item = locale === 'en' ? createEnglishItem(type) : createChineseItem(type);
        for (const field of ['company', 'school', 'name']) if (field in item) item[field] = `Fictional ${type} ${index}`;
        if ('date' in item) item.date = date;
        else { item.startDate = date; item.endDate = date; }
        return item;
      });
    }
  }
  for (const type of ['education', 'employment', 'qualification']) state.documents.ja[type] = ['2020-02', '2024-06', '2018-01'].map((date, index) => ({ date, detail: `架空 ${type} ${index}`, ...(type === 'qualification' ? { url: '' } : {}) }));
  state.documents.ja.careers = [0, 1].map((index) => ({ ...createJapaneseCareer(), company: `架空勤務先 ${index}`, startDate: '2020-01', detailSections: [{ title: '', content: '架空正文' }, { title: '重複', content: '架空本文' }, { title: '重複', content: '架空本文2' }] }));
  return state;
}
async function seed(page, state = fixture()) {
  await page.addInitScript(({ key, state }) => localStorage.setItem(key, JSON.stringify(state)), { key: DRAFT_STORAGE_KEY, state });
}
function heading(row) { return row.locator(':scope > .sortable-row-heading'); }
async function down(row) {
  await heading(row).locator('.sortable-actions > summary').click();
  await heading(row).locator('.sortable-action-buttons > button').nth(1).click();
}
for (const locale of ['ja', 'zh-CN', 'en']) {
  for (const mobile of [false, true]) {
    test(`product lists use array order and one-time sorting ${locale} ${mobile ? '[mobile] [mobile-webkit]' : ''}`, async ({ page }) => {
      await seed(page); await openLocale(page, locale);
      const prefix = locale === 'en' ? 'en' : 'zh';
      const container = locale === 'ja' ? page.locator('#educationList') : page.locator(`[data-${prefix}-list=experience]`);
      await container.evaluate((element) => { element.closest('.form-section').open = true; });
      const rows = container.locator(':scope > .sortable-row');
      const original = await heading(rows.nth(0)).locator('.sortable-summary').textContent();
      const tools = container.locator('xpath=preceding-sibling::*[1]');
      await tools.locator('.sortable-sort').click();
      await expect(heading(rows.nth(0)).locator('.sortable-summary')).toContainText('1');
      await expect(tools.locator('.sortable-sort')).toContainText(locale === 'ja' ? '新しい順' : locale === 'en' ? 'Newest first' : '倒序');
      await down(rows.nth(0));
      await expect(tools.locator('.sortable-sort')).toContainText(locale === 'ja' ? 'カスタム' : locale === 'en' ? 'Custom' : '自定义');
      await expect(heading(rows.nth(0)).locator('.sortable-summary')).toHaveText(original);
      await heading(rows.nth(1)).locator('.sortable-handle').focus(); await page.keyboard.press('ArrowUp');
      await expect(heading(rows.nth(0)).locator('.sortable-handle')).toBeFocused();
      const input = rows.nth(0).locator(locale === 'ja' ? '[data-key=detail]' : `[data-${prefix}-item-field=company], [data-zh-key=company], [data-zh-key]`).first();
      await input.fill('Fictional edited after move');
      await expect(heading(rows.nth(0)).locator('.sortable-summary')).toHaveText('Fictional edited after move');
      await tools.locator('.sortable-fold-all').click();
      await expect(rows.nth(0).locator(':scope > .sortable-existing-body')).toBeHidden();
      await tools.locator('.sortable-fold-all').click();
      await expect(rows.nth(0).locator(':scope > .sortable-existing-body')).toBeVisible();
      await expectNoPageOverflow(page);
    });
  }
}
test('Japanese company details preserve isolation, copied structure and stable focus', async ({ page }) => {
  await seed(page); await openLocale(page, 'ja');
  await page.locator('[data-document=career]').click();
  const companies = page.locator('#careerList > .career-editor-item');
  const details = companies.nth(0).locator('[data-career-detail-list] > .career-detail-editor-item');
  await down(details.nth(0));
  await expect(details.nth(1).locator('[data-detail-key=title]')).toHaveValue('');
  await expect(companies.nth(1).locator('[data-career-detail-list] > .career-detail-editor-item').nth(0).locator('[data-detail-key=title]')).toHaveValue('');
  await heading(companies.nth(0)).locator('.sortable-actions > summary').click();
  await heading(companies.nth(0)).getByText('この構成で勤務先を追加', { exact: true }).click();
  await expect(companies).toHaveCount(3);
  await expect(companies.nth(1).locator('[data-key=company]')).toHaveValue('');
  await expect(companies.nth(1).locator('[data-key=company]')).toBeFocused();
  expect(await companies.nth(1).locator('[data-detail-key=title]').evaluateAll((fields) => fields.map((field) => field.value))).toEqual(['重複', '', '重複']);
  expect(await companies.nth(1).locator('[data-detail-key=content]').evaluateAll((fields) => fields.map((field) => field.value))).toEqual(['', '', '']);
  const ids = await companies.evaluateAll((rows) => rows.map((row) => row.dataset.careerId)); expect(new Set(ids).size).toBe(3);
});
