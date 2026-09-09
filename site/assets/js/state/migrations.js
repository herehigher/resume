import { CURRENT_SCHEMA_REVISION, STATE_VERSION } from '../config.js';
import { validateCurrentState } from './schema.js';

const OWN = Object.prototype.hasOwnProperty;
const B0_VERSION = 1;
const B0_LOCALES = Object.freeze(['ja', 'zh-CN', 'en']);
const B0_PAGE_SIZES = Object.freeze(['A4', 'LETTER']);
const JAPANESE_FIELDS = ['nameKana', 'addressKana', 'createdDate', 'motivation', 'requests', 'careerSummary', 'skills', 'selfPromotion'];
const PROFILE_FIELDS = ['fullName', 'birthDate', 'gender', 'postalCode', 'address', 'phone', 'email'];
const B0_PAGE_BREAK_TARGETS = Object.freeze({
  ja: Object.freeze({ resume: ['history', 'qualifications', 'motivation', 'requests'], career: ['summary', 'skills', 'career-history', 'self-promotion'] }),
  'zh-CN': Object.freeze({ resume: ['summary', 'experience', 'projects', 'education', 'skills', 'certifications'] }),
  en: Object.freeze({ resume: ['summary', 'experience', 'projects', 'education', 'skills', 'certifications'] })
});

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasExactKeys(value, keys) {
  return isObject(value)
    && Object.keys(value).length === keys.length
    && keys.every((key) => OWN.call(value, key));
}

function hasStringFields(value, keys) {
  return hasExactKeys(value, keys) && keys.every((key) => typeof value[key] === 'string');
}

function hasRequiredStringFields(value, keys) {
  return isObject(value) && keys.every((key) => OWN.call(value, key) && typeof value[key] === 'string');
}

function hasStringArray(value, maximum = Infinity) {
  return Array.isArray(value) && value.length <= maximum && value.every((item) => typeof item === 'string');
}

function hasEntries(value, keys) {
  return Array.isArray(value) && value.every((item) => hasStringFields(item, keys));
}

function hasPageBreaks(value) {
  if (!hasExactKeys(value, B0_LOCALES)) return false;
  return B0_LOCALES.every((locale) => {
    const documentTargets = B0_PAGE_BREAK_TARGETS[locale];
    if (!hasExactKeys(value[locale], B0_PAGE_SIZES)) return false;
    return B0_PAGE_SIZES.every((paper) => {
      const byDocument = value[locale][paper];
      if (!hasExactKeys(byDocument, Object.keys(documentTargets))) return false;
      return Object.entries(documentTargets).every(([documentType, allowed]) => {
        const targets = byDocument[documentType];
        return hasStringArray(targets, allowed.length)
          && new Set(targets).size === targets.length
          && targets.every((target) => allowed.includes(target));
      });
    });
  });
}

function hasProfile(value) {
  return hasExactKeys(value, ['photo', 'fields'])
    && typeof value.photo === 'string'
    && (!value.photo || /^data:image\/(?:jpeg|png|webp);base64,/i.test(value.photo))
    && hasExactKeys(value.fields, [...PROFILE_FIELDS, 'links'])
    && PROFILE_FIELDS.every((key) => typeof value.fields[key] === 'string')
    && hasStringArray(value.fields.links, 3);
}

function hasJapaneseDocument(value) {
  return hasExactKeys(value, ['activeDocument', 'fields', 'education', 'employment', 'qualification', 'careers'])
    && ['resume', 'career'].includes(value.activeDocument)
    && hasStringFields(value.fields, JAPANESE_FIELDS)
    && hasEntries(value.education, ['date', 'detail'])
    && hasEntries(value.employment, ['date', 'detail'])
    && hasEntries(value.qualification, ['date', 'detail', 'url'])
    && Array.isArray(value.careers)
    && value.careers.every((career) => hasRequiredStringFields(career, ['company', 'role', 'startDate', 'endDate', 'companyInfo'])
      && Array.isArray(career.detailSections)
      && Object.keys(career).length === 6
      && career.detailSections.every((section) => hasStringFields(section, ['title', 'content'])));
}

function hasInternationalDocument(value, locale) {
  const resumeFields = locale === 'en'
    ? ['headline', 'location', 'summary', 'education', 'experience', 'projects', 'skills', 'certifications']
    : ['headline', 'summary', 'education', 'experience', 'projects', 'skills', 'certifications'];
  const resume = value?.resume;
  return hasExactKeys(value, ['activeDocument', 'resume'])
    && value.activeDocument === 'resume'
    && hasExactKeys(resume, resumeFields)
    && ['headline', 'summary', 'skills'].every((key) => typeof resume[key] === 'string')
    && (locale !== 'en' || typeof resume.location === 'string')
    && hasEntries(resume.education, ['startDate', 'endDate', 'school', 'degree', 'details'])
    && hasEntries(resume.experience, ['startDate', 'endDate', 'company', 'role', 'details'])
    && hasEntries(resume.projects, ['startDate', 'endDate', 'name', 'role', 'details', 'url'])
    && hasEntries(resume.certifications, ['date', 'name', 'url']);
}

// B0 is deliberately fixed here instead of being derived from current defaults.
// It expires once R4 is introduced; see isBootstrapSupported below.
export function isBootstrapState(value) {
  return hasExactKeys(value, ['version', 'settings', 'profile', 'documents'])
    && value.version === B0_VERSION
    && !('schemaRevision' in value)
    && hasExactKeys(value.settings, ['locale', 'pageSizeByLocale', 'pageBreaks'])
    && B0_LOCALES.includes(value.settings.locale)
    && hasExactKeys(value.settings.pageSizeByLocale, B0_LOCALES)
    && B0_LOCALES.every((locale) => B0_PAGE_SIZES.includes(value.settings.pageSizeByLocale[locale]))
    && hasPageBreaks(value.settings.pageBreaks)
    && hasProfile(value.profile)
    && hasExactKeys(value.documents, B0_LOCALES)
    && hasJapaneseDocument(value.documents.ja)
    && hasInternationalDocument(value.documents['zh-CN'], 'zh-CN')
    && hasInternationalDocument(value.documents.en, 'en');
}

function copy(value) {
  return JSON.parse(JSON.stringify(value));
}

function validRevision(value) {
  return Number.isSafeInteger(value) && value > 0;
}

export function isBootstrapSupported(currentRevision = CURRENT_SCHEMA_REVISION) {
  return currentRevision >= 1 && currentRevision <= 3;
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

export const BOOTSTRAP_MIGRATION = Object.freeze({
  from: 'B0',
  to: 1,
  summary: 'Preserve the fixed B0 payload and add schemaRevision: 1.',
  migrate(value) {
    if (!isBootstrapState(value)) throw new TypeError('B0 input is required');
    const next = copy(value);
    next.schemaRevision = 1;
    return next;
  }
});

// Production has no numbered historical revisions at initial rollout.
export const MIGRATION_REGISTRY = Object.freeze([BOOTSTRAP_MIGRATION]);

export function createMigrationRunner({
  currentRevision = CURRENT_SCHEMA_REVISION,
  registry = MIGRATION_REGISTRY,
  validateCurrent = validateCurrentState,
  isBootstrap = isBootstrapState,
  bootstrapMigration = BOOTSTRAP_MIGRATION
} = {}) {
  const numberedSteps = registry.filter((step) => validRevision(step?.from) && validRevision(step?.to));
  const minimumRevision = Math.max(1, currentRevision - 3);

  function rejected(status, reason) {
    return { status, reason };
  }

  return function migrate(value) {
    if (!isObject(value) || value.version !== STATE_VERSION) return rejected('unsupported', 'unknown-version');
    const hasRevision = OWN.call(value, 'schemaRevision');
    let state;
    let revision;
    let bootstrap = false;
    if (!hasRevision) {
      if (!isBootstrapSupported(currentRevision) || !isBootstrap(value)) return rejected('unsupported', 'unknown-revision');
      try {
        state = bootstrapMigration.migrate(value);
        if (!isObject(state) || state.schemaRevision !== bootstrapMigration.to) return rejected('unsupported', 'migration-step-invalid');
        revision = state.schemaRevision;
        bootstrap = true;
      } catch {
        return rejected('unsupported', 'migration-failed');
      }
    } else {
      if (!validRevision(value.schemaRevision)) return rejected('unsupported', 'invalid-revision');
      if (value.schemaRevision > currentRevision) return rejected('future', 'future-revision');
      if (value.schemaRevision < minimumRevision) return rejected('too-old', 'revision-window-expired');
      if (value.schemaRevision === currentRevision) {
        const validation = validateCurrent(value);
        return validation.valid ? { status: 'current', state: value } : rejected('unsupported', 'current-validation-failed');
      }
      state = copy(value);
      revision = state.schemaRevision;
    }

    let salvaged = false;
    while (revision < currentRevision) {
      const step = numberedSteps.find((candidate) => candidate.from === revision && candidate.to === revision + 1);
      if (!step) return rejected('unsupported', 'migration-step-missing');
      try {
        const result = step.migrate(state);
        state = result?.state || result;
        salvaged ||= result?.salvaged === true;
        if (!isObject(state) || state.schemaRevision !== step.to) return rejected('unsupported', 'migration-step-invalid');
        revision = step.to;
      } catch {
        return rejected('unsupported', 'migration-failed');
      }
    }
    const validation = validateCurrent(state);
    return validation.valid
      ? { status: salvaged ? 'salvaged' : 'migrated', ...(bootstrap ? { reason: 'bootstrap' } : {}), state }
      : rejected('unsupported', 'final-validation-failed');
  };
}

export const migrateState = createMigrationRunner();
