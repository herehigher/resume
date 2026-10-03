import { createDefaultState, cloneData } from './defaults.js';
import { createDraftStorage, parseImportedState, prepareImportedState, serializeState } from './storage.js';
import { assertValidState } from './schema.js';
import { applyListReorder } from './list-order.js';

export function createStore({ storage, initialState, persistence = createDraftStorage(storage), hasStoredState = false }) {
  let state = cloneData(assertValidState(initialState));
  let stored = hasStoredState;
  let importPending = false;
  let saveRequestVersion = 0;
  let draftRevision = 0;
  const listeners = new Set();

  function notify(type, details = {}) {
    listeners.forEach((listener) => {
      listener(state, Object.freeze({ ...details, type }));
    });
  }

  function replace(nextState, { persist = false, type = 'replace', eventDetails } = {}) {
    const next = cloneData(assertValidState(nextState));
    if (!persist) {
      // Display locale is saved independently; only a verified locale-only update
      // may keep an in-flight draft save current.
      const localeOnly = type === 'locale' && JSON.stringify(next) === JSON.stringify({
        ...state, settings: { ...state.settings, locale: next.settings.locale }
      });
      if (!localeOnly) draftRevision += 1;
      state = next;
      notify(type, eventDetails);
      return state;
    }
    return persistence.save(next).then(() => {
      draftRevision += 1;
      state = next;
      stored = true;
      notify(type, eventDetails);
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
    getDraftRevision() {
      return draftRevision;
    },
    update(mutator, { persist = false, type = 'update' } = {}) {
      const next = cloneData(state);
      mutator(next);
      return replace(next, { persist, type });
    },
    reorderList(target, operation) {
      const next = cloneData(state);
      const permutation = applyListReorder(next, target, operation);
      if (!permutation) return false;
      const eventTarget = Object.freeze(target.key === 'ja.careerDetails'
        ? { key: target.key, careerId: target.careerId } : { key: target.key });
      const eventOperation = Object.freeze(operation.type === 'move'
        ? { type: 'move', from: operation.from, to: operation.to } : { type: 'sort', direction: operation.direction });
      replace(next, { type: 'reorder', eventDetails: { target: eventTarget, operation: eventOperation, permutation: Object.freeze(permutation) } });
      return true;
    },
    replace,
    prepareImport(text) {
      const prepared = prepareImportedState(text);
      importPending = true;
      notify('import-pending');
      return prepared;
    },
    cancelImport() {
      completeImport('import-cancel');
    },
    async importPrepared(prepared) {
      if (!prepared?.state) throw new TypeError('A prepared import is required.');
      const next = cloneData(assertValidState(prepared.state));
      let completion = 'import-failed';
      try {
        await persistence.save(next);
        draftRevision += 1;
        state = next;
        stored = true;
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
      const savedRevision = draftRevision;
      const requestVersion = ++saveRequestVersion;
      const snapshot = cloneData(state);
      return persistence.save(snapshot).then(() => {
        stored = true;
        // Persistence of an older snapshot does not mean the current draft is saved.
        if (draftRevision !== savedRevision || requestVersion !== saveRequestVersion) return false;
        notify('save');
        return true;
      });
    },
    async reload() {
      const next = await persistence.load();
      if (!next) return false;
      draftRevision += 1;
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
      draftRevision += 1;
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
