import test from 'node:test';
import assert from 'node:assert/strict';

import { LOCALE_PREFERENCE_KEY, STORAGE_KEY } from '../site/assets/js/config.js';
import { resolveLocale } from '../site/assets/js/i18n/index.js';
import { loadLocalePreference, saveLocalePreference } from '../site/assets/js/state/locale-preference.js';
import { createDefaultState, createJapaneseSampleState } from '../site/assets/js/state/defaults.js';
import { validateState } from '../site/assets/js/state/schema.js';
import { createStore } from '../site/assets/js/state/store.js';
import { DraftStorageError, serializeState } from '../site/assets/js/state/storage.js';
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

function createTestPersistence(storage) {
  return {
    async save(state) { storage.setItem(STORAGE_KEY, JSON.stringify(state)); },
    async load() { const raw = storage.getItem(STORAGE_KEY); return raw ? JSON.parse(raw) : null; },
    async remove() { storage.removeItem(STORAGE_KEY); },
    flush() { return Promise.resolve(); }
  };
}

function readPersisted(storage) {
  const raw = storage.getItem(STORAGE_KEY);
  return raw ? JSON.parse(raw) : null;
}

function createTestStore(storage, initialState) {
  return createStore({ storage, initialState, persistence: createTestPersistence(storage) });
}

test('default state contains independent locale documents', () => {
  const state = createDefaultState('zh-CN');
  assert.equal(validateState(state).valid, true);
  assert.equal(state.settings.locale, 'zh-CN');
  assert.notEqual(state.documents.ja, state.documents['zh-CN']);
  assert.notEqual(state.documents['zh-CN'], state.documents.en);
  assert.deepEqual(state.documents.ja.careers[0].detailSections, [
    { title: '担当業務', content: '' },
    { title: '実績・成果', content: '' }
  ]);
});

test('Japanese career detail sections are validated and survive JSON export/import in order', async () => {
  const state = createDefaultState('ja');
  state.documents.ja.careers[0].detailSections = [
    { title: 'プロジェクト概要', content: '架空のプロジェクトです。' },
    { title: '使用技術', content: 'HTML, CSS, JavaScript' },
    { title: 'チーム規模', content: '5名' }
  ];
  assert.equal(validateState(state).valid, true);

  const storage = createMemoryStorage();
  const source = createTestStore(storage, state);
  const target = createTestStore(createMemoryStorage(), createDefaultState());
  await target.importJson(source.exportJson());
  assert.deepEqual(target.getState().documents.ja.careers[0].detailSections, state.documents.ja.careers[0].detailSections);

  state.documents.ja.careers[0].detailSections[0].unexpected = 'unsupported';
  const result = validateState(state);
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes('state.documents.ja.careers[0].detailSections[0] has an unsupported shape'));
});

test('Japanese sample keeps the original responsibilities and achievements examples', () => {
  const state = createJapaneseSampleState(createDefaultState('ja'));
  assert.deepEqual(state.documents.ja.careers[0].detailSections, [
    {
      title: '担当業務',
      content: '・法人向けSaaSプロダクトの企画、要件定義\n・利用データおよび顧客インタビューに基づく改善施策の立案\n・エンジニア、デザイナー、営業とのプロジェクト推進\n・5名の企画チームのマネジメント'
    },
    {
      title: '実績・成果',
      content: '・オンボーディング改善により継続率を18ポイント向上\n・新機能の企画・提供により主要指標を前年比125%へ改善\n・開発プロセスの見直しによりリードタイムを30%短縮'
    }
  ]);
});

test('page break settings are isolated and reject unsupported keys and duplicates', () => {
  const state = createDefaultState('en');
  state.settings.pageBreaks.en.A4.resume = ['projects'];
  state.settings.pageBreaks.en.LETTER.resume = ['skills'];
  assert.equal(validateState(state).valid, true);
  state.settings.pageBreaks.en.A4.resume = ['projects', 'projects'];
  assert.equal(validateState(state).valid, false);
  state.settings.pageBreaks.en.A4.resume = ['not-a-section'];
  assert.equal(validateState(state).valid, false);
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
  assert.equal(resolveLocale({ browserLanguages: ['zh-TW'] }), 'ja');
  assert.equal(resolveLocale({ browserLanguages: ['zh-Hant'] }), 'ja');
  assert.equal(resolveLocale({ browserLanguages: ['fr-FR'] }), 'ja');
});

test('locale preference is versioned, unencrypted, and independent from the draft', () => {
  const storage = createMemoryStorage();
  assert.equal(loadLocalePreference(storage), null);
  saveLocalePreference(storage, 'en');
  assert.equal(loadLocalePreference(storage), 'en');
  assert.deepEqual(JSON.parse(storage.getItem(LOCALE_PREFERENCE_KEY)), { version: 1, locale: 'en' });
  storage.setItem(STORAGE_KEY, JSON.stringify(createDefaultState('ja')));
  assert.equal(loadLocalePreference(storage), 'en');
});

test('new storage reads only the configured draft key', () => {
  const storage = createMemoryStorage({
    'unrelated-storage-sentinel': JSON.stringify({ fields: { fullName: 'Unrelated' } })
  });
  assert.equal(readPersisted(storage), null);
});

test('locale documents persist without overwriting each other', async () => {
  const storage = createMemoryStorage();
  const store = createTestStore(storage, createDefaultState('ja'));

  store.update((state) => {
    state.documents.ja.fields.motivation = '日本語';
    state.documents['zh-CN'].resume.summary = '中文';
    state.documents.en.resume.summary = 'English';
  });
  await store.save();

  const restored = readPersisted(storage);
  assert.equal(restored.documents.ja.fields.motivation, '日本語');
  assert.equal(restored.documents['zh-CN'].resume.summary, '中文');
  assert.equal(restored.documents.en.resume.summary, 'English');
});

test('export and import round trip preserves all locale data', async () => {
  const storage = createMemoryStorage();
  const source = createTestStore(storage, createDefaultState('en'));
  source.update((state) => {
    state.profile.fields.fullName = 'Sample Person';
    state.documents.ja.fields.selfPromotion = '自己PR';
    state.documents['zh-CN'].resume.skills = '产品设计';
    state.documents.en.resume.skills = 'Product design';
    state.documents.en.resume.location = 'Tokyo, Japan';
  });

  const targetStorage = createMemoryStorage();
  const target = createTestStore(targetStorage, createDefaultState());
  await target.importJson(source.exportJson());

  assert.deepEqual(target.getState(), source.getState());
  assert.equal(JSON.parse(targetStorage.getItem(STORAGE_KEY)).profile.fields.fullName, 'Sample Person');
});

test('page breaks survive export, import, reload, and locale, document, and paper switching', async () => {
  const storage = createMemoryStorage();
  const source = createTestStore(storage, createDefaultState('en'));
  source.update((state) => {
    state.settings.pageBreaks.ja.A4.resume = ['qualifications'];
    state.settings.pageBreaks.ja.A4.career = ['career-history'];
    state.settings.pageBreaks.en.A4.resume = ['projects'];
    state.settings.pageBreaks.en.LETTER.resume = ['skills'];
  });
  await source.save();
  const targetStorage = createMemoryStorage();
  const target = createTestStore(targetStorage, createDefaultState());
  await target.importJson(source.exportJson());
  await target.reload();
  assert.deepEqual(target.getState().settings.pageBreaks, source.getState().settings.pageBreaks);
});

test('invalid import does not change current or persisted data', async () => {
  const storage = createMemoryStorage();
  const store = createTestStore(storage, createDefaultState('ja'));
  store.update((state) => {
    state.profile.fields.fullName = '守るデータ';
  });
  await store.save();
  const beforeState = JSON.stringify(store.getState());
  const beforeStored = storage.getItem(STORAGE_KEY);

  assert.throws(() => store.importJson('{"version":999}'));
  assert.equal(JSON.stringify(store.getState()), beforeState);
  assert.equal(storage.getItem(STORAGE_KEY), beforeStored);
});

test('prepared import is side-effect free until confirmation and then replaces a same-page edit', async () => {
  const storage = createMemoryStorage();
  const store = createTestStore(storage, createDefaultState('ja'));
  await store.save();
  const beforeRaw = storage.getItem(STORAGE_KEY);
  const backup = createDefaultState('en');
  backup.profile.fields.fullName = 'Imported example';

  const prepared = store.prepareImport(JSON.stringify(backup));
  assert.equal(store.isImportPending(), true);
  assert.equal(storage.getItem(STORAGE_KEY), beforeRaw);
  assert.equal(store.getState().profile.fields.fullName, '');

  store.update((state) => { state.profile.fields.fullName = 'New local edit'; });
  await store.importPrepared(prepared);
  assert.equal(store.isImportPending(), false);
  assert.equal(store.getState().profile.fields.fullName, 'Imported example');
  assert.notEqual(storage.getItem(STORAGE_KEY), beforeRaw);
});

test('prepared import replaces memory only after persistence succeeds', async () => {
  const storage = createMemoryStorage();
  const persistence = {
    async save() { throw new Error('quota'); },
    async load() { return null; },
    async remove() {},
    flush() { return Promise.resolve(); }
  };
  const store = createStore({ storage, initialState: createDefaultState('ja'), persistence });
  const backup = createDefaultState('en');
  backup.profile.fields.fullName = 'Imported example';

  const prepared = store.prepareImport(JSON.stringify(backup));
  await assert.rejects(() => store.importPrepared(prepared), /quota/);
  assert.equal(store.getState().profile.fields.fullName, '');
  assert.equal(storage.getItem(STORAGE_KEY), null);
});

test('a same-page edit while an import save is pending is replaced after the import succeeds', async () => {
  const storage = createMemoryStorage();
  let resolveSave;
  const persistence = {
    save() { return new Promise((resolve) => { resolveSave = resolve; }); },
    async load() { return createDefaultState('en'); },
    async remove() {},
    flush() { return Promise.resolve(); }
  };
  const store = createStore({ storage, initialState: createDefaultState('ja'), persistence });
  const backup = createDefaultState('en');
  backup.profile.fields.fullName = 'Imported example';

  const prepared = store.prepareImport(JSON.stringify(backup));
  const importing = store.importPrepared(prepared);
  store.update((state) => { state.profile.fields.fullName = 'Edited while saving'; });
  resolveSave();

  await importing;
  assert.equal(store.getState().profile.fields.fullName, 'Imported example');
});

test('a same-page reload while an import save is pending is replaced after the import succeeds', async () => {
  const storage = createMemoryStorage();
  let resolveSave;
  const reloaded = createDefaultState('en');
  reloaded.profile.fields.fullName = 'Reloaded fictional draft';
  const persistence = {
    save() { return new Promise((resolve) => { resolveSave = resolve; }); },
    async load() { return reloaded; },
    async remove() {},
    flush() { return Promise.resolve(); }
  };
  const store = createStore({ storage, initialState: createDefaultState('ja'), persistence });
  const prepared = store.prepareImport(JSON.stringify(createDefaultState('en')));
  const importing = store.importPrepared(prepared);

  await store.reload();
  resolveSave();

  await importing;
  assert.equal(store.getState().settings.locale, 'en');
  assert.equal(store.getState().profile.fields.fullName, '');
});

test('a same-page reload before import persistence starts is replaced after the import succeeds', async () => {
  const storage = createMemoryStorage();
  const store = createTestStore(storage, createDefaultState('ja'));
  await store.save();
  const backup = createDefaultState('en');
  backup.profile.fields.fullName = 'Imported after reload';

  const prepared = store.prepareImport(JSON.stringify(backup));
  await store.reload();
  await store.importPrepared(prepared);

  assert.equal(store.getState().profile.fields.fullName, 'Imported after reload');
});

test('every import persistence failure completes the transaction and leaves saving available', async () => {
  for (const code of ['storage-unavailable', 'web-lock-unavailable', 'storage-changed', 'crypto-unavailable']) {
    const storage = createMemoryStorage();
    let failed = true;
    const events = [];
    const persistence = {
      async save() {
        if (failed) throw new DraftStorageError(code);
      },
      async load() { return null; },
      async remove() {},
      flush() { return Promise.resolve(); }
    };
    const store = createStore({ storage, initialState: createDefaultState('ja'), persistence });
    store.subscribe((_state, event) => events.push(event.type));
    const prepared = store.prepareImport(JSON.stringify(createDefaultState('en')));

    await assert.rejects(() => store.importPrepared(prepared), (error) => error.code === code);
    assert.deepEqual(events, ['import-pending', 'import-failed']);
    assert.equal(store.isImportPending(), false);
    assert.equal(store.getState().settings.locale, 'ja');
    failed = false;
    await store.save();
  }
});

test('future and invalid revision imports are rejected without opening an import transaction', () => {
  const storage = createMemoryStorage();
  const store = createTestStore(storage, createDefaultState());
  const original = JSON.stringify(store.getState());

  assert.throws(() => store.prepareImport(JSON.stringify({ version: 1, schemaRevision: 99 })), (error) => error.code === 'future-state');
  assert.throws(() => store.prepareImport(JSON.stringify({ version: 1, schemaRevision: -1 })), (error) => error.code === 'unsupported-state');
  assert.equal(store.isImportPending(), false);
  assert.equal(JSON.stringify(store.getState()), original);
  assert.equal(storage.getItem(STORAGE_KEY), null);
});

test('export rejects a bootstrap-shaped state without the current schema revision', () => {
  const bootstrap = createDefaultState('ja');
  delete bootstrap.schemaRevision;

  assert.throws(() => serializeState(bootstrap), /current schema revision/);
});

test('entering sample mode persists pending draft changes', async () => {
  const storage = createMemoryStorage();
  const store = createTestStore(storage, createDefaultState());
  store.update((state) => {
    state.profile.fields.fullName = '保存直前の氏名';
  });

  const snapshot = await protectDraftBeforeSample(store, true);

  assert.equal(snapshot.profile.fields.fullName, '保存直前の氏名');
  assert.equal(readPersisted(storage).profile.fields.fullName, '保存直前の氏名');
});

test('sample draft protection propagates storage failures without changing state', async () => {
  const storage = createMemoryStorage();
  storage.setItem = () => {
    throw new Error('quota exceeded');
  };
  const store = createTestStore(storage, createDefaultState());
  store.update((state) => {
    state.profile.fields.fullName = '画面に残す氏名';
  });

  await assert.rejects(() => protectDraftBeforeSample(store, true), /quota exceeded/);
  assert.equal(store.getState().profile.fields.fullName, '画面に残す氏名');
  assert.equal(readPersisted(storage), null);
});

test('changing locale only saves the independent preference, not the current draft', async () => {
  const storage = createMemoryStorage();
  const store = createTestStore(storage, createDefaultState('ja'));
  store.update((state) => {
    state.profile.fields.fullName = '保存する氏名';
  });
  await store.save();
  await protectDraftBeforeSample(store, true);
  store.replace(createJapaneseSampleState(store.getState()), { type: 'sample' });

  persistLocaleChange(store, storage, 'zh-CN');

  assert.equal(store.getState().profile.fields.fullName, '山田 太郎');
  assert.equal(store.getState().settings.locale, 'zh-CN');
  assert.equal(readPersisted(storage).profile.fields.fullName, '保存する氏名');
  assert.equal(readPersisted(storage).settings.locale, 'ja');
  assert.equal(loadLocalePreference(storage), 'zh-CN');
});

test('failed locale preference persistence keeps the current session language and draft', async () => {
  const storage = createMemoryStorage();
  const store = createTestStore(storage, createDefaultState('ja'));
  store.update((state) => {
    state.profile.fields.fullName = '保持する氏名';
  });
  await store.save();
  const storedBefore = storage.getItem(STORAGE_KEY);
  storage.setItem = () => {
    throw new Error('quota exceeded');
  };

  assert.throws(() => persistLocaleChange(store, storage, 'en'), /quota exceeded/);
  assert.equal(store.getState().settings.locale, 'en');
  assert.equal(storage.getItem(STORAGE_KEY), storedBefore);
});

test('import retains the saved document locale without replacing the independent display preference', async () => {
  const storage = createMemoryStorage();
  saveLocalePreference(storage, 'en');
  const store = createTestStore(storage, createDefaultState('en'));
  const imported = createDefaultState('ja');
  await store.importJson(JSON.stringify(imported));
  assert.equal(store.getState().settings.locale, 'ja');
  assert.equal(loadLocalePreference(storage), 'en');
});

test('import rejects remote and unsupported photo sources', () => {
  const storage = createMemoryStorage();
  const store = createTestStore(storage, createDefaultState());
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
