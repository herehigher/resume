import { STORAGE_KEY } from '../config.js';
import { assertValidState, validateState } from './schema.js';

export function loadStoredState(storage) {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return validateState(parsed).valid ? parsed : null;
  } catch {
    return null;
  }
}

export function hasStoredState(storage) {
  try {
    return storage.getItem(STORAGE_KEY) !== null;
  } catch {
    return false;
  }
}

export function persistState(storage, state) {
  assertValidState(state);
  storage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function removeStoredState(storage) {
  storage.removeItem(STORAGE_KEY);
}
