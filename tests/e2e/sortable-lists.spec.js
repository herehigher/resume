import { createDefaultState } from '../../site/assets/js/state/defaults.js';
import { LIST_ORDER_REGISTRY } from '../../site/assets/js/state/list-order.js';
import { expect, expectNoPageOverflow, test } from './fixtures.js';

const harnessKeys = ['en.experience', 'en.projects', 'en.education', 'ja.careers', 'profile.links'];
const words = {
  ja: { collapse: '折りたたむ', expand: '展開する', up: '上へ移動', down: '下へ移動', collapseAll: 'すべて折りたたむ', expandAll: 'すべて展開する' },
  'zh-CN': { collapse: '收起', expand: '展开', up: '上移', down: '下移', collapseAll: '全部收起', expandAll: '全部展开' },
  en: { collapse: 'Collapse', expand: 'Expand', up: 'Move up', down: 'Move down', collapseAll: 'Collapse all', expandAll: 'Expand all' }
};
function initialState() {
  const state = createDefaultState();
  for (const key of harnessKeys) {
    const path = LIST_ORDER_REGISTRY[key].path;
    const parent = path.slice(0, -1).reduce((value, part) => value[part], state);
    const field = path.at(-1);
    const template = parent[field][0];
    parent[field] = [0, 1, 2].map((index) => {
      if (key === 'profile.links') return `https://fictional.example/link-${index}`;
      const entry = structuredClone(template);
      if ('id' in entry) entry.id = `record_fictional-${key.replace(/[^a-zA-Z0-9]/g, '-')}-${index}`;
      for (const name of ['company', 'school', 'name', 'detail']) {
        if (name in entry) entry[name] = `Fictional ${key} ${index}`;
      }
      if (entry.detailSections) entry.detailSections = [0, 1, 2].map((detailIndex) => ({ title: `Fictional detail ${index}-${detailIndex}`, content: 'Fictitious body.\nSecond line.' }));
      return entry;
    });
  }
  for (const locale of ['ja', 'zh-CN', 'en']) for (const paper of ['A4', 'LETTER']) {
    for (const [type, breaks] of Object.entries(state.settings.pageBreaks[locale][paper])) {
      breaks.sections = [locale === 'ja' && type === 'resume' ? 'qualifications' : 'skills'];
    }
  }
  return state;
}

// A test-only adapter mounts the real shared component and real store. Product
// editor adapters belong to #273/#274; this harness is not a shipped route.
async function mount(page, locale = 'en') {
  await page.goto('/editor/');
  await page.evaluate(async ({ state, locale, keys }) => {
    const { createStore } = await import('/assets/js/state/store.js');
    const { LIST_ORDER_REGISTRY } = await import('/assets/js/state/list-order.js');
    const { createSortableLists } = await import('/assets/js/ui/sortable-lists.js');
    let scheduled = 0;
    let rejectSaves = false;
    const saved = [];
    const messages = [];
    const store = createStore({ initialState: state, persistence: {
      async save(value) {
        if (rejectSaves) throw new Error('Fictitious import persistence failure');
        saved.push(structuredClone(value));
      },
      async load() { return structuredClone(state); }
    } });
    document.body.replaceChildren();
    const root = document.createElement('main'); root.className = 'editor-panel';
    root.style.maxWidth = '640px'; root.style.margin = 'auto'; root.style.border = '0';
    document.body.append(root);
    const controller = createSortableLists({ store, locale, announce: (message) => { messages.push(message); } });
    const bindings = new Map();
    function items(target, value = store.getState()) {
      const descriptor = LIST_ORDER_REGISTRY[target.key];
      const list = descriptor.path.reduce((entry, part) => entry[part], value);
      return target.key === 'ja.careerDetails' ? list.find((career) => career.id === target.careerId)?.detailSections : list;
    }
    function id(target) { return target.careerId ? `${target.key}:${target.careerId}` : target.key; }
    function summary(item) { return typeof item === 'string' ? item : item.company || item.school || item.name || item.detail || item.title || ''; }
    function mountList(target, host = root) {
      const section = document.createElement('section'); section.dataset.harnessList = id(target);
      const heading = document.createElement('h2'); heading.textContent = target.key;
      const toolbar = document.createElement('div');
      const container = document.createElement('div'); container.className = 'repeating-list';
      const add = document.createElement('button'); add.type = 'button'; add.textContent = 'Fixture add'; add.dataset.fixtureAdd = '';
      section.append(heading, toolbar, container, add); host.append(section);
      const binding = { target, section, container, nested: [] };
      binding.api = controller.registerList({ target, container, toolbar, itemLabel: locale === 'ja' ? '項目' : locale === 'zh-CN' ? '条目' : 'Item',
        getSummary: summary, render: () => draw(binding), scheduleSave: () => { scheduled += 1; void store.save(); } });
      bindings.set(id(target), binding);
      add.addEventListener('click', () => {
        const index = items(target).length;
        store.update((value) => {
          const list = items(target, value);
          const entry = typeof list[0] === 'string' ? '' : structuredClone(list[0] || { title: '', content: '' });
          if (entry && typeof entry === 'object' && 'id' in entry) entry.id = `record_fictional-new-${index}`;
          list.push(entry);
        });
        draw(binding, { type: 'insert', index });
      });
      draw(binding);
      return binding;
    }
    function draw(binding, change) {
      binding.nested.forEach((nested) => { nested.api.destroy(); bindings.delete(id(nested.target)); });
      binding.nested = [];
      binding.container.replaceChildren();
      const descriptors = items(binding.target).map((item, index) => {
        const element = document.createElement('article'); element.dataset.harnessRow = String(index); element.style.minWidth = '0';
        const body = document.createElement('div'); body.dataset.harnessBody = ''; body.className = 'field-stack';
        const label = document.createElement('label'); label.className = 'input-field';
        const caption = document.createElement('span'); caption.textContent = 'Fictitious summary';
        const input = document.createElement('input'); input.value = summary(item); input.dataset.summaryInput = '';
        label.append(caption, input); body.append(label);
        input.addEventListener('input', () => {
          store.update((value) => {
            const list = items(binding.target, value);
            if (typeof list[index] === 'string') list[index] = input.value;
            else {
              const field = ['company', 'school', 'name', 'detail', 'title'].find((key) => key in list[index]);
              list[index][field] = input.value;
            }
          });
        });
        const content = document.createElement('textarea'); content.value = 'Fictitious body.\nSecond line.'; content.rows = 2;
        content.setAttribute('aria-label', 'Fictitious body'); content.style.width = '100%'; body.append(content);
        const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'Fixture delete'; remove.dataset.fixtureDelete = '';
        remove.addEventListener('click', () => {
          store.update((value) => { items(binding.target, value).splice(index, 1); });
          draw(binding, { type: 'remove', index });
        });
        body.append(remove); element.append(body); binding.container.append(element);
        return { element, body, actions: [remove] };
      });
      binding.api.sync(descriptors, { change });
      if (binding.target.key === 'ja.careers') {
        items(binding.target).forEach((career, index) => {
          binding.nested.push(mountList({ key: 'ja.careerDetails', careerId: career.id }, descriptors[index].body));
        });
      }
    }
    keys.forEach((key) => { mountList({ key }); });
    window.sortableHarness = { store, controller, bindings, items, draw, messages, saved,
      failSaves: (value) => { rejectSaves = value; },
      counts: () => ({ scheduled, saved: saved.length }), original: structuredClone(state),
      replacement(type) {
        store.replace(structuredClone(state), { type });
        for (const binding of [...bindings.values()]) if (!binding.target.careerId) draw(binding);
      }
    };
  }, { state: initialState(), locale, keys: harnessKeys });
}

function list(page, key) { return page.locator(`[data-harness-list="${key}"]`).first(); }
function rows(page, key) { return list(page, key).locator(':scope > .repeating-list > [data-harness-row]'); }
async function openActions(row) { await row.locator(':scope > .sortable-row-heading > .sortable-actions > summary').click(); }

for (const locale of ['ja', 'zh-CN', 'en']) {
  for (const device of ['desktop', 'mobile']) {
    test(`shared compact rows cover ID, anonymous, nested and primitive targets in ${locale} ${device === 'desktop' ? '' : '[mobile] [mobile-webkit]'}`, async ({ page }) => {
      await mount(page, locale);
      const labels = words[locale];
      const keys = ['en.experience', 'en.projects', 'ja.careers', 'ja.careerDetails:record_fictional-ja-careers-0', 'profile.links'];
      for (const key of keys) {
        const targetRows = rows(page, key);
        const source = targetRows.nth(1);
        const summary = await source.locator(':scope > .sortable-row-heading .sortable-summary').textContent();
        await source.locator(':scope > .sortable-row-heading .sortable-toggle').click();
        await expect(source.locator(':scope > [data-harness-body]')).toBeHidden();
        await openActions(source);
        await source.getByRole('button', { name: labels.up, exact: true }).first().click();
        const moved = targetRows.nth(0);
        await expect(moved.locator(':scope > .sortable-row-heading .sortable-summary')).toHaveText(summary);
        await expect(moved.locator(':scope > [data-harness-body]')).toBeHidden();
        const handle = moved.locator(':scope > .sortable-row-heading .sortable-handle');
        await expect(handle).toBeFocused();
        await expect(handle).toHaveAttribute('aria-label', /1\/3/);
        await handle.press('ArrowDown');
        await expect(targetRows.nth(1).locator(':scope > .sortable-row-heading .sortable-handle')).toBeFocused();
        await expect(targetRows.nth(1).locator(':scope > [data-harness-body]')).toBeHidden();
      }
      const result = await page.evaluate(() => ({ counts: sortableHarness.counts(), messages: sortableHarness.messages, json: sortableHarness.store.exportJson() }));
      expect(result.counts).toEqual({ scheduled: keys.length * 2, saved: keys.length * 2 });
      expect(result.messages).toHaveLength(keys.length * 2);
      expect(result.json).not.toMatch(/collapsed|sortable|fold/);
      await expectNoPageOverflow(page);
      const companies = list(page, 'ja.careers');
      await companies.locator(':scope > div > .sortable-list-tools').getByRole('button', { name: labels.collapseAll, exact: true }).click();
      await companies.scrollIntoViewIfNeeded();
      await openActions(rows(page, 'ja.careers').nth(1));
      await expectNoPageOverflow(page);
    });
  }
}

for (const device of ['desktop', 'mobile']) {
  const suffix = device === 'desktop' ? '' : '[mobile]';
  test(`summary input and composition preserve live fields and block movement ${suffix}`, async ({ page }) => {
    await mount(page);
    const targetRows = rows(page, 'en.projects');
    const field = targetRows.nth(0).locator('[data-summary-input]');
    await field.focus();
    const result = await field.evaluate((input) => {
      const original = input;
      input.setSelectionRange(3, 7);
      input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
      input.value = '<img src=x onerror=alert(1)> Fictional composition';
      input.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true }));
      const binding = sortableHarness.bindings.get('en.projects');
      const before = sortableHarness.store.getState();
      const move = binding.api.move(0, 1);
      const retained = document.activeElement === original && binding.container.querySelector('input') === original;
      input.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
      return { move, retained, unchanged: sortableHarness.store.getState() === before,
        summary: binding.container.firstElementChild.querySelector('.sortable-summary').textContent,
        images: binding.container.querySelectorAll('img').length, count: sortableHarness.counts() };
    });
    expect(result).toMatchObject({ move: false, retained: true, unchanged: true, images: 0, count: { scheduled: 0, saved: 0 } });
    expect(result.summary).toContain('<img src=x');
    await expect(field).toBeFocused();
    await field.press('ArrowDown');
    expect(await page.evaluate(() => sortableHarness.counts().scheduled)).toBe(0);
    await targetRows.nth(0).locator('.sortable-handle').focus();
    await page.keyboard.press('ArrowDown');
    await expect(targetRows.nth(1).locator('[data-summary-input]')).toHaveValue(result.summary);
    await targetRows.nth(1).locator('[data-summary-input]').fill('Fictional after move');
    const summaries = await page.evaluate(() => sortableHarness.items({ key: 'en.projects' }).map((item) => item.name));
    expect(summaries[1]).toBe('Fictional after move');
    expect(summaries[0]).not.toBe('Fictional after move');
    await expectNoPageOverflow(page);
  });

  test(`anonymous duplicate rows keep folds through insert delete and existing actions ${suffix}`, async ({ page }) => {
    await mount(page);
    const targetRows = rows(page, 'en.projects');
    await targetRows.nth(0).locator('[data-summary-input]').fill('Fictional duplicate');
    await targetRows.nth(1).locator('[data-summary-input]').fill('Fictional duplicate');
    await targetRows.nth(1).locator('.sortable-toggle').click();
    await page.evaluate(() => {
      const binding = sortableHarness.bindings.get('en.projects');
      sortableHarness.store.update((value) => {
        value.documents.en.resume.projects.splice(0, 0, { ...value.documents.en.resume.projects[0], name: '' });
      });
      sortableHarness.draw(binding, { type: 'insert', index: 0 });
    });
    await expect(targetRows.nth(2).locator('[data-harness-body]')).toBeHidden();
    await expect(targetRows.nth(1).locator('[data-harness-body]')).toBeVisible();
    await openActions(targetRows.nth(0));
    await targetRows.nth(0).getByRole('button', { name: 'Fixture delete' }).click();
    await expect(targetRows.nth(1).locator('[data-harness-body]')).toBeHidden();
    await openActions(targetRows.nth(1));
    await targetRows.nth(1).getByRole('button', { name: 'Move down', exact: true }).click();
    await expect(targetRows.nth(2).locator('[data-harness-body]')).toBeHidden();
    await openActions(targetRows.nth(2));
    await targetRows.nth(2).getByRole('button', { name: 'Fixture delete' }).click();
    await expect(targetRows).toHaveCount(2);
    await expect(targetRows.nth(1).locator('[data-harness-body]')).toBeVisible();
    expect(await page.evaluate(() => sortableHarness.items({ key: 'en.projects' }).map((item) => item.name))).toEqual(['Fictional duplicate', 'Fictional en.projects 2']);
  });

  test(`company and independent detail folds survive parent moves and bulk folding ${suffix}`, async ({ page }) => {
    await mount(page, 'ja');
    const companies = rows(page, 'ja.careers');
    const a = 'ja.careerDetails:record_fictional-ja-careers-0';
    const b = 'ja.careerDetails:record_fictional-ja-careers-1';
    await rows(page, a).nth(0).locator('.sortable-toggle').click();
    await rows(page, b).nth(1).locator('.sortable-toggle').click();
    await companies.nth(0).locator(':scope > .sortable-row-heading .sortable-toggle').click();
    await companies.nth(0).locator(':scope > .sortable-row-heading .sortable-handle').focus();
    await page.keyboard.press('ArrowDown');
    await expect(companies.nth(1).locator(':scope > [data-harness-body]')).toBeHidden();
    await companies.nth(1).locator(':scope > .sortable-row-heading .sortable-toggle').click();
    await expect(rows(page, a).nth(0).locator('[data-harness-body]')).toBeHidden();
    await expect(rows(page, a).nth(1).locator('[data-harness-body]')).toBeVisible();
    await expect(rows(page, b).nth(1).locator('[data-harness-body]')).toBeHidden();
    await list(page, 'ja.careers').locator(':scope > div > .sortable-list-tools').getByRole('button', { name: 'すべて折りたたむ' }).click();
    await list(page, 'ja.careers').locator(':scope > div > .sortable-list-tools').getByRole('button', { name: 'すべて展開する' }).click();
    await expect(rows(page, a).nth(0).locator('[data-harness-body]')).toBeHidden();
    await expect(rows(page, b).nth(1).locator('[data-harness-body]')).toBeHidden();
    const before = await page.evaluate(() => sortableHarness.items({ key: 'ja.careers' })[0].detailSections);
    await rows(page, a).nth(1).locator('.sortable-handle').focus();
    await page.keyboard.press('ArrowDown');
    expect(await page.evaluate(() => sortableHarness.items({ key: 'ja.careers' })[0].detailSections)).toEqual(before);
    await expectNoPageOverflow(page);
  });

  test(`no-op imports replacements and stale controls cannot save or reuse old folds ${suffix}`, async ({ page }) => {
    await mount(page);
    const checks = await page.evaluate(async () => {
      const h = sortableHarness;
      const binding = h.bindings.get('en.education');
      const before = h.store.getState();
      const noops = [[0, 0], [0, -1], [0, 3]].map(([from, to]) => binding.api.move(from, to));
      const noopIdentity = h.store.getState() === before;
      binding.api.setCollapsed(1, true);
      const oldHandle = binding.container.children[1].querySelector('.sortable-handle');
      h.store.prepareImport(h.store.exportJson());
      const pendingMove = binding.api.move(1, 0);
      h.store.cancelImport();
      const saveReference = h.store.getState();
      await h.store.save();
      const saveKeepsFold = binding.api.getCollapsed(1) && h.store.getState() === saveReference;
      const resets = [];
      for (const type of ['import', 'reload', 'sample', 'restore', 'reset', 'replace']) {
        binding.api.setCollapsed(1, true);
        h.replacement(type);
        resets.push(!binding.api.getCollapsed(1));
      }
      oldHandle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
      return { noops, noopIdentity, pendingMove, saveKeepsFold, resets, counts: h.counts() };
    });
    expect(checks).toEqual({ noops: [false, false, false], noopIdentity: true, pendingMove: false, saveKeepsFold: true, resets: [true, true, true, true, true, true], counts: { scheduled: 0, saved: 1 } });
    // Empty tools disappear; a single row can still fold and cannot move.
    await page.evaluate(() => {
      const h = sortableHarness;
      h.store.update((value) => { value.documents.en.resume.education = []; });
      h.draw(h.bindings.get('en.education'));
      h.store.update((value) => { value.profile.fields.links = ['']; });
      h.draw(h.bindings.get('profile.links'));
    });
    await expect(list(page, 'en.education').locator('.sortable-list-tools')).toBeHidden();
    const single = rows(page, 'profile.links').nth(0);
    await expect(single.locator('.sortable-summary')).toHaveText('Item 1');
    await expect(single.locator('.sortable-handle')).toBeDisabled();
    await single.locator('.sortable-toggle').click();
    await expect(single.locator('[data-harness-body]')).toBeHidden();
    await openActions(single);
    await expect(single.getByRole('button', { name: 'Move up', exact: true })).toBeDisabled();
    await expect(single.getByRole('button', { name: 'Move down', exact: true })).toBeDisabled();
    await expectNoPageOverflow(page);
  });
}

test('controls respect reduced motion and print, destroy restores existing action nodes and unregisters listeners', async ({ page }) => {
  await mount(page);
  const targetRows = rows(page, 'en.education');
  await targetRows.nth(0).locator('.sortable-toggle').click();
  await openActions(targetRows.nth(0));
  await targetRows.nth(0).locator('.sortable-actions').press('Escape');
  await expect(targetRows.nth(0).locator('.sortable-actions')).not.toHaveAttribute('open');
  await expect(targetRows.nth(0).locator('.sortable-actions > summary')).toBeFocused();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await targetRows.nth(0).locator('.sortable-handle').focus(); await page.keyboard.press('ArrowDown');
  await expect(targetRows.nth(1).locator('.sortable-handle')).toBeFocused();
  await page.emulateMedia({ media: 'print' });
  await expect(targetRows.nth(1).locator('.sortable-row-heading')).toBeHidden();
  await expect(list(page, 'en.education').locator('.sortable-list-tools')).toBeHidden();
  await page.emulateMedia({ media: 'screen' });
  const result = await page.evaluate(() => {
    const h = sortableHarness;
    const binding = h.bindings.get('en.education');
    const row = binding.container.children[1];
    const action = row.querySelector('[data-fixture-delete]');
    const oldHandle = row.querySelector('.sortable-handle');
    const before = h.store.getState();
    h.controller.destroy();
    oldHandle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
    h.controller.destroy();
    return { noMove: before === h.store.getState(), restored: action === row.querySelector('[data-harness-body] [data-fixture-delete]'),
      visible: !row.querySelector('[data-harness-body]').hidden, headers: document.querySelectorAll('.sortable-row-heading').length,
      tools: document.querySelectorAll('.sortable-list-tools').length, ids: row.querySelector('[data-harness-body]').hasAttribute('id') };
  });
  expect(result).toEqual({ noMove: true, restored: true, visible: true, headers: 0, tools: 0, ids: false });
});

test('reorder notifications preserve independent lists and subscriber order cannot disable replacement controls', async ({ page }) => {
  await mount(page);
  const result = await page.evaluate(() => {
    const h = sortableHarness;
    const links = h.bindings.get('profile.links');
    const projects = h.bindings.get('en.projects');
    links.api.setCollapsed(1, true); projects.api.setCollapsed(0, true);
    h.store.reorderList({ key: 'profile.links' }, { type: 'move', from: 1, to: 2 });
    const unrelated = projects.api.move(0, 1);
    h.draw(links);
    return { unrelated, linkFold: links.api.getCollapsed(2), originalLinkExpanded: !links.api.getCollapsed(1),
      projectFold: projects.api.getCollapsed(1) };
  });
  expect(result).toEqual({ unrelated: true, linkFold: true, originalLinkExpanded: true, projectFold: true });

  const order = await page.evaluate(async () => {
    const { createStore } = await import('/assets/js/state/store.js');
    const { createSortableLists } = await import('/assets/js/ui/sortable-lists.js');
    const state = structuredClone(sortableHarness.original);
    const store = createStore({ initialState: state, persistence: { async save() {} } });
    const container = document.createElement('div'); const toolbar = document.createElement('div');
    document.body.append(toolbar, container);
    let binding;
    function draw() {
      container.replaceChildren();
      binding.sync(store.getState().profile.fields.links.map(() => {
        const element = document.createElement('div'); const body = document.createElement('div');
        element.append(body); container.append(element); return { element, body };
      }));
    }
    // Deliberately subscribe the editor before the shared controller.
    const unsubscribe = store.subscribe((_state, event) => { if (event.type === 'replace') draw(); });
    const controller = createSortableLists({ store, locale: 'en', announce() {} });
    binding = controller.registerList({ target: { key: 'profile.links' }, container, toolbar, itemLabel: 'Link',
      getSummary: (value) => value, render: draw, scheduleSave() {} });
    draw(); binding.setCollapsed(1, true);
    store.replace(structuredClone(state));
    binding.setCollapsed(0, true);
    const canFold = binding.getCollapsed(0);
    const resetFold = !binding.getCollapsed(1);
    const canMove = binding.move(0, 1);
    controller.destroy(); unsubscribe(); container.remove(); toolbar.remove();
    return { canFold, resetFold, canMove };
  });
  expect(order).toEqual({ canFold: true, resetFold: true, canMove: true });
});


test('duplicate primitive links and date permutations move folds, and real reload/import reset them', async ({ page }) => {
  await mount(page);
  const result = await page.evaluate(async () => {
    const h = sortableHarness;
    const links = h.bindings.get('profile.links');
    h.store.update((value) => { value.profile.fields.links = ['https://fictional.example/same', 'https://fictional.example/same']; });
    h.draw(links); links.api.setCollapsed(0, true);
    const duplicateMoved = links.api.move(0, 1);
    const duplicateFold = links.api.getCollapsed(1) && !links.api.getCollapsed(0);
    const projects = h.bindings.get('en.projects');
    projects.api.setCollapsed(0, true);
    h.store.update((value) => {
      value.documents.en.resume.projects.forEach((item, index) => {
        item.startDate = `${2024 - index}-01`; item.endDate = `${2024 - index}-12`;
      });
    });
    h.store.reorderList({ key: 'en.projects' }, { type: 'sort', direction: 'oldest' });
    h.draw(projects);
    const sortFold = projects.api.getCollapsed(2) && !projects.api.getCollapsed(0);
    const imported = h.store.prepareImport(h.store.exportJson());
    await h.store.importPrepared(imported);
    h.draw(links); h.draw(projects);
    const importReset = !links.api.getCollapsed(1) && !projects.api.getCollapsed(2);
    links.api.setCollapsed(0, true);
    await h.store.reload(); h.draw(links);
    const reloadReset = !links.api.getCollapsed(0);
    return { duplicateMoved, duplicateFold, sortFold, importReset, reloadReset };
  });
  expect(result).toEqual({ duplicateMoved: true, duplicateFold: true, sortFold: true, importReset: true, reloadReset: true });
});


for (const device of ['desktop', 'mobile']) {
  test(`failed import restores movement controls and retains the draft and folds ${device === 'mobile' ? '[mobile]' : ''}`, async ({ page }) => {
    await mount(page);
    const result = await page.evaluate(async () => {
      const h = sortableHarness;
      const binding = h.bindings.get('profile.links');
      binding.api.setCollapsed(1, true);
      const before = h.store.getState();
      h.failSaves(true);
      const prepared = h.store.prepareImport(h.store.exportJson());
      const disabledDuringImport = binding.container.children[1].querySelector('.sortable-handle').disabled;
      let rejected = false;
      try { await h.store.importPrepared(prepared); }
      catch { rejected = true; }
      h.failSaves(false);
      return { disabledDuringImport, rejected, pending: h.store.isImportPending(),
        handleEnabled: !binding.container.children[1].querySelector('.sortable-handle').disabled,
        upEnabled: !binding.container.children[1].querySelector('.sortable-action').disabled,
        sameDraft: h.store.getState() === before, sameFold: binding.api.getCollapsed(1), counts: h.counts() };
    });
    expect(result).toEqual({ disabledDuringImport: true, rejected: true, pending: false,
      handleEnabled: true, upEnabled: true, sameDraft: true, sameFold: true, counts: { scheduled: 0, saved: 0 } });
    const targetRows = rows(page, 'profile.links');
    await targetRows.nth(1).locator('.sortable-handle').focus();
    await page.keyboard.press('ArrowUp');
    await expect(targetRows.nth(0).locator('.sortable-handle')).toBeFocused();
    await expect(targetRows.nth(0).locator('[data-harness-body]')).toBeHidden();
    expect(await page.evaluate(() => sortableHarness.counts())).toEqual({ scheduled: 1, saved: 1 });
  });
}

async function dragFixture(page, { count = 6, long = false, nested = false } = {}) {
  await mount(page, nested ? 'ja' : 'en');
  await page.evaluate(({ count, long, nested }) => {
    const h = sortableHarness;
    const binding = h.bindings.get(nested ? 'ja.careers' : 'en.projects');
    if (!nested) {
      h.store.update((state) => {
        const template = state.documents.en.resume.projects[0];
        state.documents.en.resume.projects = Array.from({ length: count }, (_entry, index) => ({ ...template,
          name: index < 2 ? 'Fictional duplicate' : `Fictional project ${index}`, description: `Fictitious body ${index}` }));
      });
      h.draw(binding);
    }
    const root = binding.section.parentElement;
    root.replaceChildren(binding.section);
    root.style.height = `${Math.min(650, innerHeight - 20)}px`;
    root.style.padding = '10px'; root.style.margin = '0 auto'; root.style.overflowAnchor = 'none';
    if (long) [...binding.container.children].forEach((row, index) => {
      row.querySelector('[data-harness-body]').style.height = `${index % 2 ? 800 : 1200}px`;
    });
    window.dragBefore = h.store.getState();
    window.dragForm = binding.container.children[0].querySelector('textarea');
    window.dragBinding = binding;
  }, { count, long, nested });
}
function handle(row) { return row.locator(':scope > .sortable-row-heading > .sortable-handle'); }
async function point(locator) {
  const rect = await locator.boundingBox();
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}
async function beginMouse(page, locator) {
  await locator.scrollIntoViewIfNeeded();
  const start = await point(locator);
  await page.mouse.move(start.x, start.y); await page.mouse.down();
  await page.mouse.move(start.x + 8, start.y);
  await expect(page.locator('.sortable-placeholder')).toBeVisible();
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  return start;
}
async function cleanDrag(page) {
  await expect(page.locator('.sortable-drag-float, .sortable-placeholder, .sortable-anchor-space')).toHaveCount(0);
  await expect(page.locator('.sortable-drag-heading, .sortable-drag-source, .sortable-drag-list, .sortable-drag-panel')).toHaveCount(0);
  expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
}

for (const mobile of [false, true]) {
  const tags = mobile ? '[mobile] [mobile-webkit]' : '';
  test(`pointer drag preserves forms and commits duplicate no-ID rows immediately ${tags}`, async ({ page }) => {
    await dragFixture(page, { long: true });
    const targetRows = rows(page, 'en.projects');
    const start = await point(handle(targetRows.nth(0)));
    await page.mouse.move(start.x, start.y); await page.mouse.down();
    await page.mouse.move(start.x + 3, start.y);
    await expect(targetRows.nth(0).locator('[data-harness-body]')).toBeVisible();
    await page.mouse.up();
    expect(await page.evaluate(() => sortableHarness.counts().scheduled)).toBe(0);
    await beginMouse(page, handle(targetRows.nth(0)));
    expect(await page.evaluate(() => dragForm === dragBinding.container.children[0].querySelector('textarea'))).toBe(true);
    await expect(targetRows.nth(0).locator('[data-harness-body]')).toBeHidden();
    // Activation alone must leave the original slot, including after several frames.
    await page.waitForTimeout(80);
    await page.mouse.up();
    expect(await page.evaluate(() => sortableHarness.store.getState() === dragBefore)).toBe(true);
    expect(await page.evaluate(() => sortableHarness.counts().scheduled)).toBe(0);
    await cleanDrag(page);
    await beginMouse(page, handle(targetRows.nth(0)));
    for (const index of [3, 1, 4, 2, 5]) {
      const destination = await point(targetRows.nth(index));
      await page.mouse.move(destination.x, destination.y + 2);
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const rowBox = await targetRows.nth(index).boundingBox();
      const placeholder = await page.locator('.sortable-placeholder').boundingBox();
      expect(Math.abs(placeholder.y - rowBox.y)).toBeLessThan(1);
    }
    const floating = await page.locator('.sortable-drag-float').boundingBox();
    expect(floating.x).toBeGreaterThanOrEqual(0);
    expect(floating.x + floating.width).toBeLessThanOrEqual(page.viewportSize().width);
    const bottom = await point(targetRows.nth(5));
    await page.mouse.move(bottom.x, bottom.y + 2); await page.waitForTimeout(50);
    await page.mouse.up();
    expect(await page.evaluate(() => sortableHarness.counts().scheduled)).toBe(1);
    expect(await page.evaluate(() => sortableHarness.items({ key: 'en.projects' }).map((item) => item.description))).toEqual([
      'Fictitious body 1', 'Fictitious body 2', 'Fictitious body 3', 'Fictitious body 4', 'Fictitious body 5', 'Fictitious body 0'
    ]);
    await expect(handle(targetRows.nth(5))).toBeFocused();
    await cleanDrag(page);
    await beginMouse(page, handle(targetRows.nth(5)));
    const top = await point(targetRows.nth(0));
    await page.mouse.move(top.x, top.y - 1); await page.waitForTimeout(50); await page.mouse.up();
    expect(await page.evaluate(() => sortableHarness.items({ key: 'en.projects' })[0].description)).toBe('Fictitious body 0');
    expect(await page.evaluate(() => sortableHarness.counts().scheduled)).toBe(2);
    await cleanDrag(page); await expectNoPageOverflow(page);
  });

  test(`long-card viewport anchor and cross-screen panel autoscroll ${tags}`, async ({ page }) => {
    await dragFixture(page, { count: 28, long: true });
    const targetRows = rows(page, 'en.projects');
    await handle(targetRows.nth(14)).scrollIntoViewIfNeeded();
    const before = await handle(targetRows.nth(14)).boundingBox();
    await beginMouse(page, handle(targetRows.nth(14)));
    const after = await handle(targetRows.nth(14)).boundingBox();
    expect(Math.abs(after.y - before.y)).toBeLessThan(2);
    const panel = await page.locator('.editor-panel').boundingBox();
    await page.mouse.move(panel.x + panel.width / 2, panel.y + panel.height - 8);
    await expect.poll(() => page.evaluate(() => dragBinding.container.lastElementChild.getBoundingClientRect().bottom
      <= document.querySelector('.editor-panel').getBoundingClientRect().bottom)).toBe(true);
    const end = await point(targetRows.nth(27));
    await page.mouse.move(end.x, end.y + 2); await page.waitForTimeout(50); await page.mouse.up();
    expect(await page.evaluate(() => sortableHarness.items({ key: 'en.projects' }).at(-1).description)).toBe('Fictitious body 14');
    await cleanDrag(page);
  });

  test(`cancel, no-op, updates and view changes never save or leave drag UI ${tags}`, async ({ page }) => {
    for (const reason of ['same-position', 'outside', 'Escape', 'pointercancel', 'capture', 'blur', 'update', 'import', 'hide', 'mobileView', 'sync', 'print', 'destroy']) {
      await dragFixture(page);
      await page.clock.install();
      const targetRows = rows(page, 'en.projects');
      await beginMouse(page, handle(targetRows.nth(0)));
      const destination = await point(targetRows.nth(3));
      await page.mouse.move(destination.x, destination.y); await page.waitForTimeout(25);
      if (reason === 'same-position') { const start = await point(targetRows.first()); await page.mouse.move(start.x, start.y); await page.mouse.up(); }
      else if (reason === 'outside') { await page.mouse.move(1, 1); await page.mouse.up(); }
      else if (reason === 'Escape') await page.keyboard.press('Escape');
      else await page.evaluate((reason) => {
        const h = sortableHarness;
        const source = dragBinding.container.children[0].querySelector('.sortable-handle');
        if (reason === 'pointercancel') source.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId: 1 }));
        if (reason === 'capture') source.releasePointerCapture(1);
        if (reason === 'blur') window.dispatchEvent(new Event('blur'));
        if (reason === 'update') h.store.update((state) => { state.profile.fields.name = 'Fictitious updated name'; });
        if (reason === 'import') h.store.prepareImport(h.store.exportJson());
        if (reason === 'hide') dragBinding.section.hidden = true;
        if (reason === 'mobileView') {
          dragBinding.section.dataset.mobileMode = 'preview'; dragBinding.section.hidden = true;
        }
        if (reason === 'sync') h.draw(dragBinding);
        if (reason === 'print') window.dispatchEvent(new Event('beforeprint'));
        if (reason === 'destroy') h.controller.destroy();
      }, reason);
      await page.mouse.up(); await cleanDrag(page);
      await page.clock.runFor(2_000);
      expect(await page.evaluate(() => sortableHarness.counts()), reason).toEqual({ scheduled: 0, saved: 0 });
      await cleanDrag(page);
      expect(await page.evaluate(() => sortableHarness.store.getState().settings.pageBreaks), reason).toEqual(await page.evaluate(() => dragBefore.settings.pageBreaks));
      expect(await page.evaluate(() => sortableHarness.items({ key: 'en.projects' }).map((item) => item.description)), reason).toEqual([
        'Fictitious body 0', 'Fictitious body 1', 'Fictitious body 2', 'Fictitious body 3', 'Fictitious body 4', 'Fictitious body 5'
      ]);
    }
  });

  test(`nested pointer lists remain isolated and reduced motion retains static feedback ${tags}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await dragFixture(page, { nested: true });
    const key = await page.evaluate(() => [...sortableHarness.bindings.keys()].find((key) => key.startsWith('ja.careerDetails')));
    const targetRows = rows(page, key);
    const before = await page.evaluate(() => sortableHarness.items({ key: 'ja.careers' }).map((item) => item.id));
    await beginMouse(page, handle(targetRows.nth(0)));
    await expect(rows(page, 'ja.careers').nth(0).locator(':scope > [data-harness-body]')).toBeVisible();
    const animations = await page.evaluate(() => ({ animation: getComputedStyle(document.querySelector('.sortable-drag-float')).animationName,
      transition: getComputedStyle(document.querySelector('.sortable-drag-heading')).transitionDuration }));
    expect(animations).toEqual({ animation: 'none', transition: '0s' });
    const bottom = await point(targetRows.nth(2));
    await page.mouse.move(bottom.x, bottom.y + 1); await page.waitForTimeout(40);
    // Edge autoscroll can move the compact list away from the old coordinate.
    const destination = await point(targetRows.nth(2));
    await page.mouse.move(destination.x, destination.y + 1); await page.mouse.up();
    await cleanDrag(page);
    expect(await page.evaluate(() => sortableHarness.items({ key: 'ja.careers' }).map((item) => item.id))).toEqual(before);
    await expect(targetRows.nth(2).locator(':scope > .sortable-row-heading .sortable-summary')).toHaveText('Fictional detail 0-0');
    expect(await page.evaluate(() => sortableHarness.counts().scheduled)).toBe(1);
    await handle(targetRows.nth(2)).focus(); await page.keyboard.press('ArrowUp');
    await expect(handle(targetRows.nth(1))).toBeFocused();
    await expect(targetRows.nth(1)).toHaveClass(/sortable-row-moved/);
  });
}

test('native Chromium touch dragging handles scrolling while body retains touch scrolling [mobile]', async ({ page, context }) => {
  await dragFixture(page, { count: 25 });
  await page.evaluate(() => dragBinding.api.setAllCollapsed(true));
  const targetRows = rows(page, 'en.projects');
  const start = await point(handle(targetRows.nth(0)));
  const session = await context.newCDPSession(page);
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...start, id: 0 }] });
  await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: start.x + 12, y: start.y, id: 0 }] });
  await expect(page.locator('.sortable-placeholder')).toBeVisible();
  const panel = await page.locator('.editor-panel').boundingBox();
  await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: start.x, y: panel.y + panel.height - 8, id: 0 }] });
  await expect.poll(() => page.evaluate(() => document.querySelector('.editor-panel').scrollTop)).toBeGreaterThan(250);
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  expect(await page.evaluate(() => sortableHarness.counts().scheduled)).toBe(1);
  await cleanDrag(page);
  await page.evaluate(() => { dragBinding.api.setAllCollapsed(false); document.querySelector('.editor-panel').scrollTop = 0; });
  const body = await point(targetRows.nth(0).locator('textarea'));
  const touchAction = await targetRows.nth(0).locator('textarea').evaluate((element) => getComputedStyle(element).touchAction);
  expect(touchAction).toBe('auto');
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...body, id: 1 }] });
  await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: body.x, y: body.y - 80, id: 1 }] });
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(page.locator('.sortable-placeholder')).toHaveCount(0);
  expect(await page.evaluate(() => sortableHarness.counts().scheduled)).toBe(1);
  await session.detach();
});

test('pen and touch pointer paths share the threshold and transaction [mobile] [mobile-webkit]', async ({ page }) => {
  for (const pointerType of ['pen', 'touch']) {
    await dragFixture(page);
    await page.evaluate(() => dragBinding.api.setAllCollapsed(true));
    const result = await page.evaluate(async (pointerType) => {
      const source = dragBinding.container.firstElementChild.querySelector('.sortable-handle');
      const from = source.getBoundingClientRect();
      const dispatch = (type, x, y) => source.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true,
        pointerType, isPrimary: true, pointerId: 29, button: 0, buttons: type === 'pointerup' ? 0 : 1, clientX: x, clientY: y }));
      // Synthetic PointerEvents cannot create browser capture. The native mouse
      // cases above separately exercise real capture/loss in mobile WebKit.
      source.setPointerCapture = () => {}; source.hasPointerCapture = () => false;
      dispatch('pointerdown', from.x + 20, from.y + 20);
      dispatch('pointermove', from.x + 28, from.y + 20);
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const to = dragBinding.container.lastElementChild.getBoundingClientRect();
      dispatch('pointermove', to.x + 30, to.y + to.height / 2 + 2);
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      dispatch('pointerup', to.x + 30, to.y + to.height / 2 + 2);
      return sortableHarness.counts().scheduled;
    }, pointerType);
    expect(result).toBe(1); await cleanDrag(page);
  }
});


test('ID, anonymous, nested-parent and primitive lists use the same pointer transaction [mobile] [mobile-webkit]', async ({ page }) => {
  await mount(page);
  await page.evaluate(() => {
    const root = document.querySelector('.editor-panel');
    root.style.height = `${Math.min(650, innerHeight - 20)}px`; root.style.padding = '10px';
  });
  const pointerKeys = ['en.experience', 'en.projects', 'ja.careers', 'profile.links'];
  for (const key of pointerKeys) {
    const before = await page.evaluate((key) => {
      const h = sortableHarness; const binding = h.bindings.get(key);
      document.querySelector('.editor-panel').replaceChildren(binding.section);
      binding.api.setAllCollapsed(true);
      return structuredClone(h.items({ key }));
    }, key);
    const targetRows = rows(page, key);
    await beginMouse(page, handle(targetRows.nth(0)));
    const end = await point(targetRows.nth(2));
    await page.mouse.move(end.x, end.y + 2);
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.mouse.up();
    expect(await page.evaluate((key) => sortableHarness.items({ key }), key)).toEqual([before[1], before[2], before[0]]);
    await cleanDrag(page);
  }
  expect(await page.evaluate(() => sortableHarness.counts().scheduled)).toBe(pointerKeys.length);
});
