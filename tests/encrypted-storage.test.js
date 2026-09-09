import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';

import { STORAGE_KEY } from '../site/assets/js/config.js';
import { createDefaultState } from '../site/assets/js/state/defaults.js';
import { createDraftStorage, DRAFT_WEB_LOCK_NAME, DraftStorageError, ENCRYPTED_DRAFT_ALGORITHM, ENCRYPTED_DRAFT_FORMAT } from '../site/assets/js/state/storage.js';

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); }
  };
}

function memoryKeyStore() {
  let key = null;
  return {
    async read() { return key; },
    async write(next) { key = next; },
    async remove() { key = null; }
  };
}

function controllableKeyStore(initialKey = null) {
  let key = initialKey;
  let beforeNextRead = null;
  let removals = 0;
  return {
    async read() {
      const callback = beforeNextRead;
      beforeNextRead = null;
      if (callback) await callback();
      return key;
    },
    async write(next) { key = next; },
    async remove() { removals += 1; key = null; },
    replace(next) { key = next; },
    runBeforeNextRead(callback) { beforeNextRead = callback; },
    current() { return key; },
    removals() { return removals; }
  };
}

function persistence(storage, keyStore = memoryKeyStore(), options = {}) {
  return createDraftStorage(storage, { crypto: webcrypto, keyStore, ...options });
}

function sharedLockManager(events = []) {
  let tail = Promise.resolve();
  return {
    request(name, _options, callback) {
      events.push(name);
      const task = tail.then(callback, callback);
      tail = task.catch(() => {});
      return task;
    }
  };
}

async function encryptUnsupportedState(state, key) {
  const nonce = webcrypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(state));
  const ciphertext = await webcrypto.subtle.encrypt({ name: ENCRYPTED_DRAFT_ALGORITHM, iv: nonce }, key, plaintext);
  return JSON.stringify({
    format: ENCRYPTED_DRAFT_FORMAT,
    algorithm: ENCRYPTED_DRAFT_ALGORITHM,
    nonce: Buffer.from(nonce).toString('base64'),
    ciphertext: Buffer.from(ciphertext).toString('base64')
  });
}

test('draft ciphertext contains no fixture name or email and reload restores it', async () => {
  const storage = memoryStorage();
  const keyStore = memoryKeyStore();
  const saved = createDefaultState('en');
  saved.profile.fields.fullName = 'Ciphertext Fixture';
  saved.profile.fields.email = 'ciphertext.fixture@example.test';
  saved.settings.pageBreaks.en.LETTER.resume = ['summary', 'experience'];
  const writer = persistence(storage, keyStore);

  await writer.save(saved);
  const raw = storage.getItem(STORAGE_KEY);
  assert.doesNotMatch(raw, /Ciphertext Fixture|ciphertext\.fixture@example\.test/);
  assert.deepEqual(JSON.parse(raw).format, ENCRYPTED_DRAFT_FORMAT);
  assert.deepEqual(JSON.parse(raw).algorithm, ENCRYPTED_DRAFT_ALGORITHM);
  const restored = await persistence(storage, keyStore).load();
  assert.equal(restored.profile.fields.fullName, 'Ciphertext Fixture');
  assert.deepEqual(restored.settings.pageBreaks.en.LETTER.resume, ['summary', 'experience']);
});

test('a plaintext v1 draft migrates only after encrypted persistence succeeds', async () => {
  const original = createDefaultState('ja');
  original.profile.fields.fullName = 'Migration Fixture';
  const storage = memoryStorage({ [STORAGE_KEY]: JSON.stringify(original) });
  const keyStore = memoryKeyStore();

  const loaded = await persistence(storage, keyStore).load();
  assert.equal(loaded.profile.fields.fullName, 'Migration Fixture');
  assert.equal(JSON.parse(storage.getItem(STORAGE_KEY)).format, ENCRYPTED_DRAFT_FORMAT);

  const failingStorage = memoryStorage({ [STORAGE_KEY]: JSON.stringify(original) });
  failingStorage.setItem = () => { throw new Error('quota'); };
  await assert.rejects(() => persistence(failingStorage).load(), DraftStorageError);
  assert.equal(failingStorage.getItem(STORAGE_KEY), JSON.stringify(original));
});

test('schema-incompatible encrypted and plaintext v1 drafts stay preserved and cannot be overwritten', async () => {
  const unsupported = createDefaultState('ja');
  unsupported.documents.ja.careers[0] = {
    company: '以前の勤務先',
    role: '',
    startDate: '',
    endDate: '',
    companyInfo: '',
    responsibilities: '以前の担当業務',
    achievements: '以前の実績'
  };
  const legacy = JSON.stringify({ keep: 'legacy storage must remain untouched' });

  const encryptedStorage = memoryStorage({ 'resume-studio-data-v1': legacy });
  const encryptedKeys = controllableKeyStore();
  const key = await webcrypto.subtle.generateKey({ name: ENCRYPTED_DRAFT_ALGORITHM, length: 256 }, false, ['encrypt', 'decrypt']);
  await encryptedKeys.write(key);
  const encryptedRaw = await encryptUnsupportedState(unsupported, key);
  encryptedStorage.setItem(STORAGE_KEY, encryptedRaw);
  const encryptedDraft = persistence(encryptedStorage, encryptedKeys);

  await assert.rejects(() => encryptedDraft.loadAndRecoverUnreadableDraft(), (error) => error.code === 'unsupported-state');
  await assert.rejects(() => encryptedDraft.save(createDefaultState()), (error) => error.code === 'unsupported-state');
  assert.equal(encryptedStorage.getItem(STORAGE_KEY), encryptedRaw);
  assert.equal(encryptedStorage.getItem('resume-studio-data-v1'), legacy);
  assert.equal(encryptedKeys.current(), key);
  assert.equal(encryptedKeys.removals(), 0);

  const plaintextRaw = JSON.stringify(unsupported);
  const plaintextStorage = memoryStorage({ [STORAGE_KEY]: plaintextRaw, 'resume-studio-data-v1': legacy });
  const plaintextKeys = controllableKeyStore();
  const plaintextDraft = persistence(plaintextStorage, plaintextKeys);
  await assert.rejects(() => plaintextDraft.loadAndRecoverUnreadableDraft(), (error) => error.code === 'unsupported-state');
  await assert.rejects(() => plaintextDraft.save(createDefaultState()), (error) => error.code === 'unsupported-state');
  assert.equal(plaintextStorage.getItem(STORAGE_KEY), plaintextRaw);
  assert.equal(plaintextStorage.getItem('resume-studio-data-v1'), legacy);
  assert.equal(plaintextKeys.current(), null);
  assert.equal(plaintextKeys.removals(), 0);
});

test('corrupt envelopes, missing keys, IndexedDB, and crypto failures do not fall back to plaintext', async () => {
  const corrupt = memoryStorage({ [STORAGE_KEY]: JSON.stringify({ format: ENCRYPTED_DRAFT_FORMAT, algorithm: 'AES-CBC', nonce: '', ciphertext: '' }) });
  await assert.rejects(() => persistence(corrupt).load(), (error) => error.code === 'corrupt-envelope');

  const storage = memoryStorage();
  await persistence(storage, memoryKeyStore()).save(createDefaultState());
  await assert.rejects(() => persistence(storage, memoryKeyStore()).load(), (error) => error.code === 'key-missing');

  await assert.rejects(() => createDraftStorage(memoryStorage(), { crypto: webcrypto }).save(createDefaultState()), (error) => error.code === 'indexeddb-unavailable');
  await assert.rejects(() => createDraftStorage(memoryStorage(), { crypto: {}, keyStore: memoryKeyStore() }).save(createDefaultState()), (error) => error.code === 'crypto-unavailable');
});

test('envelope allowlist and bounds reject attacker-controlled storage without replacing it', async () => {
  const state = createDefaultState();
  const storage = memoryStorage();
  const writer = persistence(storage);
  await writer.save(state);
  const original = storage.getItem(STORAGE_KEY);

  const extraField = { ...JSON.parse(original), unexpected: 'value' };
  storage.setItem(STORAGE_KEY, JSON.stringify(extraField));
  const withExtraField = storage.getItem(STORAGE_KEY);
  await assert.rejects(() => writer.save(state), (error) => error.code === 'corrupt-envelope');
  assert.equal(storage.getItem(STORAGE_KEY), withExtraField);

  storage.setItem(STORAGE_KEY, 'x'.repeat((4 * 1024 * 1024) + 1));
  const oversized = storage.getItem(STORAGE_KEY);
  await assert.rejects(() => writer.load(), (error) => error.code === 'corrupt-envelope');
  assert.equal(storage.getItem(STORAGE_KEY), oversized);
});

test('save rejects an oversized schema-valid state before it can create an unloadable envelope', async () => {
  const storage = memoryStorage();
  const keys = controllableKeyStore();
  const writer = persistence(storage, keys);
  const originalState = createDefaultState();
  originalState.profile.fields.fullName = 'Keep existing draft';
  await writer.save(originalState);
  const original = storage.getItem(STORAGE_KEY);
  const oversized = createDefaultState();
  oversized.profile.photo = `data:image/jpeg;base64,${'A'.repeat(3 * 1024 * 1024)}`;

  await assert.rejects(() => writer.save(oversized), (error) => error.code === 'draft-too-large');
  assert.equal(storage.getItem(STORAGE_KEY), original);
  assert.equal((await writer.load()).profile.fields.fullName, 'Keep existing draft');
});

test('an existing ciphertext cannot be overwritten when its key is missing or invalid', async () => {
  const storage = memoryStorage();
  const originalKeys = memoryKeyStore();
  await persistence(storage, originalKeys).save(createDefaultState());
  const original = storage.getItem(STORAGE_KEY);

  await assert.rejects(() => persistence(storage, memoryKeyStore()).save(createDefaultState()), (error) => error.code === 'key-missing');
  assert.equal(storage.getItem(STORAGE_KEY), original);

  const invalidKeys = { async read() { return { type: 'secret', extractable: true, algorithm: { name: 'AES-GCM' }, usages: ['encrypt', 'decrypt'] }; }, async write() {}, async remove() {} };
  await assert.rejects(() => persistence(storage, invalidKeys).save(createDefaultState()), (error) => error.code === 'key-invalid');
  assert.equal(storage.getItem(STORAGE_KEY), original);
});

test('a different valid non-extractable key cannot overwrite an existing ciphertext after startup decrypt failure', async () => {
  const storage = memoryStorage();
  const keys = memoryKeyStore();
  const writer = persistence(storage, keys);
  const originalState = createDefaultState();
  originalState.profile.fields.fullName = 'Original encrypted draft';
  await writer.save(originalState);
  const original = storage.getItem(STORAGE_KEY);
  const replacementKey = await webcrypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  await keys.write(replacementKey);

  const afterLoadFailure = persistence(storage, keys);
  await assert.rejects(() => afterLoadFailure.load(), (error) => error.code === 'decrypt-failed');
  const editedDefault = createDefaultState();
  editedDefault.profile.fields.fullName = 'Do not overwrite original';
  await assert.rejects(() => afterLoadFailure.save(editedDefault), (error) => error.code === 'decrypt-failed');
  assert.equal(storage.getItem(STORAGE_KEY), original);
});

test('startup recovery does not clear a newer draft that replaces the unreadable envelope during decryption', async () => {
  const storage = memoryStorage();
  const keys = controllableKeyStore();
  const draftStorage = persistence(storage, keys);
  const unreadableState = createDefaultState();
  unreadableState.profile.fields.fullName = 'Unreadable draft';
  await draftStorage.save(unreadableState);

  const newestKey = await webcrypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  const newestStorage = memoryStorage();
  const newestState = createDefaultState();
  newestState.profile.fields.fullName = 'Newest draft';
  await persistence(newestStorage, controllableKeyStore(newestKey)).save(newestState);
  const newestEnvelope = newestStorage.getItem(STORAGE_KEY);

  keys.runBeforeNextRead(async () => {
    storage.setItem(STORAGE_KEY, newestEnvelope);
    keys.replace(newestKey);
  });

  const result = await draftStorage.loadAndRecoverUnreadableDraft();
  assert.equal(result.recovered, false);
  assert.equal(result.state.profile.fields.fullName, 'Newest draft');
  assert.equal(storage.getItem(STORAGE_KEY), newestEnvelope);
  assert.equal(keys.current(), newestKey);
  assert.equal(keys.removals(), 0);
  assert.equal((await draftStorage.load()).profile.fields.fullName, 'Newest draft');
});

test('startup clears only permanently unreadable drafts and returns a saveable default state', async () => {
  const legacy = JSON.stringify({ keep: 'legacy' });
  const scenarios = [
    {
      name: 'corrupt envelope',
      setup: async () => ({
        storage: memoryStorage({ [STORAGE_KEY]: '{not-json', 'resume-studio-data-v1': legacy }),
        keyStore: memoryKeyStore()
      })
    },
    {
      name: 'missing key',
      setup: async () => {
        const storage = memoryStorage({ 'resume-studio-data-v1': legacy });
        const originalKeys = memoryKeyStore();
        await persistence(storage, originalKeys).save(createDefaultState());
        return { storage, keyStore: memoryKeyStore() };
      }
    },
    {
      name: 'invalid key',
      setup: async () => {
        const storage = memoryStorage({ 'resume-studio-data-v1': legacy });
        const keyStore = memoryKeyStore();
        await persistence(storage, keyStore).save(createDefaultState());
        await keyStore.write({ type: 'secret', extractable: true, algorithm: { name: 'AES-GCM' }, usages: ['encrypt', 'decrypt'] });
        return { storage, keyStore };
      }
    },
    {
      name: 'decrypt failure',
      setup: async () => {
        const storage = memoryStorage({ 'resume-studio-data-v1': legacy });
        const keyStore = memoryKeyStore();
        await persistence(storage, keyStore).save(createDefaultState());
        await keyStore.write(await webcrypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']));
        return { storage, keyStore };
      }
    }
  ];

  for (const scenario of scenarios) {
    const { storage, keyStore } = await scenario.setup();
    const result = await persistence(storage, keyStore).loadAndRecoverUnreadableDraft();
    assert.equal(result.state, null, scenario.name);
    assert.equal(result.recovered, true, scenario.name);
    assert.equal(storage.getItem(STORAGE_KEY), null, scenario.name);
    assert.equal(storage.getItem('resume-studio-data-v1'), legacy, scenario.name);

    const defaultState = createDefaultState();
    defaultState.profile.fields.fullName = `Recovered ${scenario.name}`;
    await persistence(storage, keyStore).save(defaultState);
    assert.equal((await persistence(storage, keyStore).load()).profile.fields.fullName, `Recovered ${scenario.name}`);
  }
});

test('startup recovery preserves the draft when cleanup or the storage environment fails', async () => {
  const storage = memoryStorage({ [STORAGE_KEY]: '{not-json' });
  const keyStore = memoryKeyStore();
  keyStore.remove = async () => { throw new Error('IndexedDB failure'); };

  await assert.rejects(() => persistence(storage, keyStore).loadAndRecoverUnreadableDraft(), (error) => error.code === 'indexeddb-unavailable');
  assert.equal(storage.getItem(STORAGE_KEY), '{not-json');

  const unavailableStorage = memoryStorage({ [STORAGE_KEY]: '{not-json' });
  unavailableStorage.getItem = () => { throw new Error('site data blocked'); };
  await assert.rejects(() => persistence(unavailableStorage, memoryKeyStore()).loadAndRecoverUnreadableDraft(), (error) => error.code === 'storage-unavailable');

  const encryptedStorage = memoryStorage();
  const validKeys = memoryKeyStore();
  await persistence(encryptedStorage, validKeys).save(createDefaultState());
  const encryptedDraft = encryptedStorage.getItem(STORAGE_KEY);

  await assert.rejects(() => createDraftStorage(encryptedStorage, { crypto: {}, keyStore: validKeys }).loadAndRecoverUnreadableDraft(), (error) => error.code === 'crypto-unavailable');
  assert.equal(encryptedStorage.getItem(STORAGE_KEY), encryptedDraft);

  await assert.rejects(() => createDraftStorage(encryptedStorage, { crypto: webcrypto, indexedDB: null }).loadAndRecoverUnreadableDraft(), (error) => error.code === 'indexeddb-unavailable');
  assert.equal(encryptedStorage.getItem(STORAGE_KEY), encryptedDraft);

  let removeCalled = false;
  const unknownKeyStore = {
    async read() { throw new DraftStorageError('unexpected'); },
    async write() {},
    async remove() { removeCalled = true; }
  };
  await assert.rejects(() => createDraftStorage(encryptedStorage, { crypto: webcrypto, keyStore: unknownKeyStore }).loadAndRecoverUnreadableDraft(), (error) => error.code === 'unexpected');
  assert.equal(encryptedStorage.getItem(STORAGE_KEY), encryptedDraft);
  assert.equal(removeCalled, false);
});

test('clear keeps the encrypted draft when key deletion fails and never touches legacy storage', async () => {
  const legacy = JSON.stringify({ keep: 'legacy' });
  const storage = memoryStorage({ 'resume-studio-data-v1': legacy });
  const keys = memoryKeyStore();
  const draft = persistence(storage, keys);
  await draft.save(createDefaultState());
  const original = storage.getItem(STORAGE_KEY);
  keys.remove = async () => { throw new Error('IndexedDB failure'); };

  await assert.rejects(() => draft.remove(), (error) => error.code === 'indexeddb-unavailable');
  assert.equal(storage.getItem(STORAGE_KEY), original);
  assert.equal(storage.getItem('resume-studio-data-v1'), legacy);
});

test('legacy key remains untouched and shared profile plus locale documents survive encrypted persistence', async () => {
  const legacy = JSON.stringify({ fields: { fullName: 'Do not read' } });
  const storage = memoryStorage({ 'resume-studio-data-v1': legacy });
  const keyStore = memoryKeyStore();
  const state = createDefaultState('zh-CN');
  state.profile.fields.fullName = 'Shared Profile';
  state.documents.ja.fields.motivation = 'Japanese only';
  state.documents['zh-CN'].resume.summary = 'Chinese only';
  state.documents.en.resume.summary = 'English only';

  await persistence(storage, keyStore).save(state);
  const restored = await persistence(storage, keyStore).load();
  assert.equal(storage.getItem('resume-studio-data-v1'), legacy);
  assert.equal(restored.profile.fields.fullName, 'Shared Profile');
  assert.equal(restored.documents.ja.fields.motivation, 'Japanese only');
  assert.equal(restored.documents['zh-CN'].resume.summary, 'Chinese only');
  assert.equal(restored.documents.en.resume.summary, 'English only');
});

test('queued saves preserve the most recent page-lifecycle snapshot', async () => {
  const storage = memoryStorage();
  const draftStorage = persistence(storage);
  const first = createDefaultState();
  first.profile.fields.fullName = 'Before pagehide';
  const last = createDefaultState();
  last.profile.fields.fullName = 'At pagehide';

  const firstWrite = draftStorage.save(first);
  const finalWrite = draftStorage.save(last);
  await Promise.all([firstWrite, finalWrite]);
  assert.equal((await draftStorage.load()).profile.fields.fullName, 'At pagehide');
});

test('all cooperating instances share the fixed Web Lock and reject an old memory snapshot', async () => {
  const storage = memoryStorage();
  const keyStore = memoryKeyStore();
  const lockEvents = [];
  const locks = sharedLockManager(lockEvents);
  const first = persistence(storage, keyStore, { locks });
  const second = persistence(storage, keyStore, { locks });
  const initial = createDefaultState();
  await first.save(initial);
  await second.load();

  const newest = createDefaultState();
  newest.profile.fields.fullName = 'Newest cooperating draft';
  await first.save(newest);
  const stale = createDefaultState();
  stale.profile.fields.fullName = 'Stale cooperating draft';
  await assert.rejects(() => second.save(stale), (error) => error.code === 'storage-changed');

  assert.equal((await first.load()).profile.fields.fullName, 'Newest cooperating draft');
  assert.ok(lockEvents.length >= 5);
  assert.ok(lockEvents.every((name) => name === DRAFT_WEB_LOCK_NAME));
});

test('a fresh instance cannot overwrite an existing draft before it has established a raw baseline', async () => {
  const storage = memoryStorage();
  const keyStore = memoryKeyStore();
  const locks = sharedLockManager();
  const writer = persistence(storage, keyStore, { locks });
  await writer.save(createDefaultState());

  const uninitialized = persistence(storage, keyStore, { locks });
  await assert.rejects(() => uninitialized.save(createDefaultState()), (error) => error.code === 'storage-changed');
  await assert.rejects(() => uninitialized.remove(), (error) => error.code === 'storage-changed');
  assert.notEqual(storage.getItem(STORAGE_KEY), null);
});

test('B0 plaintext and encrypted drafts migrate under the lock without replacing an existing key', async () => {
  const makeBootstrap = () => {
    const state = createDefaultState('en');
    delete state.schemaRevision;
    state.profile.fields.fullName = 'Bootstrap draft';
    return state;
  };
  const plaintextStorage = memoryStorage({ [STORAGE_KEY]: JSON.stringify(makeBootstrap()) });
  const plaintext = persistence(plaintextStorage, memoryKeyStore(), { locks: sharedLockManager() });
  assert.equal((await plaintext.load()).schemaRevision, 1);
  assert.equal(JSON.parse(plaintextStorage.getItem(STORAGE_KEY)).format, ENCRYPTED_DRAFT_FORMAT);

  const key = await webcrypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  const keys = controllableKeyStore(key);
  const encryptedStorage = memoryStorage({ [STORAGE_KEY]: await encryptUnsupportedState(makeBootstrap(), key) });
  const encrypted = persistence(encryptedStorage, keys, { locks: sharedLockManager() });
  assert.equal((await encrypted.load()).schemaRevision, 1);
  assert.equal(keys.current(), key);
  assert.equal(keys.removals(), 0);
});

test('future drafts remain protected from save and clear, and missing Web Locks stop mutation', async () => {
  const storage = memoryStorage();
  const keys = controllableKeyStore();
  const writer = persistence(storage, keys, { locks: sharedLockManager() });
  await writer.save(createDefaultState());
  const key = keys.current();
  const future = createDefaultState();
  future.schemaRevision = 2;
  const raw = await encryptUnsupportedState(future, key);
  storage.setItem(STORAGE_KEY, raw);

  const protectedDraft = persistence(storage, keys, { locks: sharedLockManager() });
  await assert.rejects(() => protectedDraft.load(), (error) => error.code === 'future-state');
  await assert.rejects(() => protectedDraft.save(createDefaultState()), (error) => error.code === 'future-state');
  await assert.rejects(() => protectedDraft.remove(), (error) => error.code === 'future-state');
  assert.equal(storage.getItem(STORAGE_KEY), raw);
  assert.equal(keys.current(), key);

  const unlocked = persistence(memoryStorage(), memoryKeyStore(), { locks: null });
  await assert.rejects(() => unlocked.save(createDefaultState()), (error) => error.code === 'web-lock-unavailable');
  await assert.rejects(() => unlocked.remove(), (error) => error.code === 'web-lock-unavailable');
});
