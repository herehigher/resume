import { readFile } from 'node:fs/promises';
import { getMessages } from '../../site/assets/js/i18n/index.js';
import { createDefaultState } from '../../site/assets/js/state/defaults.js';
import { expect, expectNoPageOverflow, openLocale, readPersistedState, test, waitForPersistedState } from './fixtures.js';

async function download(page, button) {
  await page.locator('#dataMenuSummary').click();
  const promise = page.waitForEvent('download');
  await page.locator(button).click();
  const result = await promise;
  await expect(page.locator('.data-menu')).not.toHaveAttribute('open', '');
  return { filename: result.suggestedFilename(), text: await readFile(await result.path(), 'utf8') };
}

const variants = [
  ['ja', 'resume', '[name="motivation"]', '日本語の架空文案', 'Markdownを書き出す'],
  ['ja', 'career', '[name="careerSummary"]', '架空の職務要約', 'Markdownを書き出す'],
  ['zh-CN', 'resume', '[data-resume="summary"]', '简体中文架空文案', '导出 Markdown'],
  ['en', 'resume', '[data-resume-field="summary"]', 'Fictional English wording', 'Export Markdown']
];

for (const [locale, type, selector, marker, label] of variants) {
  test(`${locale} ${type}: current edited Markdown downloads locally without altering the encrypted draft or JSON`, async ({ page }) => {
    await openLocale(page, locale);
    const state = createDefaultState(locale);
    Object.assign(state.profile.fields, { fullName: 'Fictional Example', address: 'Hidden Fictional Address', birthDate: '1990-02-03', nationality: 'Fictionland', gender: 'female', phone: '0000000000', email: 'fictional@example.com', links: ['https://example.com/fictional'] });
    state.documents.ja.activeDocument = type;
    state.documents.ja.fields.motivation = 'OTHER_JAPANESE_RESUME';
    state.documents.ja.fields.careerSummary = 'OTHER_JAPANESE_CAREER';
    state.documents['zh-CN'].resume.summary = 'OTHER_CHINESE';
    state.documents.en.resume.summary = 'OTHER_ENGLISH';
    await page.locator('#importDataInput').setInputFiles({ name: 'fictional-markdown.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(state)) });
    await page.locator('#confirmSampleAdoptButton').click();
    await expect(page.locator('#globalMessage')).toHaveText(getMessages(locale).importSuccess);
    const input = page.locator(selector);
    await input.evaluate((element) => { const details = element.closest('details'); if (details) details.open = true; });
    const editedText = `${marker}\n# Literal heading\n===\nhttps://example.com\nfictional@example.com`;
    await input.fill(editedText);
    const expected = locale === 'ja' ? { documents: { ja: { fields: { [type === 'resume' ? 'motivation' : 'careerSummary']: editedText } } } }
      : { documents: { [locale]: { resume: { summary: editedText } } } };
    await waitForPersistedState(page, expected);
    const before = await readPersistedState(page);
    const rawBefore = await page.evaluate(() => JSON.stringify(Object.entries(localStorage)));
    const jsonBefore = JSON.parse((await download(page, '#exportDataButton')).text);
    await page.locator('#dataMenuSummary').click();
    await expect(page.locator('#exportMarkdownButton')).toHaveText(label);
    await expect(page.locator('#markdownExportHelp')).toContainText('JSON');
    const promise = page.waitForEvent('download');
    await page.locator('#exportMarkdownButton').click();
    const result = await promise;
    const text = await readFile(await result.path(), 'utf8');
    expect(result.suggestedFilename()).toBe(`resume-studio-${locale}-${type}.md`);
    expect(text).toContain(marker);
    expect(text).toContain('\\# Literal heading');
    expect(text).toContain('\\=\\=\\=');
    expect(text).toContain('fictional&#64;example\\.com');
    for (const excluded of ['OTHER_JAPANESE_RESUME', 'OTHER_JAPANESE_CAREER', 'OTHER_CHINESE', 'OTHER_ENGLISH', 'pageBreaks', 'pageSize']) expect(text).not.toContain(excluded.replaceAll('_', '\\_'));
    if (locale === 'en' || type === 'career') expect(text).not.toContain('Hidden Fictional Address');
    if (type === 'career') expect(text).not.toContain('0000000000');
    await expect(page.locator('.data-menu')).not.toHaveAttribute('open', '');
    expect(await readPersistedState(page)).toEqual(before);
    expect(await page.evaluate(() => JSON.stringify(Object.entries(localStorage)))).toBe(rawBefore);
    expect(JSON.parse((await download(page, '#exportDataButton')).text)).toEqual(jsonBefore);
    await expect(input).toHaveValue(editedText);
    await expectNoPageOverflow(page);
  });
}

for (const locale of ['ja', 'zh-CN', 'en']) {
  test(`[mobile] [mobile-webkit] ${locale}: Markdown export menu is reachable and preserves current content`, async ({ page }) => {
    await openLocale(page, locale);
    const name = page.locator(locale === 'ja' ? '[name="fullName"]' : locale === 'en' ? '[data-profile-field="fullName"]' : '[data-profile="fullName"]');
    await name.fill('架空 Fictional Mobile');
    const result = await download(page, '#exportMarkdownButton');
    expect(result.filename).toBe(`resume-studio-${locale}-resume.md`);
    expect(result.text).toContain('架空 Fictional Mobile');
    await expect(name).toHaveValue('架空 Fictional Mobile');
    await expectNoPageOverflow(page);
    await page.locator('#dataMenuSummary').click();
    const menu = await page.locator('.data-menu-panel').boundingBox();
    const viewport = page.viewportSize();
    expect(menu.x).toBeGreaterThanOrEqual(0);
    expect(menu.x + menu.width).toBeLessThanOrEqual(viewport.width);
    expect(menu.y + menu.height).toBeLessThanOrEqual(viewport.height);
  });
}
