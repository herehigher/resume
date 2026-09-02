import { isDraftStorageCompatibilityError } from '../state/storage.js';
import { getMessages } from '../i18n/index.js';

export function messageForDraftStorageError(error, locale, fallback) {
  return isDraftStorageCompatibilityError(error)
    ? getMessages(locale).draftStorageCompatibilityError
    : fallback;
}
