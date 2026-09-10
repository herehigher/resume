import { isDraftStorageCompatibilityError } from '../state/storage.js';
import { getMessages } from '../i18n/index.js';

export function messageForDraftStorageError(error, locale, fallback) {
  const messages = {
    'future-state': {
      ja: 'この下書きは新しい版で作成されています。更新後にもう一度開いてください。',
      'zh-CN': '此草稿由较新版本创建。请更新后再打开。',
      en: 'This draft was created by a newer version. Update Resume Studio and try again.'
    },
    'too-old-state': {
      ja: 'このバックアップは古すぎるため、安全に読み込めませんでした。',
      'zh-CN': '此备份版本过旧，无法安全导入。',
      en: 'This backup is too old to import safely.'
    },
    'web-lock-unavailable': {
      ja: 'このブラウザでは下書きを安全に保存できません。編集と書き出しは利用できます。',
      'zh-CN': '此浏览器无法安全保存草稿。仍可继续编辑和导出。',
      en: 'This browser cannot save drafts safely. You can still edit and export your data.'
    },
    'storage-changed': {
      ja: '別のタブで下書きが更新されたため、読み込みを中止しました。',
      'zh-CN': '草稿已在其他标签页更新，导入已取消。',
      en: 'The draft changed in another tab, so the import was cancelled.'
    }
  };
  if (error?.code && messages[error.code]) return messages[error.code][locale];
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
