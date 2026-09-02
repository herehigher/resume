import { createDefaultState, cloneData } from './defaults.js';
import { createDraftStorage, parseImportedState, serializeState } from './storage.js';
import { assertValidState } from './schema.js';

export function createStore({ storage, initialState, persistence = createDraftStorage(storage), hasStoredState = false }) {
  let state = cloneData(assertValidState(initialState));
  let stored = hasStoredState;
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
      notify(type);
      return state;
    }
    return persistence.save(next).then(() => {
      state = next;
      stored = true;
      notify(type);
      return state;
    });
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
    save() {
      const snapshot = cloneData(state);
      return persistence.save(snapshot).then(() => {
        stored = true;
        notify('save');
      });
    },
    async reload() {
      const next = await persistence.load();
      if (!next) return false;
      state = cloneData(next);
      stored = true;
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
