const GENDER_LABELS = Object.freeze({
  ja: Object.freeze({ male: '男性', female: '女性', other: 'その他' }),
  'zh-CN': Object.freeze({ male: '男', female: '女', other: '其他' }),
  en: Object.freeze({ male: 'Male', female: 'Female', other: 'Other' })
});

export function genderLabel(value, locale) {
  return GENDER_LABELS[locale]?.[String(value || '').trim()] || '';
}

export { GENDER_LABELS };
