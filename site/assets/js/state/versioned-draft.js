import { COMPATIBLE_DRAFT_STORAGE_KEYS, STORAGE_KEY } from '../config.js';
import { createDraftStorage } from './storage.js';

function createPersistenceForKey(storage, storageKey) {
  return createDraftStorage(storage, {
    storageKey,
    keyDatabase: `${storageKey}-keys`,
    lockName: `${storageKey}:draft`
  });
}

export async function loadVersionedDraft(storage, {
  currentPersistence,
  currentStorageKey = STORAGE_KEY,
  compatibleStorageKeys = COMPATIBLE_DRAFT_STORAGE_KEYS,
  persistenceForKey = (storageKey) => createPersistenceForKey(storage, storageKey)
} = {}) {
  const persistence = currentPersistence || persistenceForKey(currentStorageKey);
  const current = await persistence.loadAndRecoverUnreadableDraft();
  if (current.state || current.recovered) {
    return { ...current, loadResult: persistence.getLastLoadResult() };
  }

  for (const storageKey of compatibleStorageKeys) {
    if (storageKey === currentStorageKey) continue;
    let sourceState;
    let source;
    try {
      source = persistenceForKey(storageKey);
      sourceState = await source.loadReadOnly();
      if (source.getPendingMutation() === 'replace-too-old-draft') continue;
    } catch {
      // Unsupported, unreadable, and out-of-range namespaces are deliberately ignored.
      continue;
    }
    if (!sourceState) continue;
    await persistence.save(sourceState);
    let sourceRemoved = true;
    try {
      await source.remove();
    } catch {
      // The new namespace is already durable. A changed or unavailable old
      // namespace is retained rather than making the editor unusable.
      sourceRemoved = false;
    }
    return {
      state: sourceState,
      recovered: false,
      loadResult: { status: sourceRemoved ? 'migrated' : 'migration-incomplete' },
      sourceRemoved
    };
  }

  return { ...current, loadResult: null };
}
