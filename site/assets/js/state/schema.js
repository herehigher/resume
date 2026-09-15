import { PAGE_SIZES, STATE_VERSION, SUPPORTED_LOCALES } from '../config.js';
import { createDefaultState } from './defaults.js';
import { validatePageBreaks } from '../page-breaks.js';
import { hasUniqueRecordIds, isRecordId } from './record-ids.js';

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function compareShape(value, template, path, errors) {
  if (Array.isArray(template)) {
    if (!Array.isArray(value)) {
      errors.push(`${path} must be an array`);
      return;
    }
    if (template.length) {
      value.forEach((item, index) => {
        compareShape(item, template[0], `${path}[${index}]`, errors);
      });
    }
    return;
  }

  if (isPlainObject(template)) {
    if (!isPlainObject(value)) {
      errors.push(`${path} must be an object`);
      return;
    }
    Object.entries(template).forEach(([key, childTemplate]) => {
      if (!(key in value)) {
        errors.push(`${path}.${key} is required`);
        return;
      }
      compareShape(value[key], childTemplate, `${path}.${key}`, errors);
    });
    return;
  }

  if (typeof value !== typeof template) {
    errors.push(`${path} must be ${typeof template}`);
  }
}

function validateStateShape(value) {
  const errors = [];
  if (!isPlainObject(value)) return { valid: false, errors: ['state must be an object'] };
  const stateKeys = ['documents', 'profile', 'settings', 'version'];
  if (Object.keys(value).sort().join(',') !== stateKeys.join(',')) {
    errors.push('state has an unsupported shape');
  }
  if (value.version !== STATE_VERSION) errors.push(`version must be ${STATE_VERSION}`);
  compareShape(value, createDefaultState(), 'state', errors);

  if (!SUPPORTED_LOCALES.includes(value.settings?.locale)) {
    errors.push('settings.locale is not supported');
  }

  SUPPORTED_LOCALES.forEach((locale) => {
    if (!PAGE_SIZES.includes(value.settings?.pageSizeByLocale?.[locale])) {
      errors.push(`settings.pageSizeByLocale.${locale} is not supported`);
    }
  });
  errors.push(...validatePageBreaks(value.settings?.pageBreaks));

  if (!['resume', 'career'].includes(value.documents?.ja?.activeDocument)) {
    errors.push('documents.ja.activeDocument is not supported');
  }

  const careerKeys = ['company', 'companyInfo', 'detailSections', 'endDate', 'id', 'layoutMode', 'role', 'startDate'];
  const careerDetailSectionKeys = ['content', 'title'];
  const careers = value.documents?.ja?.careers;
  if (Array.isArray(careers)) careers.forEach((career, index) => {
    const keys = isPlainObject(career) ? Object.keys(career).sort() : [];
    const expectedKeys = Object.hasOwn(career || {}, 'layoutMode')
      ? careerKeys
      : careerKeys.filter((key) => key !== 'layoutMode');
    if (!isPlainObject(career) || keys.join(',') !== expectedKeys.join(',')) {
      errors.push(`state.documents.ja.careers[${index}] has an unsupported shape`);
    }
    if (!isRecordId(career?.id)) errors.push(`state.documents.ja.careers[${index}].id is invalid`);
    if (Object.hasOwn(career || {}, 'layoutMode') && career.layoutMode !== 'compact') {
      errors.push(`state.documents.ja.careers[${index}].layoutMode is not supported`);
    }
    if (Array.isArray(career?.detailSections)) career.detailSections.forEach((section, sectionIndex) => {
      if (!isPlainObject(section) || Object.keys(section).sort().join(',') !== careerDetailSectionKeys.join(',')) {
        errors.push(`state.documents.ja.careers[${index}].detailSections[${sectionIndex}] has an unsupported shape`);
      }
    });
  });
  if (Array.isArray(careers) && !hasUniqueRecordIds(careers)) {
    errors.push('state.documents.ja.careers must have unique IDs');
  }
  for (const locale of ['zh-CN', 'en']) {
    if (value.documents?.[locale]?.activeDocument !== 'resume') {
      errors.push(`documents.${locale}.activeDocument is not supported`);
    }
  }
  for (const locale of ['zh-CN', 'en']) {
    const experience = value.documents?.[locale]?.resume?.experience;
    if (!Array.isArray(experience)) continue;
    experience.forEach((record, index) => {
      const keys = ['company', 'details', 'endDate', 'id', 'role', 'startDate'];
      if (!isPlainObject(record) || Object.keys(record).sort().join(',') !== keys.join(',')) {
        errors.push(`state.documents.${locale}.resume.experience[${index}] has an unsupported shape`);
      }
      if (!isRecordId(record?.id)) errors.push(`state.documents.${locale}.resume.experience[${index}].id is invalid`);
    });
    if (!hasUniqueRecordIds(experience)) {
      errors.push(`state.documents.${locale}.resume.experience must have unique IDs`);
    }
  }

  if (value.profile?.photo && !/^data:image\/(?:jpeg|png|webp);base64,/i.test(value.profile.photo)) {
    errors.push('profile.photo must be an embedded JPEG, PNG, or WebP image');
  }

  if (!Array.isArray(value.profile?.fields?.links)
    || value.profile.fields.links.length > 3
    || !value.profile.fields.links.every((link) => typeof link === 'string')) {
    errors.push('profile.fields.links must contain at most 3 string entries');
  }

  if (!['', 'male', 'female', 'other'].includes(value.profile?.fields?.gender)) {
    errors.push('profile.fields.gender is not supported');
  }

  return { valid: errors.length === 0, errors };
}

export function validateState(value) {
  return validateStateShape(value);
}

export function validateCurrentState(value) {
  return validateStateShape(value);
}

export function assertValidState(value) {
  const result = validateState(value);
  if (!result.valid) throw new TypeError(`Invalid Resume Studio data: ${result.errors.join('; ')}`);
  return value;
}
