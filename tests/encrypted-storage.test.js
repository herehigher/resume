import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';

import { STORAGE_KEY } from '../site/assets/js/config.js';
import { createDefaultState } from '../site/assets/js/state/defaults.js';
import { createDraftStorage, DraftStorageError, ENCRYPTED_DRAFT_ALGORITHM, ENCRYPTED_DRAFT_FORMAT } from '../site/assets/js/state/storage.js';

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

function persistence(storage, keyStore = memoryKeyStore(), options = {}) {
  return createDraftStorage(storage, { crypto: webcrypto, keyStore, ...options });
}

test('draft ciphertext contains no fixture name or email and reload restores it', async () => {
  const storage = memoryStorage();
  const keyStore = memoryKeyStore();
  const saved = createDefaultState('en');
  saved.profile.fields.fullName = 'Ciphertext Fixture';
  saved.profile.fields.email = 'ciphertext.fixture@example.test';
  const writer = persistence(storage, keyStore);

  await writer.save(saved);
  const raw = storage.getItem(STORAGE_KEY);
  assert.doesNotMatch(raw, /Ciphertext Fixture|ciphertext\.fixture@example\.test/);
  assert.deepEqual(JSON.parse(raw).format, ENCRYPTED_DRAFT_FORMAT);
  assert.deepEqual(JSON.parse(raw).algorithm, ENCRYPTED_DRAFT_ALGORITHM);
  assert.equal((await persistence(storage, keyStore).load()).profile.fields.fullName, 'Ciphertext Fixture');
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
