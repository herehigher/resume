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

export function calculateAge(birthDate, referenceDate = '') {
  if (!birthDate) return '';
  const birth = new Date(`${birthDate}T00:00:00`);
  const reference = referenceDate ? new Date(`${referenceDate}T00:00:00`) : new Date();
  let age = reference.getFullYear() - birth.getFullYear();
  const beforeBirthday = reference.getMonth() < birth.getMonth()
    || (reference.getMonth() === birth.getMonth() && reference.getDate() < birth.getDate());
  if (beforeBirthday) age -= 1;
  return Number.isFinite(age) && age >= 0 ? `${age}歳` : '';
}

