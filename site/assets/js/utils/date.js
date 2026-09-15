export function formatJapaneseMonth(value) {
  if (!value) return '';
  const [year, month] = value.split('-');
  return `${year}年 ${Number(month)}月`;
}

export function formatJapaneseDate(value) {
  if (!value) return '';
  const [year, month, day] = value.split('-');
  return `${year}年${Number(month)}月${Number(day)}日`;
}

function parseIsoDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? '').trim());
  if (!match) return null;
  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (
    date.getUTCFullYear() !== Number(year)
    || date.getUTCMonth() !== Number(month) - 1
    || date.getUTCDate() !== Number(day)
  ) return null;
  return { day: Number(day), month: Number(month), year: Number(year) };
}

export function calculateAge(birthDate, referenceDate = '') {
  const birth = parseIsoDate(birthDate);
  const reference = parseIsoDate(referenceDate);
  if (!birth || !reference) return '';
  let age = reference.year - birth.year;
  const beforeBirthday = reference.month < birth.month
    || (reference.month === birth.month && reference.day < birth.day);
  if (beforeBirthday) age -= 1;
  return age >= 0 ? `満${age}歳` : '';
}
