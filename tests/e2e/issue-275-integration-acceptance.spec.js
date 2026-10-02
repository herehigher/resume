import { readFile } from 'node:fs/promises';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createDefaultState, createJapaneseCareer } from '../../site/assets/js/state/defaults.js';
import { createChineseItem } from '../../site/assets/js/ui/chinese-editor.js';
import { createEnglishItem } from '../../site/assets/js/ui/english-editor.js';
import { DRAFT_STORAGE_KEY, expect, expectNoPageOverflow, openLocale, readPersistedState, test, waitForPersistedState } from './fixtures.js';

// Explicit product selectors keep this acceptance independent of registry wiring.
const targets = [
  ...['education', 'employment', 'qualification'].map((type) => ({
    key: `ja.${type}`, locale: 'ja', list: `#${type}List`, field: '[data-key=detail]',
    add: `[data-add=${type}]`, remove: '.remove-row-button', kind: 'date'
  })),
  { key: 'ja.careers', locale: 'ja', list: '#careerList', field: '[data-key=company]', add: '[data-add=career]', remove: '.remove-career-button', kind: 'range', career: true },
  { key: 'ja.careerDetails', locale: 'ja', list: '#careerList > .career-editor-item:first-child [data-career-detail-list]', field: '[data-detail-key=title]', add: '#careerList > .career-editor-item:first-child [data-add-detail-section]', remove: '.remove-career-detail-button', career: true },
  ...['zh-CN', 'en'].flatMap((locale) => ['experience', 'projects', 'education', 'certifications'].map((type) => {
    const prefix = locale === 'en' ? 'en' : 'zh';
    const field = type === 'experience' ? 'company' : type === 'education' ? 'school' : 'name';
    return { key: `${locale}.${type}`, locale, list: `[data-${prefix}-list=${type}]`,
      field: `[data-${prefix}-${prefix === 'en' ? 'item-field' : 'key'}=${field}]`,
      add: `[data-${prefix}-add=${type}]`, remove: `[data-${prefix}-remove]`, kind: type === 'certifications' ? 'date' : 'range' };
  })),
  { key: 'profile.links', locale: 'ja', list: '#profileLinksEditor', field: '[data-profile-link-index]', add: '#addProfileLinkButton', remove: '[data-remove-profile-link]' }
];

function items(state, target) {
  if (target.key === 'profile.links') return state.profile.fields.links;
  if (target.key === 'ja.careerDetails') return state.documents.ja.careers[0].detailSections;
  const type = target.key.split('.').at(-1);
  return target.locale === 'ja' ? state.documents.ja[type] : state.documents[target.locale].resume[type];
}
function labelField(target) {
  if (target.key === 'ja.careerDetails') return 'title';
  if (target.locale === 'ja') return target.career ? 'company' : 'detail';
  const type = target.key.split('.').at(-1);
  return type === 'experience' ? 'company' : type === 'education' ? 'school' : 'name';
}
function label(item, target) { return typeof item === 'string' ? item : item[labelField(target)]; }
function fixture() {
  const state = createDefaultState();
  state.profile.fields.fullName = 'Fictitious Acceptance Person';
  state.documents.ja.careers = [createJapaneseCareer(), createJapaneseCareer()];
  for (const target of targets) {
    const list = items(state, target);
    const template = target.key === 'profile.links' ? '' : list[0] || (target.locale === 'en' ? createEnglishItem(target.key.split('.').at(-1)) : createChineseItem(target.key.split('.').at(-1)));
    list.splice(0, list.length, ...[0, 1].map((index) => {
      if (target.key === 'profile.links') return 'https://fictional.example/duplicate';
      const item = structuredClone(template);
      if ('id' in item) item.id = `record_acceptance-${target.key.replace(/[^a-z]/gi, '-')}-${index}`;
      item[labelField(target)] = 'Fictitious duplicate';
      if (target.kind === 'date') item.date = index ? '2024-01' : '2018-01';
      if (target.kind === 'range') { item.startDate = index ? '2024-01' : '2018-01'; item.endDate = ''; }
      return item;
    }));
  }
  return state;
}
async function seed(page, state) {
  // Seed an existing v4 draft only once, so reload exercises encrypted storage.
  await page.addInitScript(({ key, state }) => {
    if (sessionStorage.getItem('fictitious-275-seeded')) return;
    localStorage.setItem(key, JSON.stringify(state));
    sessionStorage.setItem('fictitious-275-seeded', 'yes');
  }, { key: DRAFT_STORAGE_KEY, state });
}
async function exportState(page) {
  const menu = page.locator('#dataMenuSummary').locator('..');
  if (await menu.getAttribute('open') === null) await page.locator('#dataMenuSummary').click();
  const pending = page.waitForEvent('download');
  await page.locator('#exportDataButton').click();
  return JSON.parse(await readFile(await (await pending).path(), 'utf8'));
}
async function importState(page, state) {
  await page.locator('#importDataInput').setInputFiles({ name: 'fictitious-275.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(state)) });
  await page.locator('#confirmSampleAdoptButton').click();
  await expect(page.locator('#importDataInput')).toHaveValue('');
}
async function reveal(page, target) {
  if (target.career) await page.locator('[data-document=career]').click();
  const container = page.locator(target.list);
  await container.evaluate((element) => { const section = element.closest('.form-section'); if (section) section.open = true; });
  return container;
}
function heading(row) { return row.locator(':scope > .sortable-row-heading'); }
async function action(row, index) {
  const menu = heading(row).locator('.sortable-actions');
  if (await menu.getAttribute('open') === null) await menu.locator(':scope > summary').click();
  await menu.locator('.sortable-action-buttons > button').nth(index).click();
}
async function remove(page, row, target) {
  const menu = heading(row).locator('.sortable-actions');
  if (await menu.getAttribute('open') === null) await menu.locator(':scope > summary').click();
  await menu.locator(target.remove).click();
  if (target.career) await page.locator('#confirmSampleAdoptButton').click();
}
async function stored(page) { return page.evaluate((key) => localStorage.getItem(key), DRAFT_STORAGE_KEY); }
function listExpectation(state, target) {
  if (target.key === 'profile.links') return { profile: { fields: { links: items(state, target) } } };
  const key = target.key.split('.').at(-1);
  if (target.locale === 'ja') return { documents: { ja: { [target.key === 'ja.careerDetails' ? 'careers' : key]: target.key === 'ja.careerDetails' ? state.documents.ja.careers : items(state, target) } } };
  return { documents: { [target.locale]: { resume: { [key]: items(state, target) } } } };
}
async function rowValues(rows, target) {
  return rows.locator(target.field).evaluateAll((fields) => fields.map((field) => field.value));
}
const roundtripKeys = ['ja.education', 'ja.careers', 'ja.careerDetails', 'zh-CN.experience', 'en.experience', 'profile.links'];
const mobileKeys = ['zh-CN.experience', 'en.experience', 'profile.links'];

for (const target of targets) {
  for (const mobile of mobileKeys.includes(target.key) ? [false, true] : [false]) {
    test(`275 ${target.key}: product CRUD${roundtripKeys.includes(target.key) ? ", encrypted reload and JSON roundtrip" : " wiring"} ${mobile ? '[mobile] [mobile-webkit]' : ''}`, async ({ page }) => {
      const initial = fixture();
      const before = structuredClone(items(initial, target));
      await seed(page, initial); await openLocale(page, target.locale);
      const container = await reveal(page, target);
      const rows = container.locator(':scope > .sortable-row');
      expect(await rowValues(rows, target)).toEqual(before.map((item) => label(item, target)));
      if (target.kind) {
        const sort = container.locator('xpath=preceding-sibling::*[1]').locator('.sortable-sort');
        await sort.click();
        await expect(rows.first().locator('input[type="month"]').first()).toHaveValue('2024-01');
        await sort.click();
        await expect(rows.first().locator('input[type="month"]').first()).toHaveValue('2018-01');
        if (['ja.education', 'en.experience'].includes(target.key)) {
          await beginDrag(page, heading(rows.first()).locator('.sortable-handle'));
          const destination = await rows.last().boundingBox();
          await page.mouse.move(destination.x + destination.width / 2, destination.y + destination.height - 3);
          await page.mouse.up(); await cleanDrag(page);
          await expect(rows.first().locator('input[type="month"]').first()).toHaveValue('2024-01');
          await expect(sort).toContainText(target.locale === 'ja' ? 'カスタム' : 'Custom');
          await action(rows.first(), 1);
          await expect(rows.first().locator('input[type="month"]').first()).toHaveValue('2018-01');
        }
      }
      await page.locator(target.add).click();
      await expect(rows).toHaveCount(3);
      // The added all-empty row must be independently movable before editing.
      await heading(rows.nth(2)).locator('.sortable-toggle').click();
      await heading(rows.nth(2)).locator('.sortable-handle').focus();
      await page.keyboard.press('ArrowUp');
      await expect(rows.nth(1)).toHaveClass(/is-collapsed/);
      await expect(heading(rows.nth(1)).locator('.sortable-handle')).toBeFocused();
      await expect(rows.nth(0)).not.toHaveClass(/is-collapsed/);
      await expect(rows.nth(1).locator(target.field).first()).toHaveValue('');
      await heading(rows.nth(1)).locator('.sortable-toggle').click();
      const marker = target.key === 'profile.links' ? 'https://fictional.example/275-edited' : `Fictitious edited ${target.key}`;
      await rows.nth(1).locator(target.field).first().fill(marker);
      await expect(heading(rows.nth(1)).locator('.sortable-summary')).toHaveText(marker);
      await action(rows.nth(1), 1);
      await action(rows.nth(2), 0);
      await heading(rows.nth(1)).locator('.sortable-toggle').click();
      await remove(page, rows.nth(2), target);
      await expect(rows).toHaveCount(2);
      await expect(rows.nth(1)).toHaveClass(/is-collapsed/);
      const exported = await exportState(page);
      expect(items(exported, target)[0]).toEqual(before[0]);
      expect(label(items(exported, target)[1], target)).toBe(marker);
      const added = items(exported, target)[1];
      if (added.id) expect(before.map((item) => item.id)).not.toContain(added.id);
      expect(exported.version).toBe(4);
      expect(JSON.stringify(exported)).not.toMatch(/sortState|foldStates|collapsed/);
      if (!roundtripKeys.includes(target.key)) return;
      await waitForPersistedState(page, listExpectation(exported, target));
      expect(await stored(page)).not.toContain(marker);
      await page.reload(); await reveal(page, target);
      expect(await rowValues(rows, target)).toEqual(items(exported, target).map((item) => label(item, target)));
      expect(items(await readPersistedState(page), target)).toEqual(items(exported, target));
      await expect(rows.nth(1)).not.toHaveClass(/is-collapsed/);
      await importState(page, exported); await reveal(page, target);
      await waitForPersistedState(page, listExpectation(exported, target));
      expect(items(await readPersistedState(page), target)).toEqual(items(exported, target));
      await expect(rows.nth(1).locator(target.field).first()).toHaveValue(marker);
      await expectNoPageOverflow(page);
      if (mobile) {
        const locale = target.locale;
        await page.locator(locale === 'ja' ? '[data-mobile-view=preview]' : `[data-${locale === 'en' ? 'en' : 'zh'}-mobile-view=preview]`).click();
        const preview = page.locator(locale === 'ja' ? '#documentPreview' : `[data-${locale === 'en' ? 'en' : 'zh'}-preview]`);
        await expect(preview).toContainText(target.key === 'profile.links' ? marker.replace(/^https:\/\//, '') : marker);
        await expectNoPageOverflow(page);
      }
    });
  }
}

async function beginDrag(page, handle) {
  await handle.evaluate((element) => element.scrollIntoView({ block: 'center' }));
  const rect = await handle.boundingBox();
  const point = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  expect(await handle.evaluate((element, point) => element.contains(document.elementFromPoint(point.x, point.y)), point)).toBe(true);
  await page.mouse.move(point.x, point.y); await page.mouse.down(); await page.mouse.move(point.x + 8, point.y);
  await expect(page.locator('.sortable-placeholder')).toBeVisible();
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  return point;
}
async function cleanDrag(page) {
  await expect(page.locator('.sortable-drag-float, .sortable-placeholder, .sortable-anchor-space')).toHaveCount(0);
  await expect(page.locator('.sortable-drag-source, .sortable-drag-list, .sortable-drag-panel')).toHaveCount(0);
}

for (const locale of ['ja', 'zh-CN', 'en']) {
  for (const mobile of locale === 'en' ? [false, true] : [false]) {
    test(`275 ${locale}: cancellations preserve raw draft and breaks; view/print cleanup ${mobile ? '[mobile] [mobile-webkit]' : ''}`, async ({ page }) => {
      const target = targets.find((item) => item.locale === locale && item.kind === 'date');
      const state = fixture();
      state.settings.pageBreaks[locale].A4.resume.sections = [locale === 'ja' ? 'qualifications' : 'skills'];
      await seed(page, state); await openLocale(page, locale);
      const container = await reveal(page, target);
      const rows = container.locator(':scope > .sortable-row');
      // Commit a real edit first to make the raw encrypted draft observable.
      await rows.first().locator(target.field).fill('Fictitious cancellation marker');
      const expected = structuredClone(state);
      items(expected, target)[0][labelField(target)] = 'Fictitious cancellation marker';
      await waitForPersistedState(page, listExpectation(expected, target));
      const before = await exportState(page);
      for (const reason of ['same-position', 'outside', 'Escape', 'edit', 'import', 'sample', 'locale', 'print']) {
        await test.step(reason, async () => {
          const raw = await stored(page);
          const point = await beginDrag(page, heading(rows.first()).locator('.sortable-handle'));
          if (reason === 'outside') { await page.mouse.move(1, 1); await page.mouse.up(); }
          if (reason === 'same-position') { await page.mouse.move(point.x, point.y); await page.mouse.up(); }
          if (reason === 'Escape') await page.keyboard.press('Escape');
          if (reason === 'edit') {
            // Existing field update paths cancel a drag even with an unchanged value.
            await rows.first().locator(target.field).evaluate((field) => field.dispatchEvent(new Event('input', { bubbles: true })));
          }
          if (reason === 'import') {
            await page.locator('#importDataInput').setInputFiles({ name: 'fictitious-cancel.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(before)) });
            await page.mouse.up();
            await page.locator('#cancelSampleAdoptButton').click();
            await expect(page.locator('#sampleAdoptDialog')).not.toBeVisible();
            await expect(page.locator('#importDataInput')).toHaveValue('');
          }
          if (reason === 'sample') {
            await page.locator(locale === 'ja' ? '#loadSampleButton' : locale === 'en' ? '[data-en-load-sample]' : '[data-zh-action=sample]').evaluate((button) => button.click());
            await cleanDrag(page); await page.mouse.up();
            await page.locator(locale === 'ja' ? '#restoreDraftButton' : locale === 'en' ? '[data-en-restore-sample]' : '[data-zh-action=restore]').click();
            await reveal(page, target);
          }
          if (reason === 'locale') {
            await page.locator('#localeSelect').selectOption(locale === 'en' ? 'ja' : 'en');
            await cleanDrag(page); await page.locator('#localeSelect').selectOption(locale); await reveal(page, target);
          }
          if (reason === 'print') await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
          await page.mouse.up(); await cleanDrag(page);
          expect(await rowValues(rows, target), reason).toEqual(items(before, target).map((item) => label(item, target)));
          expect((await readPersistedState(page)).settings.pageBreaks, reason).toEqual(before.settings.pageBreaks);
          // The edit path intentionally schedules saving; pure cancellation must not.
          if (reason === 'edit') await expect.poll(async () => (await stored(page)) !== raw).toBe(true);
          if (['same-position', 'outside', 'Escape', 'import', 'print'].includes(reason)) expect((await stored(page)) === raw, reason).toBe(true);
        });
      }
    });
  }
}

for (const [locale, type, paper] of [['ja', 'resume', 'A4'], ['ja', 'career', 'A4'], ['zh-CN', 'resume', 'A4'], ['en', 'resume', 'A4'], ['en', 'resume', 'LETTER']]) {
  for (const length of ['short', 'standard', 'long']) {
    test(`275 ${locale} ${type} ${paper} ${length}: reordered preview and every PDF page retain unique markers`, async ({ page }) => {
      const state = fixture();
      state.settings.pageSizeByLocale[locale] = paper;
      state.documents.ja.activeDocument = type;
      const count = { short: 2, standard: 12, long: 45 }[length];
      const endMarker = `FICTITIOUS-END-${locale}-${type}-${paper}-${length}`;
      const body = 'Fictitious PDF body line.\n'.repeat(count);
      if (locale === 'ja') {
        state.documents.ja.fields.motivation = body;
        state.documents.ja.fields.requests = endMarker;
        state.documents.ja.fields.selfPromotion = endMarker;
        state.documents.ja.careers.forEach((career) => { career.detailSections.forEach((detail) => { detail.content = body; }); });
      } else {
        state.documents[locale].resume.summary = body;
        state.documents[locale].resume.skills = 'Fictitious skills';
        state.documents[locale].resume.certifications[0].url = 'https://fictional.example/certificate-tail';
        for (const type of ['experience', 'projects', 'education']) items(state, targets.find((target) => target.key === `${locale}.${type}`)).forEach((item) => { item.details = body; });
      }
      if (length !== 'short') {
        if (locale === 'en') state.documents.en.resume.showOptionalPersonalDetails = true;
        state.profile.photo = await page.evaluate(() => {
          const canvas = document.createElement('canvas'); canvas.width = 90; canvas.height = 120;
          const paint = canvas.getContext('2d'); paint.fillStyle = '#dce7fa'; paint.fillRect(0, 0, 90, 120);
          paint.fillStyle = '#607ca8'; paint.beginPath(); paint.arc(45, 38, 20, 0, Math.PI * 2); paint.fill();
          paint.fillRect(20, 68, 50, 52); return canvas.toDataURL('image/png');
        });
        state.profile.fields.links = [`https://fictional.example/${'long-path-'.repeat(18)}end`];
      }
      const chosen = targets.filter((target) => target.locale === locale && target.key !== 'profile.links'
        && (locale !== 'ja' || Boolean(target.career) === (type === 'career')));
      for (const target of chosen) {
        items(state, target).forEach((item, index) => {
          item[labelField(target)] = `ORDER-${target.key.replace(/[^a-z]/gi, '-')}-${index}`;
          if (target.key === 'ja.careerDetails') item.content = body;
          if (length === 'long') item[labelField(target)] += ` ${'FictitiousOrganization'.repeat(5)}`;
        });
      }
      if (locale !== 'ja') state.documents[locale].resume.certifications[0].name += ` ${endMarker}`;
      // Make the second company non-empty with independent details, including a long body.
      state.documents.ja.careers[1].detailSections = [{ title: 'Independent fictional detail', content: body }];
      const expected = structuredClone(state);
      const detailCareerId = state.documents.ja.careers[0].id;
      for (const target of [...chosen].reverse()) items(expected, target).reverse();
      const markers = chosen.filter((target) => target.key !== 'ja.careerDetails').map((target) => items(expected, target).map((item) => label(item, target).split(' ')[0]));
      if (type === 'career') markers.push(expected.documents.ja.careers.find((career) => career.id === detailCareerId).detailSections.map((detail) => detail.title.split(' ')[0]));
      await seed(page, state); await openLocale(page, locale);
      for (const target of [...chosen].reverse()) {
        const container = await reveal(page, target);
        const rows = container.locator(':scope > .sortable-row');
        await action(rows.first(), 1);
        expect(await rowValues(rows, target)).toEqual([...items(state, target)].reverse().map((item) => label(item, target)));
      }
      const preview = page.locator(locale === 'ja' ? '#documentPreview' : `[data-${locale === 'en' ? 'en' : 'zh'}-preview]`);
      const photoRendered = length !== 'short' && !(locale === 'ja' && type === 'career');
      await expect(preview.locator('img')).toHaveCount(photoRendered ? 1 : 0);
      const screen = await preview.textContent();
      for (const pair of markers) {
        expect(screen.indexOf(pair[0])).toBeGreaterThanOrEqual(0);
        expect(screen.indexOf(pair[0])).toBeLessThan(screen.indexOf(pair[1]));
      }
      await page.emulateMedia({ media: 'print' });
      const buffer = await page.pdf({ preferCSSPageSize: true, printBackground: true });
      const task = getDocument({ data: new Uint8Array(buffer), disableFontFace: true, isEvalSupported: false, useSystemFonts: true });
      try {
        const pdf = await task.promise;
        const pages = [];
        for (let number = 1; number <= pdf.numPages; number += 1) {
          const pdfPage = await pdf.getPage(number);
          const viewport = pdfPage.getViewport({ scale: 1 });
          expect(viewport.width).toBeCloseTo(paper === 'A4' ? 595.28 : 612, 0);
          expect(viewport.height).toBeCloseTo(paper === 'A4' ? 841.89 : 792, 0);
          const text = (await pdfPage.getTextContent()).items.map((item) => item.str).join(' ');
          expect(text.trim()).not.toBe(''); pages.push(text);
        }
        const text = pages.join(' ').replace(/\s/g, '');
        for (const pair of markers.map((pair) => pair.map((marker) => marker.replace(/\s/g, '')))) {
          expect(text.split(pair[0])).toHaveLength(2);
          expect(text.split(pair[1])).toHaveLength(2);
          expect(text.indexOf(pair[0])).toBeLessThan(text.indexOf(pair[1]));
        }
        const bodyCount = count * (locale === 'ja' ? type === 'career' ? 3 : 1 : 7);
        expect(text.split('FictitiousPDFbodyline.')).toHaveLength(bodyCount + 1);
        expect(text.split(endMarker)).toHaveLength(2);
        expect(pages.at(-1).replace(/\s/g, '')).toContain(endMarker);
        expect(text).not.toMatch(/Move down|Move up|項目を移動|sortable-/);
      } finally { await task.destroy(); }
    });
  }
}

for (const locale of ['ja', 'zh-CN', 'en']) {
  for (const mobile of locale === 'en' ? [false, true] : [false]) {
    test(`275 ${locale}: product long-card drag, edge scroll and reduced motion ${mobile ? '[mobile] [mobile-webkit]' : ''}`, async ({ page, context }, testInfo) => {
      const state = fixture();
      const target = targets.find((item) => item.locale === locale && item.kind === 'range');
      const list = items(state, target);
      const template = list[0];
      list.splice(0, list.length, ...Array.from({ length: 18 }, (_, index) => ({ ...structuredClone(template),
        [labelField(target)]: `Fictitious long ${index}`, ...('id' in template ? { id: `record_long-275-${index}` } : {}),
        ...(locale === 'ja' ? { detailSections: [{ title: 'Fictitious long detail', content: 'Fictitious long card body.\n'.repeat(40) }] } : { details: 'Fictitious long card body.\n'.repeat(40) }) })));
      await seed(page, state); await openLocale(page, locale);
      const container = await reveal(page, target);
      const rows = container.locator(':scope > .sortable-row');
      const panel = page.locator('.editor-panel:visible');
      const session = mobile && testInfo.project.name === 'mobile-chromium' ? await context.newCDPSession(page) : null;
      const synthetic = mobile && testInfo.project.name === 'mobile-webkit';
      async function dispatch(type, point) {
        if (session) {
          await session.send('Input.dispatchTouchEvent', { type: { down: 'touchStart', move: 'touchMove', up: 'touchEnd' }[type], touchPoints: type === 'up' ? [] : [{ ...point, id: 0 }] });
        } else if (synthetic) {
          await page.evaluate(({ type, point }) => {
            window.fictitious275Pointer.dispatchEvent(new PointerEvent(`pointer${type}`, { bubbles: true, cancelable: true,
              pointerType: 'touch', isPrimary: true, pointerId: 275, button: 0, buttons: type === 'up' ? 0 : 1, clientX: point.x, clientY: point.y }));
          }, { type, point });
        } else if (type === 'down') { await page.mouse.move(point.x, point.y); await page.mouse.down(); }
        else if (type === 'move') await page.mouse.move(point.x, point.y);
        else await page.mouse.up();
      }
      for (const reduced of [false, true]) {
        await page.emulateMedia({ reducedMotion: reduced ? 'reduce' : 'no-preference' });
        const before = await rowValues(rows, target);
        const handle = heading(rows.first()).locator('.sortable-handle');
        await handle.evaluate((element) => element.scrollIntoView({ block: 'center' }));
        if (synthetic) await handle.evaluate((element) => {
          // Synthetic WebKit touch cannot establish native pointer capture.
          window.fictitious275Pointer = element;
          window.fictitious275Capture = element.setPointerCapture;
          element.setPointerCapture = () => {};
        });
        const rect = await handle.boundingBox(); const start = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
        await dispatch('down', start); await dispatch('move', { x: start.x + 12, y: start.y });
        await expect(page.locator('.sortable-placeholder')).toBeVisible();
        await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        if (reduced) expect(await page.locator('.sortable-drag-float').evaluate((element) => element.getAnimations().length)).toBe(0);
        const initialScroll = await panel.evaluate((element) => element.scrollTop);
        const bounds = await panel.boundingBox();
        const edge = { x: start.x, y: Math.min(bounds.y + bounds.height, mobile ? 844 : 1000) - 10 };
        await dispatch('move', edge);
        await expect.poll(() => panel.evaluate((element) => element.scrollTop)).toBeGreaterThan(initialScroll + 150);
        await dispatch('up', edge); await cleanDrag(page);
        if (synthetic) await page.evaluate(() => {
          window.fictitious275Pointer.setPointerCapture = window.fictitious275Capture;
          delete window.fictitious275Pointer; delete window.fictitious275Capture;
        });
        const after = await rowValues(rows, target);
        expect(after).not.toEqual(before);
        expect([...after].sort()).toEqual([...before].sort());
        await expectNoPageOverflow(page);
      }
      await session?.detach();
    });
  }
}


for (const target of targets.filter((item) => ['ja.education', 'zh-CN.experience', 'en.certifications'].includes(item.key))) {
  test(`275 ${target.key}: already sorted ties do not change storage or page breaks`, async ({ page }) => {
    const state = fixture(); state.settings.locale = target.locale;
    const list = items(state, target);
    list.forEach((item) => {
      if (target.kind === 'date') item.date = '2020-01';
      else { item.startDate = '2020-01'; item.endDate = ''; }
    });
    state.settings.pageBreaks[target.locale].A4[target.career ? 'career' : 'resume'].sections = [target.career ? 'self-promotion' : target.locale === 'ja' ? 'qualifications' : 'skills'];
    await seed(page, state); await openLocale(page, target.locale);
    const container = await reveal(page, target);
    await waitForPersistedState(page, listExpectation(state, target));
    const before = await exportState(page); const raw = await stored(page);
    for (let direction = 0; direction < 2; direction += 1) {
      await container.locator('xpath=preceding-sibling::*[1]').locator('.sortable-sort').click();
      expect(await rowValues(container.locator(':scope > .sortable-row'), target)).toEqual(items(before, target).map((item) => label(item, target)));
      expect((await readPersistedState(page)).settings.pageBreaks).toEqual(before.settings.pageBreaks);
      expect((await stored(page)) === raw).toBe(true);
    }
  });
}
