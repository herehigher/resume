import test from 'node:test';
import assert from 'node:assert/strict';

import { STORAGE_KEY } from '../site/assets/js/config.js';
import { createDefaultState, createJapaneseSampleState } from '../site/assets/js/state/defaults.js';
import { validateState } from '../site/assets/js/state/schema.js';
import { loadStoredState } from '../site/assets/js/state/storage.js';
import { createStore } from '../site/assets/js/state/store.js';
import { protectDraftBeforeSample } from '../site/assets/js/ui/japanese-editor.js';

function createMemoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    }
  };
}

test('default Japanese state matches the versioned schema', () => {
  const state = createDefaultState();
  assert.equal(validateState(state).valid, true);
  assert.equal(state.settings.pageSize, 'A4');
  assert.deepEqual(Object.keys(state.documents), ['ja']);
});

test('new storage ignores the legacy key', () => {
  const storage = createMemoryStorage({
    'resume-studio-data-v1': JSON.stringify({ fields: { fullName: 'Legacy' } })
  });
  assert.equal(loadStoredState(storage), null);
});

test('Japanese document and shared profile persist together', () => {
  const storage = createMemoryStorage();
  const store = createStore({ storage, initialState: createDefaultState() });

  store.update((state) => {
    state.profile.fields.fullName = '山田 太郎';
    state.documents.ja.fields.motivation = '志望動機';
  });
  store.save();

  const restored = loadStoredState(storage);
  assert.equal(restored.profile.fields.fullName, '山田 太郎');
  assert.equal(restored.documents.ja.fields.motivation, '志望動機');
  assert.equal(JSON.parse(storage.getItem(STORAGE_KEY)).version, 1);
});

test('invalid stored state is ignored', () => {
  const storage = createMemoryStorage({
    [STORAGE_KEY]: JSON.stringify({ version: 999 })
  });
  assert.equal(loadStoredState(storage), null);
});

test('sample state does not mutate the source draft', () => {
  const source = createDefaultState();
  source.profile.fields.fullName = '保存する氏名';
  const sample = createJapaneseSampleState(source);

  assert.equal(source.profile.fields.fullName, '保存する氏名');
  assert.equal(sample.profile.fields.fullName, '山田 太郎');
});

test('entering sample mode synchronously persists pending draft changes', () => {
  const storage = createMemoryStorage();
  const store = createStore({ storage, initialState: createDefaultState() });
  store.update((state) => {
    state.profile.fields.fullName = '保存直前の氏名';
  });

  const snapshot = protectDraftBeforeSample(store, true);

  assert.equal(snapshot.profile.fields.fullName, '保存直前の氏名');
  assert.equal(loadStoredState(storage).profile.fields.fullName, '保存直前の氏名');
});

test('sample draft protection propagates storage failures without changing state', () => {
  const storage = createMemoryStorage();
  storage.setItem = () => {
    throw new Error('quota exceeded');
  };
  const store = createStore({ storage, initialState: createDefaultState() });
  store.update((state) => {
    state.profile.fields.fullName = '画面に残す氏名';
  });

  assert.throws(() => protectDraftBeforeSample(store, true), /quota exceeded/);
  assert.equal(store.getState().profile.fields.fullName, '画面に残す氏名');
  assert.equal(loadStoredState(storage), null);
});

test('schema rejects remote and unsupported photo sources', () => {
  const state = createDefaultState();
  state.profile.photo = 'https://example.com/tracker.png';

  assert.equal(validateState(state).valid, false);
});
