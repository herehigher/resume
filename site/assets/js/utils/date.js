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
  const parsedYear = Number(year);
  const parsedMonth = Number(month);
  const parsedDay = Number(day);
  const isLeapYear = parsedYear % 4 === 0 && (parsedYear % 100 !== 0 || parsedYear % 400 === 0);
  const daysByMonth = [31, isLeapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (parsedYear < 1 || parsedMonth < 1 || parsedMonth > 12 || parsedDay < 1 || parsedDay > daysByMonth[parsedMonth - 1]) return null;
  return { day: parsedDay, month: parsedMonth, year: parsedYear };
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
