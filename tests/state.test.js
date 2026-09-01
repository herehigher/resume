import test from 'node:test';
import assert from 'node:assert/strict';

import { STORAGE_KEY } from '../site/assets/js/config.js';
import { resolveLocale } from '../site/assets/js/i18n/index.js';
import { createDefaultState, createJapaneseSampleState } from '../site/assets/js/state/defaults.js';
import { validateState } from '../site/assets/js/state/schema.js';
import { loadStoredState } from '../site/assets/js/state/storage.js';
import { createStore } from '../site/assets/js/state/store.js';
import { protectDraftBeforeSample } from '../site/assets/js/ui/japanese-editor.js';
import { persistLocaleChange } from '../site/assets/js/ui/locale-controller.js';

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

test('default state contains independent locale documents', () => {
  const state = createDefaultState('zh-CN');
  assert.equal(validateState(state).valid, true);
  assert.equal(state.settings.locale, 'zh-CN');
  assert.notEqual(state.documents.ja, state.documents['zh-CN']);
  assert.notEqual(state.documents['zh-CN'], state.documents.en);
});

test('locale resolution follows URL, saved setting, browser, default order', () => {
  assert.equal(resolveLocale({
    search: '?lang=en',
    storedLocale: 'ja',
    browserLanguages: ['zh-CN']
  }), 'en');
  assert.equal(resolveLocale({
    storedLocale: 'zh-CN',
    browserLanguages: ['en-US']
  }), 'zh-CN');
  assert.equal(resolveLocale({ browserLanguages: ['en-GB'] }), 'en');
  assert.equal(resolveLocale({ browserLanguages: ['zh-Hans'] }), 'zh-CN');
  assert.equal(resolveLocale({ browserLanguages: ['zh'] }), 'zh-CN');
  assert.equal(resolveLocale({ browserLanguages: ['fr-FR'] }), 'ja');
});

test('new storage ignores the legacy key', () => {
  const storage = createMemoryStorage({
    'resume-studio-data-v1': JSON.stringify({ fields: { fullName: 'Legacy' } })
  });
  assert.equal(loadStoredState(storage), null);
});

test('locale documents persist without overwriting each other', () => {
  const storage = createMemoryStorage();
  const store = createStore({ storage, initialState: createDefaultState('ja') });

  store.update((state) => {
    state.documents.ja.fields.motivation = '日本語';
    state.documents['zh-CN'].resume.summary = '中文';
    state.documents.en.resume.summary = 'English';
  });
  store.save();

  const restored = loadStoredState(storage);
  assert.equal(restored.documents.ja.fields.motivation, '日本語');
  assert.equal(restored.documents['zh-CN'].resume.summary, '中文');
  assert.equal(restored.documents.en.resume.summary, 'English');
});

test('export and import round trip preserves all locale data', () => {
  const storage = createMemoryStorage();
  const source = createStore({ storage, initialState: createDefaultState('en') });
  source.update((state) => {
    state.profile.fields.fullName = 'Sample Person';
    state.documents.ja.fields.selfPromotion = '自己PR';
    state.documents['zh-CN'].resume.skills = '产品设计';
    state.documents.en.resume.skills = 'Product design';
    state.documents.en.resume.location = 'Tokyo, Japan';
  });

  const targetStorage = createMemoryStorage();
  const target = createStore({ storage: targetStorage, initialState: createDefaultState() });
  target.importJson(source.exportJson());

  assert.deepEqual(target.getState(), source.getState());
  assert.equal(JSON.parse(targetStorage.getItem(STORAGE_KEY)).profile.fields.fullName, 'Sample Person');
});

test('invalid import does not change current or persisted data', () => {
  const storage = createMemoryStorage();
  const store = createStore({ storage, initialState: createDefaultState('ja') });
  store.update((state) => {
    state.profile.fields.fullName = '守るデータ';
  });
  store.save();
  const beforeState = JSON.stringify(store.getState());
  const beforeStored = storage.getItem(STORAGE_KEY);

  assert.throws(() => store.importJson('{"version":999}'));
  assert.equal(JSON.stringify(store.getState()), beforeState);
  assert.equal(storage.getItem(STORAGE_KEY), beforeStored);
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

test('changing locale from sample mode persists the protected draft, not sample data', () => {
  const storage = createMemoryStorage();
  const store = createStore({ storage, initialState: createDefaultState('ja') });
  store.update((state) => {
    state.profile.fields.fullName = '保存する氏名';
  });
  store.save();
  const protectedDraft = protectDraftBeforeSample(store, true);
  store.replace(createJapaneseSampleState(store.getState()), { type: 'sample' });

  persistLocaleChange(store, 'zh-CN', () => {
    store.replace(protectedDraft, { type: 'restore' });
  });

  assert.equal(store.getState().profile.fields.fullName, '保存する氏名');
  assert.equal(store.getState().settings.locale, 'zh-CN');
  assert.equal(loadStoredState(storage).profile.fields.fullName, '保存する氏名');
  assert.equal(loadStoredState(storage).settings.locale, 'zh-CN');
});

test('failed locale persistence leaves state and stored data unchanged', () => {
  const storage = createMemoryStorage();
  const store = createStore({ storage, initialState: createDefaultState('ja') });
  store.update((state) => {
    state.profile.fields.fullName = '保持する氏名';
  });
  store.save();
  const storedBefore = storage.getItem(STORAGE_KEY);
  storage.setItem = () => {
    throw new Error('quota exceeded');
  };

  assert.throws(() => persistLocaleChange(store, 'en'), /quota exceeded/);
  assert.equal(store.getState().settings.locale, 'ja');
  assert.equal(storage.getItem(STORAGE_KEY), storedBefore);
});

test('import rejects remote and unsupported photo sources', () => {
  const storage = createMemoryStorage();
  const store = createStore({ storage, initialState: createDefaultState() });
  const unsafe = createDefaultState();
  unsafe.profile.photo = 'https://example.com/tracker.png';

  assert.throws(() => store.importJson(JSON.stringify(unsafe)));
  assert.equal(store.getState().profile.photo, '');
});

test('Chinese and English documents reject unsupported document modes', () => {
  const state = createDefaultState('en');
  state.documents.en.activeDocument = 'career';
  state.documents['zh-CN'].activeDocument = 'portfolio';

  const result = validateState(state);
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes('documents.en.activeDocument is not supported'));
  assert.ok(result.errors.includes('documents.zh-CN.activeDocument is not supported'));
});

test('English location is part of the validated document model', () => {
  const state = createDefaultState('en');
  assert.equal(state.documents.en.resume.location, '');
  assert.equal(validateState(state).valid, true);

  state.documents.en.resume.location = { city: 'Tokyo' };
  const result = validateState(state);
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes('state.documents.en.resume.location must be string'));
});
