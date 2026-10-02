import { createDefaultState, createJapaneseCareer } from '../../site/assets/js/state/defaults.js';
import { createEnglishItem } from '../../site/assets/js/ui/english-editor.js';
import { createChineseItem } from '../../site/assets/js/ui/chinese-editor.js';
import { DRAFT_STORAGE_KEY, expect, expectNoPageOverflow, openLocale, test, waitForPersistedState } from './fixtures.js';

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
  await page.addInitScript(({ key, state }) => { if (!sessionStorage.getItem('fictitious-list-seeded')) { localStorage.setItem(key, JSON.stringify(state)); sessionStorage.setItem('fictitious-list-seeded', 'true'); } }, { key: DRAFT_STORAGE_KEY, state });
}
function heading(row) { return row.locator(':scope > .sortable-row-heading'); }
async function down(row) {
  await heading(row).locator('.sortable-actions > summary').click();
  await heading(row).locator('.sortable-action-buttons > button').nth(1).click();
}
for (const locale of ['ja', 'zh-CN', 'en']) {
  test(`product lists use array order and one-time sorting ${locale}`, async ({ page }) => {
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

test('shared links keep the moved identity through delete, encrypted reload and JSON roundtrip', async ({ page }) => {
  await seed(page); await openLocale(page, 'ja');
  const container = page.locator('#profileLinksEditor');
  await container.evaluate((element) => { element.closest('.form-section').open = true; });
  const rows = container.locator(':scope > .sortable-row');
  await down(rows.nth(0));
  await expect(rows.nth(0).locator('[data-profile-link-index="0"]')).toHaveValue('https://fictional.example/second');
  await rows.nth(0).locator('[data-profile-link-index="0"]').fill('https://fictional.example/edited-second');
  await heading(rows.nth(0)).locator('.sortable-actions > summary').click();
  await heading(rows.nth(0)).locator('[data-remove-profile-link]').click();
  await expect(rows).toHaveCount(1);
  await expect(rows.nth(0).locator('[data-profile-link-index="0"]')).toHaveValue('https://fictional.example/first');
  await waitForPersistedState(page, { profile: { fields: { links: ['https://fictional.example/first'] } } });
  await page.reload();
  await expect(page.locator('#profileLinksEditor [data-profile-link-index="0"]')).toHaveValue('https://fictional.example/first');
  await page.locator('#localeSelect').selectOption('en');
  await expect(page.locator('[data-en-profile-links] [data-profile-link-index="0"]')).toHaveValue('https://fictional.example/first');
  await page.locator('[data-en-add-profile-link]').click();
  await page.locator('[data-en-add-profile-link]').click();
  await expect(page.locator('[data-en-add-profile-link]')).toBeDisabled();
  await page.locator('#dataMenuSummary').click();
  const downloading = page.waitForEvent('download'); await page.locator('#exportDataButton').click();
  const stream = await (await downloading).createReadStream(); const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const exported = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  expect(exported.version).toBe(4); expect(exported.profile.fields.links).toEqual(['https://fictional.example/first', '', '']);
  expect(JSON.stringify(exported)).not.toMatch(/sortState|foldStates|collapsed/);
  await page.locator('#importDataInput').setInputFiles({ name: 'fictitious-order-roundtrip.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(exported)) });
  await page.locator('#confirmSampleAdoptButton').click();
  await expect(page.locator('[data-en-profile-links] [data-profile-link-index="0"]')).toHaveValue('https://fictional.example/first');
});

test('date sort direction is transient; real date edits reset it without moving entries', async ({ page }) => {
  await seed(page); await openLocale(page, 'en');
  const container = page.locator('[data-en-list=certifications]');
  await container.evaluate((node) => { node.closest('.form-section').open = true; });
  const tools = container.locator('xpath=preceding-sibling::*[1]');
  await tools.locator('.sortable-sort').click();
  const rows = container.locator(':scope > .sortable-row');
  const before = await rows.locator('.sortable-summary').allTextContents();
  await rows.nth(0).locator('[data-en-item-field=name]').fill('Fictional revised title');
  await expect(tools.locator('.sortable-sort')).toContainText('Newest first');
  await rows.nth(0).locator('[data-en-item-field=date]').fill('2000-01');
  await expect(tools.locator('.sortable-sort')).toContainText('Custom');
  expect((await rows.locator('.sortable-summary').allTextContents()).slice(1)).toEqual(before.slice(1));
  await tools.locator('.sortable-sort').click();
  await expect(tools.locator('.sortable-sort')).toContainText('Newest first');
  await page.locator('[data-en-add=certifications]').click();
  await expect(tools.locator('.sortable-sort')).toContainText('Custom');
});

test('copying a company with no details uses the untouched default headings', async ({ page }) => {
  const state = fixture(); state.documents.ja.careers[0].detailSections = [];
  await seed(page, state); await openLocale(page, 'ja'); await page.locator('[data-document=career]').click();
  const companies = page.locator('#careerList > .career-editor-item');
  await heading(companies.nth(0)).locator('.sortable-actions > summary').click();
  await heading(companies.nth(0)).getByText('この構成で勤務先を追加', { exact: true }).click();
  expect(await companies.nth(1).locator('[data-detail-key=title]').evaluateAll((fields) => fields.map((field) => field.value))).toEqual(['担当業務', '実績・成果']);
  await companies.nth(1).locator('[data-detail-key=title]').first().fill('架空の独立した見出し');
  await expect(companies.nth(0).locator('[data-detail-key=title]')).toHaveCount(0);
  await expect(companies.nth(2).locator('[data-detail-key=title]').first()).toHaveValue('');
});

for (const mobile of [false, true]) {
  test(`Japanese product parent and detail pointer drags remain isolated ${mobile ? '[mobile] [mobile-webkit]' : ''}`, async ({ page }) => {
    await seed(page); await openLocale(page, 'ja'); await page.locator('[data-document=career]').click();
    const companies = page.locator('#careerList > .career-editor-item');
    const sourceId = await companies.nth(0).getAttribute('data-career-id');
    const siblingId = await companies.nth(1).getAttribute('data-career-id');
    const details = companies.nth(0).locator('[data-career-detail-list] > .career-detail-editor-item');
    async function dragLast(rows) {
      const handle = heading(rows.nth(0)).locator('.sortable-handle'); await handle.evaluate((element) => element.scrollIntoView({ block: 'center' }));
      const start = await handle.boundingBox(); const x = start.x + start.width / 2; const y = start.y + start.height / 2;
      expect(await handle.evaluate((element, point) => element.contains(document.elementFromPoint(point.x, point.y)), { x, y })).toBe(true);
      await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + 8, y);
      await expect(page.locator('.sortable-placeholder')).toBeVisible();
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      let target = await rows.last().boundingBox();
      await page.mouse.move(target.x + target.width / 2, target.y + target.height - 4); await page.waitForTimeout(40);
      target = await rows.last().boundingBox();
      await page.mouse.move(target.x + target.width / 2, target.y + target.height - 4); await page.mouse.up();
      await expect(page.locator('.sortable-placeholder, .sortable-drag-float')).toHaveCount(0);
    }
    await dragLast(details);
    await expect(details.nth(2).locator('[data-detail-key=title]')).toHaveValue('');
    await expect(companies.nth(0)).toHaveAttribute('data-career-id', sourceId);
    await expect(companies.nth(1)).toHaveAttribute('data-career-id', siblingId);
    await expect(companies.nth(1).locator('[data-detail-key=title]').first()).toHaveValue('');
    await dragLast(companies);
    await expect(companies.nth(1)).toHaveAttribute('data-career-id', sourceId);
    await expect(companies.nth(0)).toHaveAttribute('data-career-id', siblingId);
    await heading(companies.nth(1)).locator('.sortable-toggle').click();
    await expect(companies.nth(1).locator('[data-career-detail-list] > .career-detail-editor-item').nth(2).locator('[data-detail-key=title]')).toHaveValue('');
    await expect(companies.nth(1).locator('[data-career-detail-list] > .career-detail-editor-item').nth(0)).toHaveClass(/is-collapsed/);
  });
}

for (const target of ['company', 'detail']) {
  test(`deletion focuses a collapsed surviving Japanese ${target} without opening it`, async ({ page }) => {
    const state = createDefaultState();
    state.documents.ja.careers = [createJapaneseCareer(), createJapaneseCareer()];
    if (target === 'detail') state.documents.ja.careers = [createJapaneseCareer()];
    await seed(page, state); await openLocale(page, 'ja'); await page.locator('[data-document=career]').click();
    const companies = page.locator('#careerList > .career-editor-item');
    const rows = target === 'company' ? companies : companies.first().locator('[data-career-detail-list] > .career-detail-editor-item');
    await heading(rows.nth(1)).locator('.sortable-toggle').click();
    await heading(rows.first()).locator('.sortable-actions > summary').click();
    await heading(rows.first()).locator(target === 'company' ? '.remove-career-button' : '.remove-career-detail-button').click();
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toHaveClass(/is-collapsed/);
    await expect(heading(rows.first()).locator('.sortable-toggle')).toBeFocused();
  });
}

for (const locale of ['ja', 'zh-CN', 'en']) {
  test(`cancelled and failed imports immediately unblock ${locale} list controls`, async ({ page }) => {
    await seed(page); await openLocale(page, locale);
    const list = page.locator(locale === 'ja' ? '#educationList' : `[data-${locale === 'en' ? 'en' : 'zh'}-list=experience]`);
    await list.evaluate((element) => { element.closest('.form-section').open = true; });
    const rows = list.locator(':scope > .sortable-row');
    const sort = list.locator('xpath=preceding-sibling::*[1]').locator('.sortable-sort');
    for (const outcome of ['cancel', 'failed']) {
      await page.locator('#importDataInput').setInputFiles({ name: 'fictional-import.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(createDefaultState(locale))) });
      await expect(sort).toBeDisabled();
      if (outcome === 'failed') {
        await page.evaluate((key) => {
          const original = Storage.prototype.setItem;
          Storage.prototype.setItem = function (name, value) {
            if (name === key) throw new DOMException('Fictitious quota failure', 'QuotaExceededError');
            return original.call(this, name, value);
          };
          window.__restoreFictitiousStorage = () => { Storage.prototype.setItem = original; };
        }, DRAFT_STORAGE_KEY);
      }
      await page.locator(outcome === 'cancel' ? '#cancelSampleAdoptButton' : '#confirmSampleAdoptButton').click();
      await expect(page.locator('#importDataInput')).toHaveValue('');
      await expect(sort).toBeEnabled();
      await expect(rows).toHaveCount(3);
      await expect(heading(rows.first()).locator('.sortable-handle')).toBeEnabled();
      await heading(rows.first()).locator('.sortable-actions > summary').click();
      await expect(heading(rows.first()).locator('.sortable-action-buttons > button').nth(1)).toBeEnabled();
      await heading(rows.first()).locator('.sortable-actions > summary').click();
      if (outcome === 'failed') await page.evaluate(() => window.__restoreFictitiousStorage());
    }
    await sort.click();
    await expect(sort).toContainText(locale === 'ja' ? '新しい順' : locale === 'en' ? 'Newest first' : '倒序');
  });
}

for (const target of ['company', 'detail']) {
  test(`mouse cancellation restores the visible Japanese ${target} menu focus`, async ({ page }) => {
    await seed(page); await openLocale(page, 'ja'); await page.locator('[data-document=career]').click();
    const company = page.locator('#careerList > .career-editor-item').first();
    const row = target === 'company' ? company : company.locator('[data-career-detail-list] > .career-detail-editor-item').first();
    await heading(row).locator('.sortable-toggle').click();
    const menu = heading(row).locator('.sortable-actions > summary');
    await menu.click();
    await heading(row).locator(target === 'company' ? '.remove-career-button' : '.remove-career-detail-button').click();
    await page.locator('#cancelSampleAdoptButton').click();
    await expect(menu).toBeFocused();
    await expect(row).toHaveClass(/is-collapsed/);
    await expect(page.locator('#careerList > .career-editor-item')).toHaveCount(2);
    await expect(company.locator('[data-career-detail-list] > .career-detail-editor-item')).toHaveCount(3);
  });
}
