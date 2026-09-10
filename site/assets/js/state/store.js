import { createDefaultState, cloneData } from './defaults.js';
import { createDraftStorage, DraftStorageError, parseImportedState, prepareImportedState, serializeState } from './storage.js';
import { assertValidState } from './schema.js';

export function createStore({ storage, initialState, persistence = createDraftStorage(storage), hasStoredState = false }) {
  let state = cloneData(assertValidState(initialState));
  let stored = hasStoredState;
  let revision = 0;
  let importPending = false;
  let storageOutOfSync = false;
  const listeners = new Set();

  function notify(type) {
    listeners.forEach((listener) => {
      listener(state, { type });
    });
  }

  function replace(nextState, { persist = false, type = 'replace' } = {}) {
    const next = cloneData(assertValidState(nextState));
    if (!persist) {
      state = next;
      revision += 1;
      notify(type);
      return state;
    }
    return persistence.save(next).then(() => {
      state = next;
      stored = true;
      revision += 1;
      notify(type);
      return state;
    });
  }

  function completeImport(type) {
    if (!importPending) return;
    importPending = false;
    notify(type);
  }

  return {
    getState() {
      return state;
    },
    update(mutator, { persist = false, type = 'update' } = {}) {
      const next = cloneData(state);
      mutator(next);
      return replace(next, { persist, type });
    },
    replace,
    prepareImport(text) {
      const prepared = prepareImportedState(text);
      importPending = true;
      notify('import-pending');
      return { ...prepared, revision };
    },
    cancelImport() {
      completeImport('import-cancel');
    },
    async importPrepared(prepared) {
      if (!prepared?.state || !Number.isSafeInteger(prepared.revision)) throw new TypeError('A prepared import is required.');
      if (!importPending || prepared.revision !== revision) {
        completeImport('import-conflict');
        const error = new Error('The draft changed while import confirmation was open.');
        error.code = 'state-changed';
        throw error;
      }
      const next = cloneData(assertValidState(prepared.state));
      let completion = 'import-failed';
      try {
        await persistence.save(next);
        if (prepared.revision !== revision) {
          storageOutOfSync = true;
          completion = 'import-conflict';
          throw new DraftStorageError('storage-changed');
        }
        state = next;
        stored = true;
        storageOutOfSync = false;
        revision += 1;
        completion = 'import';
        return state;
      } finally {
        completeImport(completion);
      }
    },
    isImportPending() {
      return importPending;
    },
    save() {
      if (storageOutOfSync) return Promise.reject(new DraftStorageError('storage-changed'));
      const snapshot = cloneData(state);
      return persistence.save(snapshot).then(() => {
        stored = true;
        notify('save');
      });
    },
    async reload() {
      // A reload begun while an import is saving must invalidate that import
      // before either asynchronous operation can replace in-memory state.
      revision += 1;
      const next = await persistence.load();
      if (!next) return false;
      state = cloneData(next);
      stored = true;
      storageOutOfSync = false;
      notify('reload');
      return true;
    },
    reset(locale = state.settings.locale) {
      replace(createDefaultState(locale), { type: 'reset' });
    },
    async clearPersisted() {
      await persistence.remove();
      stored = false;
      notify('clear');
    },
    hasStoredState() {
      return stored;
    },
    exportJson() {
      return serializeState(state);
    },
    importJson(text) {
      const imported = parseImportedState(text);
      return replace(imported, { persist: true, type: 'import' });
    },
    flush() { return persistence.flush(); },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };
}
