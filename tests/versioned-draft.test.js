import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import test from 'node:test';

import { loadVersionedDraft } from '../site/assets/js/state/versioned-draft.js';
import { createDraftStorage } from '../site/assets/js/state/storage.js';
import { createV3Fixture } from './fixtures/resume-studio-web-v3.js';

function memoryStorage({ failSetKey = '', onSet } = {}) {
  const values = new Map();
  return {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) {
      if (key === failSetKey) throw new Error('fictional save failure');
      values.set(key, String(value));
      onSet?.(key, String(value));
    },
    removeItem(key) { values.delete(key); }
  };
}

function memoryKeyStore() {
  let key = null;
  let removes = 0;
  return {
    async read() { return key; },
    async write(next) { key = next; },
    async remove() { key = null; removes += 1; },
    get removes() { return removes; }
  };
}

function persistence(storage, storageKey, { keyStore = memoryKeyStore(), locks } = {}) {
  return createDraftStorage(storage, {
    crypto: webcrypto,
    keyStore,
    locks: locks || { request: async (_name, _options, callback) => callback() },
    storageKey,
    keyDatabase: `${storageKey}-keys`,
    lockName: `${storageKey}:draft`
  });
}

function fakePersistence({ state = null, recovered = false, loadError = null, saveError = null, removeError = null, pendingMutation = null, events = [] } = {}) {
  const saves = [];
  let removes = 0;
  return {
    saves,
    get removes() { return removes; },
    async loadAndRecoverUnreadableDraft() { return { state, recovered }; },
    async loadReadOnly() {
      if (loadError) throw loadError;
      events.push('source-read');
      return state;
    },
    async save(next) {
      events.push('current-save');
      if (saveError) throw saveError;
      saves.push(next);
    },
    async remove() {
      events.push('source-remove');
      if (removeError) throw removeError;
      removes += 1;
    },
    getLastLoadResult() { return state ? { status: 'current' } : null; },
    getPendingMutation() { return pendingMutation; }
  };
}

test('startup touches only the current namespace when no compatible keys are configured', async () => {
  const current = fakePersistence();
  const requested = [];
  const result = await loadVersionedDraft(null, {
    currentPersistence: current,
    currentStorageKey: 'resume-studio-web-v2',
    compatibleStorageKeys: [],
    persistenceForKey(storageKey) {
      requested.push(storageKey);
      throw new Error('No legacy namespace should be requested.');
    }
  });

  assert.equal(result.state, null);
  assert.deepEqual(requested, []);
  assert.deepEqual(current.saves, []);
});

test('a configured compatible namespace is copied forward and removed only after the new save succeeds', async () => {
  const migratedState = { version: 4, marker: 'fictional-compatible-draft' };
  const events = [];
  const current = fakePersistence({ events });
  const compatible = fakePersistence({ state: migratedState, pendingMutation: 'migrate-draft', events });
  const requests = [];

  const result = await loadVersionedDraft(null, {
    currentPersistence: current,
    currentStorageKey: 'resume-studio-web-v4',
    compatibleStorageKeys: ['resume-studio-web-v3'],
    persistenceForKey(storageKey) {
      requests.push(storageKey);
      return compatible;
    }
  });

  assert.equal(result.state, migratedState);
  assert.deepEqual(result.loadResult, { status: 'migrated' });
  assert.deepEqual(requests, ['resume-studio-web-v3']);
  assert.deepEqual(current.saves, [migratedState]);
  assert.deepEqual(compatible.saves, []);
  assert.equal(compatible.removes, 1);
  assert.deepEqual(events, ['source-read', 'current-save', 'source-remove']);
});

test('a literal v3 draft migrates through the v3 key, then removes its raw and key only after v4 is durable', async () => {
  const storage = memoryStorage();
  const sourceKey = 'resume-studio-web-v3';
  const currentKey = 'resume-studio-web-v4';
  const sourceKeyStore = memoryKeyStore();
  storage.setItem(sourceKey, JSON.stringify(createV3Fixture()));
  const source = persistence(storage, sourceKey, { keyStore: sourceKeyStore });
  const current = persistence(storage, currentKey);

  const result = await loadVersionedDraft(storage, {
    currentPersistence: current,
    currentStorageKey: currentKey,
    compatibleStorageKeys: [sourceKey],
    persistenceForKey: () => source
  });

  assert.equal(result.state.version, 4);
  assert.ok(result.state.documents.en.resume.experience[0].id.startsWith('record_'));
  assert.deepEqual(result.state.settings.pageBreaks.en.A4.resume, { sections: ['projects'], records: [] });
  assert.equal(storage.getItem(sourceKey), null);
  assert.equal(sourceKeyStore.removes, 1);
  assert.equal(JSON.parse(storage.getItem(currentKey)).format, 'resume-studio-local-encrypted-v1');
});

test('a v4 save failure after a real v3 read retains the v3 raw and key', async () => {
  const sourceKey = 'resume-studio-web-v3';
  const currentKey = 'resume-studio-web-v4';
  const storage = memoryStorage({ failSetKey: currentKey });
  const sourceKeyStore = memoryKeyStore();
  const raw = JSON.stringify(createV3Fixture());
  storage.setItem(sourceKey, raw);
  const source = persistence(storage, sourceKey, { keyStore: sourceKeyStore });
  const current = persistence(storage, currentKey);

  await assert.rejects(() => loadVersionedDraft(storage, {
    currentPersistence: current,
    currentStorageKey: currentKey,
    compatibleStorageKeys: [sourceKey],
    persistenceForKey: () => source
  }), (error) => error.code === 'storage-unavailable');

  assert.equal(storage.getItem(sourceKey), raw);
  assert.equal(sourceKeyStore.removes, 0);
  assert.equal(storage.getItem(currentKey), null);
});

test('a changed v3 source is retained when cleanup detects a conflict after the v4 save', async () => {
  const sourceKey = 'resume-studio-web-v3';
  const currentKey = 'resume-studio-web-v4';
  const raw = JSON.stringify(createV3Fixture());
  const changedRaw = `${raw} `;
  const storage = memoryStorage({ onSet(key) { if (key === currentKey) storage.setItem(sourceKey, changedRaw); } });
  const sourceKeyStore = memoryKeyStore();
  storage.setItem(sourceKey, raw);
  const source = persistence(storage, sourceKey, { keyStore: sourceKeyStore });
  const current = persistence(storage, currentKey);

  const result = await loadVersionedDraft(storage, {
    currentPersistence: current,
    currentStorageKey: currentKey,
    compatibleStorageKeys: [sourceKey],
    persistenceForKey: () => source
  });

  assert.equal(result.loadResult.status, 'migration-incomplete');
  assert.equal(result.sourceRemoved, false);
  assert.equal(storage.getItem(sourceKey), changedRaw);
  assert.equal(sourceKeyStore.removes, 0);
  assert.notEqual(storage.getItem(currentKey), null);
});

test('a Web Locks read-only fallback cannot remove a real v3 source before v4 saves', async () => {
  const sourceKey = 'resume-studio-web-v3';
  const currentKey = 'resume-studio-web-v4';
  const storage = memoryStorage();
  const sourceKeyStore = memoryKeyStore();
  const raw = JSON.stringify(createV3Fixture());
  storage.setItem(sourceKey, raw);
  const source = persistence(storage, sourceKey, { keyStore: sourceKeyStore });
  const current = persistence(storage, currentKey, { locks: { async request() { throw new Error('fictional lock rejection'); } } });

  await assert.rejects(() => loadVersionedDraft(storage, {
    currentPersistence: current,
    currentStorageKey: currentKey,
    compatibleStorageKeys: [sourceKey],
    persistenceForKey: () => source
  }), (error) => error.code === 'web-lock-unavailable');

  assert.equal(storage.getItem(sourceKey), raw);
  assert.equal(sourceKeyStore.removes, 0);
  assert.equal(storage.getItem(currentKey), null);
});

test('a failed current save never removes the compatible source namespace', async () => {
  const current = fakePersistence({ saveError: new Error('save failed') });
  const compatible = fakePersistence({ state: { version: 4 } });

  await assert.rejects(() => loadVersionedDraft(null, {
    currentPersistence: current,
    currentStorageKey: 'resume-studio-web-v4',
    compatibleStorageKeys: ['resume-studio-web-v3'],
    persistenceForKey: () => compatible
  }), /save failed/);

  assert.equal(compatible.removes, 0);
});

test('a compatible source is retained and not reported as migrated when cleanup fails', async () => {
  const migratedState = { version: 4, marker: 'fictional-compatible-draft' };
  const current = fakePersistence();
  const compatible = fakePersistence({
    state: migratedState,
    removeError: new Error('source changed after the read')
  });

  const result = await loadVersionedDraft(null, {
    currentPersistence: current,
    currentStorageKey: 'resume-studio-web-v4',
    compatibleStorageKeys: ['resume-studio-web-v3'],
    persistenceForKey: () => compatible
  });

  assert.equal(result.state, migratedState);
  assert.equal(result.sourceRemoved, false);
  assert.deepEqual(result.loadResult, { status: 'migration-incomplete' });
  assert.deepEqual(current.saves, [migratedState]);
  assert.equal(compatible.removes, 0);
});

test('listed but unsupported or too-old namespaces are ignored without blocking a new draft', async () => {
  const current = fakePersistence();
  const unsupported = fakePersistence({ loadError: new Error('unsupported') });
  const tooOld = fakePersistence({ state: { marker: 'must-not-copy' }, pendingMutation: 'replace-too-old-draft' });
  const sources = new Map([
    ['resume-studio-web-v1', unsupported],
    ['resume-studio-web-v0', tooOld]
  ]);

  const result = await loadVersionedDraft(null, {
    currentPersistence: current,
    currentStorageKey: 'resume-studio-web-v2',
    compatibleStorageKeys: [...sources.keys()],
    persistenceForKey(storageKey) {
      return sources.get(storageKey);
    }
  });

  assert.equal(result.state, null);
  assert.deepEqual(current.saves, []);
  assert.deepEqual(unsupported.saves, []);
  assert.deepEqual(tooOld.saves, []);
  assert.equal(unsupported.removes, 0);
  assert.equal(tooOld.removes, 0);
});
