import { createDefaultState, cloneData } from './defaults.js';
import {
  hasStoredState,
  loadStoredState,
  persistState,
  removeStoredState
} from './storage.js';
import { assertValidState } from './schema.js';

export function createStore({ storage, initialState }) {
  let state = cloneData(assertValidState(initialState));
  const listeners = new Set();

  function notify(type) {
    listeners.forEach((listener) => {
      listener(state, { type });
    });
  }

  function replace(nextState, { persist = false, type = 'replace' } = {}) {
    const next = cloneData(assertValidState(nextState));
    if (persist) persistState(storage, next);
    state = next;
    notify(type);
    return state;
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
      persistState(storage, state);
      notify('save');
    },
    reload() {
      const stored = loadStoredState(storage);
      if (!stored) return false;
      replace(stored, { type: 'reload' });
      return true;
    },
    reset() {
      replace(createDefaultState(), { type: 'reset' });
    },
    clearPersisted() {
      removeStoredState(storage);
      notify('clear');
    },
    hasStoredState() {
      return hasStoredState(storage);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };
}
