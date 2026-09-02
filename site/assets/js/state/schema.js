import { PAGE_SIZES, STATE_VERSION, SUPPORTED_LOCALES } from '../config.js';
import { createDefaultState } from './defaults.js';

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

export function validateState(value) {
  const errors = [];
  if (!isPlainObject(value)) return { valid: false, errors: ['state must be an object'] };
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

  if (!['resume', 'career'].includes(value.documents?.ja?.activeDocument)) {
    errors.push('documents.ja.activeDocument is not supported');
  }
  for (const locale of ['zh-CN', 'en']) {
    if (value.documents?.[locale]?.activeDocument !== 'resume') {
      errors.push(`documents.${locale}.activeDocument is not supported`);
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

  return { valid: errors.length === 0, errors };
}

export function assertValidState(value) {
  const result = validateState(value);
  if (!result.valid) throw new TypeError(`Invalid Resume Studio data: ${result.errors.join('; ')}`);
  return value;
}
