import { isDraftStorageCompatibilityError } from '../state/storage.js';
import { getMessages } from '../i18n/index.js';

export function messageForDraftStorageError(error, locale, fallback) {
  if (error?.code === 'unsupported-state') {
    return {
      ja: '保存済みの下書きは現在の形式に対応していないため、変更せず保護しています。',
      'zh-CN': '已保存的草稿不兼容当前格式，未作任何更改并已保留。',
      en: 'The saved draft is not compatible with the current format, so it was left unchanged and preserved.'
    }[locale];
  }
  return isDraftStorageCompatibilityError(error)
    ? getMessages(locale).draftStorageCompatibilityError
    : fallback;
}
