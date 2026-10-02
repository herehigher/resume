import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultState, cloneData } from '../site/assets/js/state/defaults.js';
import { createStore } from '../site/assets/js/state/store.js';
import { DraftStorageError } from '../site/assets/js/state/storage.js';

function controlledStore() {
  const saves = [];
  let persisted = null;
  const persistence = {
    save(snapshot) {
      return new Promise((resolve, reject) => {
        saves.push({ snapshot, reject, complete() { persisted = cloneData(snapshot); resolve(); } });
      });
    },
    async load() { return persisted; },
    flush() { return Promise.resolve(); }
  };
  const store = createStore({ initialState: createDefaultState('ja'), persistence });
  const events = [];
  store.subscribe((_state, event) => { if (event.type === 'save') events.push(event.type); });
  const edit = (value) => store.update((state) => { state.profile.fields.fullName = value; });
  return { store, saves, events, edit };
}

test('save A cannot announce a newer edit B as saved, and B survives reload', async () => {
  const { store, saves, events, edit } = controlledStore();
  edit('Fictional A');
  const first = store.save();
  edit('Fictional B');
  const second = store.save();
  saves[0].complete();
  assert.equal(await first, false);
  assert.deepEqual(events, []);
  assert.equal(store.getState().profile.fields.fullName, 'Fictional B');
  assert.equal(store.hasStoredState(), true, 'A is stored even though B remains unsaved');
  saves[1].complete();
  assert.equal(await second, true);
  assert.deepEqual(events, ['save']);
  await store.reload();
  assert.equal(store.getState().profile.fields.fullName, 'Fictional B');
});

test('an edit before the next save starts invalidates the prior save completion', async () => {
  const { store, saves, events, edit } = controlledStore();
  const first = store.save();
  edit('Fictional B before debounce');
  saves[0].complete();
  assert.equal(await first, false);
  assert.deepEqual(events, []);
});

for (const code of ['storage-unavailable', 'storage-changed']) {
  test(`older success cannot mark a failed latest save as saved (${code})`, async () => {
    const { store, saves, events, edit } = controlledStore();
    const first = store.save();
    edit('Fictional failed B');
    const second = store.save();
    saves[1].reject(new DraftStorageError(code));
    await assert.rejects(second, (error) => error.code === code);
    saves[0].complete();
    assert.equal(await first, false);
    assert.deepEqual(events, []);
    assert.equal(store.getState().profile.fields.fullName, 'Fictional failed B');
  });
}

test('a newer request for the same state invalidates older completion', async () => {
  const { store, saves, events } = controlledStore();
  const first = store.save();
  const second = store.save();
  saves[1].reject(new DraftStorageError('storage-changed'));
  await assert.rejects(second, (error) => error.code === 'storage-changed');
  saves[0].complete();
  assert.equal(await first, false);
  assert.deepEqual(events, []);
});


test('display locale-only changes do not invalidate the current draft save', async () => {
  const { store, saves, events, edit } = controlledStore();
  edit('Fictional A before locale change');
  const revision = store.getDraftRevision();
  const first = store.save();
  store.update((state) => { state.settings.locale = 'en'; }, { type: 'locale' });
  assert.equal(store.getDraftRevision(), revision);
  saves[0].complete();
  assert.equal(await first, true);
  assert.deepEqual(events, ['save']);
  assert.equal(store.getState().settings.locale, 'en');
  assert.equal(saves[0].snapshot.settings.locale, 'ja', 'display preference does not rewrite the saved snapshot');
});

test('a locale event containing a draft edit still invalidates the prior save', async () => {
  const { store, saves, events } = controlledStore();
  const first = store.save();
  store.update((state) => {
    state.settings.locale = 'en';
    state.profile.fields.fullName = 'Fictional B with locale event';
  }, { type: 'locale' });
  saves[0].complete();
  assert.equal(await first, false);
  assert.deepEqual(events, []);
});
