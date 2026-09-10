import assert from 'node:assert/strict';
import test from 'node:test';

import { loadVersionedDraft } from '../site/assets/js/state/versioned-draft.js';

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
  const migratedState = { version: 3, marker: 'fictional-compatible-draft' };
  const events = [];
  const current = fakePersistence({ events });
  const compatible = fakePersistence({ state: migratedState, pendingMutation: 'migrate-draft', events });
  const requests = [];

  const result = await loadVersionedDraft(null, {
    currentPersistence: current,
    currentStorageKey: 'resume-studio-web-v3',
    compatibleStorageKeys: ['resume-studio-web-v2'],
    persistenceForKey(storageKey) {
      requests.push(storageKey);
      return compatible;
    }
  });

  assert.equal(result.state, migratedState);
  assert.deepEqual(result.loadResult, { status: 'migrated' });
  assert.deepEqual(requests, ['resume-studio-web-v2']);
  assert.deepEqual(current.saves, [migratedState]);
  assert.deepEqual(compatible.saves, []);
  assert.equal(compatible.removes, 1);
  assert.deepEqual(events, ['source-read', 'current-save', 'source-remove']);
});

test('a failed current save never removes the compatible source namespace', async () => {
  const current = fakePersistence({ saveError: new Error('save failed') });
  const compatible = fakePersistence({ state: { version: 3 } });

  await assert.rejects(() => loadVersionedDraft(null, {
    currentPersistence: current,
    currentStorageKey: 'resume-studio-web-v3',
    compatibleStorageKeys: ['resume-studio-web-v2'],
    persistenceForKey: () => compatible
  }), /save failed/);

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
