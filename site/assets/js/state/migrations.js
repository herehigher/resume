import { STATE_VERSION } from '../config.js';
import { validateCurrentState } from './schema.js';

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function copy(value) {
  return JSON.parse(JSON.stringify(value));
}

function validVersion(value) {
  return Number.isSafeInteger(value) && value > 0;
}

export function preferValidValue(newValue, oldValue, isValid, fallback) {
  if (isValid(newValue)) return newValue;
  if (isValid(oldValue)) return oldValue;
  return fallback;
}

export function mapValidArray(value, mapItem, fallback = []) {
  if (!Array.isArray(value)) return fallback;
  const result = [];
  value.forEach((item, index) => {
    const mapped = mapItem(item, index);
    if (mapped !== null && mapped !== undefined) result.push(mapped);
  });
  return result;
}

const V2_GENDER_VALUES = new Map([
  ['男性', 'male'], ['男', 'male'], ['Male', 'male'],
  ['女性', 'female'], ['女', 'female'], ['Female', 'female'],
  ['その他', 'other'], ['其他', 'other'], ['Other', 'other'],
  ['', '']
]);

function migrateV2Gender(value) {
  return V2_GENDER_VALUES.has(value) ? V2_GENDER_VALUES.get(value) : '';
}

function migrateV2ToV3(source) {
  const state = copy(source);
  const fields = state.profile?.fields;
  const resume = state.documents?.en?.resume;
  if (!isObject(fields) || !isObject(resume)) return { state: { ...state, version: 3 } };

  const gender = migrateV2Gender(fields.gender);
  return {
    salvaged: typeof fields.gender === 'string' && fields.gender !== '' && gender === '',
    state: {
      ...state,
      version: 3,
      profile: {
        ...state.profile,
        fields: { ...fields, gender, nationality: '' }
      },
      documents: {
        ...state.documents,
        en: {
          ...state.documents.en,
          resume: { ...resume, showOptionalPersonalDetails: false }
        }
      }
    }
  };
}

// Add only explicit, sequential version migrations. Version 1 is intentionally
// unsupported because there are no production users whose drafts require it.
export const MIGRATION_REGISTRY = Object.freeze([
  Object.freeze({
    from: 2,
    to: 3,
    summary: 'Normalize gender and add nationality and English optional-detail defaults.',
    migrate: migrateV2ToV3
  })
]);

export function createMigrationRunner({
  currentVersion = STATE_VERSION,
  registry = MIGRATION_REGISTRY,
  validateCurrent = validateCurrentState,
  compatibilityWindow = 3
} = {}) {
  const numberedSteps = registry.filter((step) => validVersion(step?.from) && validVersion(step?.to));
  const minimumVersion = Math.max(1, currentVersion - compatibilityWindow);

  function rejected(status, reason) {
    return { status, reason };
  }

  return function migrate(value) {
    if (!isObject(value) || !validVersion(value.version)) return rejected('unsupported', 'invalid-version');
    if (value.version > currentVersion) return rejected('future', 'future-version');
    if (value.version < minimumVersion) return rejected('too-old', 'version-window-expired');
    if (value.version === currentVersion) {
      const validation = validateCurrent(value);
      return validation.valid ? { status: 'current', state: value } : rejected('unsupported', 'current-validation-failed');
    }

    let state = copy(value);
    let version = state.version;
    let salvaged = false;
    while (version < currentVersion) {
      const step = numberedSteps.find((candidate) => candidate.from === version && candidate.to === version + 1);
      if (!step) return rejected('unsupported', 'migration-step-missing');
      try {
        const result = step.migrate(state);
        state = result?.state || result;
        salvaged ||= result?.salvaged === true;
        if (!isObject(state) || state.version !== step.to) return rejected('unsupported', 'migration-step-invalid');
        version = state.version;
      } catch {
        return rejected('unsupported', 'migration-failed');
      }
    }

    const validation = validateCurrent(state);
    return validation.valid
      ? { status: salvaged ? 'salvaged' : 'migrated', state }
      : rejected('unsupported', 'final-validation-failed');
  };
}

export const migrateState = createMigrationRunner();
