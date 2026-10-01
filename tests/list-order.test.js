import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';

import { STORAGE_KEY } from '../site/assets/js/config.js';
import { createDefaultState, cloneData } from '../site/assets/js/state/defaults.js';
import { LIST_ORDER_REGISTRY, orderListByDate } from '../site/assets/js/state/list-order.js';
import { createStore } from '../site/assets/js/state/store.js';
import { createDraftStorage, DraftStorageError } from '../site/assets/js/state/storage.js';
import { SECTION_REGISTRY } from '../site/assets/js/page-breaks.js';
import { renderEnglishResume } from '../site/assets/js/templates/en.js';
import { renderChineseResume } from '../site/assets/js/templates/zh-CN.js';

function fillBreaks(state) {
  for (const [locale, documents] of Object.entries(SECTION_REGISTRY)) {
    for (const paper of ['A4', 'LETTER']) {
      for (const [type, sections] of Object.entries(documents)) {
        state.settings.pageBreaks[locale][paper][type] = {
          sections: [sections[1].key], records: ['record_fictional-break']
        };
      }
    }
  }
}

function listFixture(key) {
  const state = createDefaultState();
  const descriptor = LIST_ORDER_REGISTRY[key];
  let parent = descriptor.path.slice(0, -1).reduce((value, field) => value[field], state);
  let field = descriptor.path.at(-1);
  const target = { key };
  if (key === 'ja.careerDetails') {
    state.documents.ja.careers.push(cloneData(state.documents.ja.careers[0]));
    state.documents.ja.careers[1].id = 'record_other-company';
    parent = state.documents.ja.careers[0];
    field = 'detailSections';
    target.careerId = parent.id;
  }
  const template = key === 'profile.links' ? 'https://fictional.example/' : parent[field][0];
  parent[field] = Array.from({ length: 3 }, (_, index) => {
    if (typeof template === 'string') return `${template}${index}`;
    const entry = { ...cloneData(template) };
    if ('id' in entry) entry.id = `record_fictional-${index}`;
    const content = ['detail', 'company', 'name', 'school', 'title'].find((name) => name in entry);
    entry[content] = `Fictitious entry ${index}`;
    if (descriptor.dateKind === 'date') entry.date = `202${index}-01`;
    if (descriptor.dateKind === 'range') { entry.startDate = '2019-01'; entry.endDate = `202${index}-01`; }
    return entry;
  });
  fillBreaks(state);
  const getItems = (current) => key === 'ja.careerDetails'
    ? current.documents.ja.careers.find((career) => career.id === target.careerId).detailSections
    : descriptor.path.reduce((value, name) => value[name], current);
  return { state, target, descriptor, getItems };
}

function instrumentedStore(state) {
  const saved = [];
  const events = [];
  const store = createStore({ initialState: state, persistence: { async save(next) { saved.push(cloneData(next)); } } });
  store.subscribe((next, event) => events.push({ state: cloneData(next), type: event.type }));
  return { store, saved, events };
}

test('registry explicitly covers fourteen sibling lists, twelve with dates', () => {
  assert.equal(Object.keys(LIST_ORDER_REGISTRY).length, 14);
  assert.equal(Object.values(LIST_ORDER_REGISTRY).filter((entry) => entry.dateKind).length, 12);
});

for (const key of Object.keys(LIST_ORDER_REGISTRY)) {
  test(`${key}: move preserves content and IDs, clears only its document in one transaction`, async () => {
    const { state, target, descriptor, getItems } = listFixture(key);
    const { store, saved, events } = instrumentedStore(state);
    const original = cloneData(store.getState());
    const items = getItems(original);
    assert.equal(store.reorderList(target, { type: 'move', from: 0, to: 2 }), true);
    await store.save();
    const expected = cloneData(original);
    getItems(expected).splice(0, 3, items[1], items[2], items[0]);
    for (const [locale, documents] of Object.entries(SECTION_REGISTRY)) {
      for (const paper of ['A4', 'LETTER']) {
        for (const type of Object.keys(documents)) {
          if (!descriptor.locale || (descriptor.locale === locale && descriptor.documentType === type)) {
            expected.settings.pageBreaks[locale][paper][type] = { sections: [], records: [] };
          }
        }
      }
    }
    assert.deepEqual(store.getState(), expected);
    assert.deepEqual(saved, [expected]);
    assert.deepEqual(events, [{ state: expected, type: 'reorder' }, { state: expected, type: 'save' }]);
  });

  test(`${key}: bounds, same position, empty/single lists never update or save`, async () => {
    const { state, target, getItems } = listFixture(key);
    const { store, saved, events } = instrumentedStore(state);
    for (const length of [3, 1, 0]) {
      const next = cloneData(state);
      getItems(next).splice(length);
      store.replace(next);
      events.length = 0;
      const before = store.getState();
      for (const [from, to] of [[0, 0], [-1, 0], [0, -1], [0, length], [length, 0], [0.5, 1], [0, NaN]]) {
        const changed = store.reorderList(target, { type: 'move', from, to });
        if (changed) await store.save();
        assert.equal(changed, false);
        assert.equal(store.getState(), before);
      }
      assert.deepEqual(events, []);
      assert.deepEqual(saved, []);
    }
  });

  if (!LIST_ORDER_REGISTRY[key].dateKind) continue;
  test(`${key}: date sorting is one-shot and repeated/undated sorts are no-ops`, async () => {
    const { state, target, descriptor, getItems } = listFixture(key);
    const { store, saved, events } = instrumentedStore(state);
    assert.equal(store.reorderList(target, { type: 'sort', direction: 'newest' }), true);
    assert.deepEqual(getItems(store.getState()), [...getItems(state)].reverse());
    const sorted = store.getState();
    const changed = store.reorderList(target, { type: 'sort', direction: 'newest' });
    if (changed) await store.save();
    assert.equal(changed, false);
    assert.equal(store.getState(), sorted);
    assert.equal(events.length, 1);
    assert.equal(saved.length, 0);
    assert.equal(store.reorderList(target, { type: 'sort', direction: 'oldest' }), true);
    assert.deepEqual(getItems(store.getState()), getItems(state));
    store.update((next) => {
      const items = getItems(next);
      if (descriptor.dateKind === 'date') items[0].date = '2099-12';
      else items[0].endDate = '2099-12';
    });
    assert.deepEqual(getItems(store.getState()).map((entry) => entry.id || entry.detail || entry.name || entry.company || entry.school),
      getItems(state).map((entry) => entry.id || entry.detail || entry.name || entry.company || entry.school));
    for (const length of [3, 1, 0]) {
      const undated = cloneData(state);
      getItems(undated).splice(length);
      getItems(undated).forEach((entry) => {
        if (descriptor.dateKind === 'date') entry.date = '';
        else { entry.startDate = ''; entry.endDate = ''; }
      });
      store.replace(undated);
      events.length = 0;
      const before = store.getState();
      for (const direction of ['newest', 'oldest']) {
        const changed = store.reorderList(target, { type: 'sort', direction });
        if (changed) await store.save();
        assert.equal(changed, false);
        assert.equal(store.getState(), before);
      }
      assert.equal(events.length, 0);
      assert.equal(saved.length, 0);
    }
  });
}

test('period dates rank Present, end-only, matching ends and invalid months stably in both directions', () => {
  const periods = [
    ['unknown', '', ''], ['invalid-end', '2020-01', 'invalid'],
    ['same-end-early', '2019-01', '2024-12'], ['present-early', '2020-01', ''],
    ['end-only', '', '2024-12'], ['present-late', '2023-01', ' '],
    ['same-end-late', '2021-01', '2024-12'], ['duplicate', '2021-01', '2024-12'],
    ['older', '2018-01', '2020-12'], ['invalid-start', '2024-13', ''],
    ['invalid-month', '2020-01', '2024-00'], ['invalid-year', '0000-01', ''],
    ['invalid-end-month', '', '2024-13'], ['trimmed', ' 2022-01 ', ' 2024-12 ']
  ].map(([label, startDate, endDate]) => ({ label, startDate, endDate }));
  const unknown = ['unknown', 'invalid-end', 'invalid-start', 'invalid-month', 'invalid-year', 'invalid-end-month'];
  assert.deepEqual(orderListByDate(periods, 'range', 'newest').map((entry) => entry.label), [
    'present-late', 'present-early', 'trimmed', 'same-end-late', 'duplicate', 'same-end-early', 'end-only', 'older', ...unknown
  ]);
  assert.deepEqual(orderListByDate(periods, 'range', 'oldest').map((entry) => entry.label), [
    'older', 'same-end-early', 'same-end-late', 'duplicate', 'trimmed', 'end-only', 'present-early', 'present-late', ...unknown
  ]);
  assert.equal(periods[0].label, 'unknown');
});

test('single dates retain ties and put blank/invalid dates last in both directions', () => {
  const entries = ['', '2025-01', '2023-12', '2025-01', '2025-13', '0000-01', '2024-1', ' 2024-01 ', 'bad']
    .map((date, index) => ({ date, index }));
  assert.deepEqual(orderListByDate(entries, 'date', 'newest').map((entry) => entry.index), [1, 3, 7, 2, 0, 4, 5, 6, 8]);
  assert.deepEqual(orderListByDate(entries, 'date', 'oldest').map((entry) => entry.index), [2, 7, 1, 3, 0, 4, 5, 6, 8]);
});

test('targets cannot select arbitrary arrays or another career, and duplicate content preserves record identities', () => {
  const { state, target, getItems } = listFixture('ja.careers');
  const { store } = instrumentedStore(state);
  for (const key of ['__proto__', 'constructor', 'ja.fields', 'en.links']) {
    assert.throws(() => store.reorderList({ key }, { type: 'move', from: 0, to: 1 }), TypeError);
  }
  assert.throws(() => store.reorderList({ key: 'ja.careerDetails', careerId: 'record_missing' }, { type: 'move', from: 0, to: 1 }), TypeError);
  assert.throws(() => store.reorderList({ ...target, careerId: getItems(state)[0].id }, { type: 'move', from: 0, to: 1 }), TypeError);
  assert.throws(() => store.reorderList({ key: 'profile.links' }, { type: 'sort', direction: 'newest' }), TypeError);
  assert.throws(() => store.reorderList(target, { type: 'sort', direction: 'unknown' }), TypeError);
  store.update((next) => { next.documents.ja.careers[1] = { ...cloneData(next.documents.ja.careers[0]), id: 'record_duplicate' }; });
  assert.equal(store.reorderList(target, { type: 'move', from: 0, to: 1 }), true);
  assert.equal(getItems(store.getState())[0].id, 'record_duplicate');
});

test('reorder uses existing encrypted persistence and retains IDs/order across reload and JSON import', async () => {
  const { state, target, getItems } = listFixture('en.experience');
  const values = new Map();
  const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  let key;
  const keyStore = { async read() { return key; }, async write(value) { key = value; } };
  const persistence = createDraftStorage(storage, { crypto: webcrypto, keyStore });
  const store = createStore({ initialState: state, persistence });
  assert.equal(store.reorderList(target, { type: 'move', from: 0, to: 2 }), true);
  await store.save();
  const expected = cloneData(store.getState());
  assert.equal(expected.version, 4);
  const raw = values.get(STORAGE_KEY);
  assert.ok(raw);
  assert.doesNotMatch(raw, /Fictitious entry|record_fictional-/);
  assert.deepEqual(await persistence.load(), expected);
  const imported = createStore({ initialState: createDefaultState(), persistence });
  await imported.importJson(store.exportJson());
  assert.deepEqual(imported.getState(), expected);
  assert.deepEqual(getItems(imported.getState()).map((entry) => entry.id), ['record_fictional-1', 'record_fictional-2', 'record_fictional-0']);
});

test('saving a reorder cannot overwrite later input or a second reorder while persistence waits', async () => {
  const { state, target, getItems } = listFixture('en.experience');
  let completeSave;
  let saved;
  const store = createStore({ initialState: state, persistence: {
    save(next) { saved = next; return new Promise((resolve) => { completeSave = resolve; }); }
  } });
  assert.equal(store.reorderList(target, { type: 'move', from: 0, to: 2 }), true);
  const saving = store.save();
  store.update((next) => { next.profile.fields.fullName = 'Fictitious later edit'; });
  assert.equal(store.reorderList(target, { type: 'move', from: 0, to: 1 }), true);
  const latest = store.getState();
  completeSave();
  await saving;
  assert.equal(store.getState(), latest);
  assert.equal(store.getState().profile.fields.fullName, 'Fictitious later edit');
  assert.deepEqual(getItems(store.getState()).map((entry) => entry.id), ['record_fictional-2', 'record_fictional-1', 'record_fictional-0']);
  assert.equal(saved.profile.fields.fullName, '');
  const nextSave = store.save();
  completeSave();
  await nextSave;
  assert.deepEqual(saved, latest);
});

test('failed/conflicting saves leave the latest local reorder intact and report the existing persistence error', async () => {
  const { state, target } = listFixture('ja.education');
  for (const code of ['save-failed', 'conflict', 'lock-unavailable']) {
    const store = createStore({ initialState: state, persistence: { async save() { throw new DraftStorageError(code); } } });
    const events = [];
    store.subscribe((_next, event) => events.push(event));
    assert.equal(store.reorderList(target, { type: 'move', from: 0, to: 1 }), true);
    const reordered = store.getState();
    await assert.rejects(store.save(), DraftStorageError);
    assert.equal(store.getState(), reordered);
    assert.deepEqual(events, [{ type: 'reorder', target, operation: { type: 'move', from: 0, to: 1 }, permutation: [1, 0, 2] }]);
  }
});

for (const [locale, render] of [['en', renderEnglishResume], ['zh-CN', renderChineseResume]]) {
  test(`${locale}: every rendered list retains saved array order, filters blanks and leaves legacy v4 untouched`, () => {
    const state = createDefaultState(locale);
    for (const type of ['experience', 'projects', 'education', 'certifications']) {
      const template = state.documents[locale].resume[type][0];
      state.documents[locale].resume[type] = [
        { ...template, company: 'Fictional-First', school: 'Fictional-First', name: 'Fictional-First', startDate: '2010-01', endDate: '2011-01', date: '2011-01' },
        { ...template },
        { ...template, company: 'Fictional-Second', school: 'Fictional-Second', name: 'Fictional-Second', startDate: '2024-01', endDate: '', date: '2024-01' }
      ];
      const before = cloneData(state);
      const html = render(state);
      const section = html.split(`data-section-key="${type}"`)[1].split('</section>')[0];
      assert.ok(section.indexOf('Fictional-First') < section.indexOf('Fictional-Second'));
      assert.deepEqual(state, before);
      state.documents[locale].resume[type] = [template];
    }
  });
}


test('identical primitive links still change positions and report a frozen UI permutation without payload metadata', () => {
  const state = createDefaultState();
  state.profile.fields.links = ['https://fictional.example/duplicate', 'https://fictional.example/duplicate'];
  const store = createStore({ initialState: state, persistence: { async save() {} } });
  const before = store.getState();
  let event;
  store.subscribe((_value, value) => { event = value; });
  assert.equal(store.reorderList({ key: 'profile.links' }, { type: 'move', from: 0, to: 1 }), true);
  assert.notEqual(store.getState(), before);
  assert.deepEqual(event.permutation, [1, 0]);
  assert.equal(Object.isFrozen(event), true);
  assert.equal(Object.isFrozen(event.target), true);
  assert.equal(Object.isFrozen(event.operation), true);
  assert.equal(Object.isFrozen(event.permutation), true);
  assert.equal(store.exportJson().includes('permutation'), false);
});
