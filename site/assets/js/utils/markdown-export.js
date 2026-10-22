import { calculateAge, formatJapaneseDate, formatJapaneseMonth } from './date.js?v=0.4.6';
import { exportLimitedMarkdown } from './limited-markdown.js?v=0.4.6';
import { markdownLink, markdownParagraph, markdownText } from './markdown-text.js?v=0.4.6';
import { genderLabel } from './personal-details.js?v=0.4.6';
import { getProfileLinks } from './profile-links.js?v=0.4.6';
import { formatEnglishDateRange, formatEnglishMonth } from '../templates/en.js?v=0.4.6';
import { formatChineseDate, formatChineseMonth, formatChineseRange } from '../templates/zh-CN.js?v=0.4.6';

const has = (value) => Boolean(String(value ?? '').trim());
const join = (parts) => parts.filter(has).join('\n\n');
const heading = (value, level = 2) => has(value) ? `${'#'.repeat(level)} ${markdownParagraph(value)}` : '';
const section = (title, body) => has(body) ? join([heading(title), body]) : '';
const field = (label, value) => has(value) ? `- ${label}: ${markdownParagraph(value).replace(/\n/g, '\n  ')}` : '';
const fields = (entries) => entries.map(([label, value]) => field(label, value)).filter(has).join('\n');
const entered = (item, keys) => keys.some((key) => has(item[key]));
const safeJapaneseDate = (value) => /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/.test(String(value ?? '').trim()) ? formatJapaneseDate(String(value).trim()) : '';
const safeJapaneseMonth = (value) => /^\d{4}-(?:0[1-9]|1[0-2])$/.test(String(value ?? '').trim()) ? formatJapaneseMonth(String(value).trim()) : '';

function profileLinks(profile) {
  return getProfileLinks(profile).map((link) => `- ${markdownLink(`${link.name} · ${link.displayUrl}`, link.url)}`).join('\n');
}

function achievements(value) {
  return String(value ?? '').split(/\r?\n/).map((line) => line.trim().replace(/^(?:[•●▪◦*-]|\d+[.)])\s+/, '')).filter(has)
    .map((line) => `- ${markdownText(line)}`).join('\n');
}

function japanese(state, career) {
  const profile = state.profile.fields;
  const document = state.documents.ja;
  const f = { ...profile, ...document.fields };
  const residence = [
    ['国籍', f.nationality], ['在留資格', f.residenceStatus],
    ['就労制限の有無', { none: 'なし', restricted: 'あり' }[f.workRestriction]],
    ['在留期間（満了日）', safeJapaneseDate(f.residenceExpiryDate)]
  ];
  const identity = fields([
    ['氏名', f.fullName], ['提出日', safeJapaneseDate(f.createdDate)],
    ...(!career ? [
      ['ふりがな', f.nameKana], ['生年月日', safeJapaneseDate(f.birthDate)],
      ['年齢', calculateAge(f.birthDate, f.createdDate)], ['性別', genderLabel(f.gender, 'ja')],
      ['住所ふりがな', f.addressKana], ['現住所', [f.postalCode ? `〒${f.postalCode}` : '', f.address].filter(has).join('　')],
      ['電話', f.phone], ['E-mail', f.email]
    ] : []), ...residence
  ]);
  const head = [heading(career ? '職務経歴書' : '履歴書', 1), identity, profileLinks(profile)];
  if (!career) {
    const history = (items, qualification = false) => join(items.filter((item) => entered(item, qualification ? ['date', 'detail', 'url'] : ['date', 'detail']))
      .map((item) => join([markdownParagraph([safeJapaneseMonth(item.date), item.detail].filter(has).join('　')), qualification && has(item.url) ? markdownLink(item.url, item.url) : ''])));
    return join([...head,
      section('学歴', history(document.education)), section('職歴', history(document.employment)),
      section('免許・資格', history(document.qualification, true)),
      section('志望動機・自己PRなど', exportLimitedMarkdown(f.motivation)),
      section('本人希望記入欄', exportLimitedMarkdown(f.requests))
    ]);
  }
  const careers = document.careers.filter((item) => entered(item, ['company', 'role', 'startDate', 'endDate', 'companyInfo'])
    || item.detailSections.some((detail) => has(detail.content))).map((item) => {
    const start = safeJapaneseMonth(item.startDate);
    const end = safeJapaneseMonth(item.endDate);
    const period = start ? `${start} 〜 ${end || '現在'}` : end;
    return join([heading(item.company, 3), markdownParagraph(period), field('所属・役職', item.role), exportLimitedMarkdown(item.companyInfo),
      ...item.detailSections.filter((detail) => has(detail.content)).map((detail) => join([heading(detail.title, 4), exportLimitedMarkdown(detail.content)]))]);
  });
  return join([...head, section('職務要約', exportLimitedMarkdown(f.careerSummary)),
    section('活かせる経験・知識・技術', exportLimitedMarkdown(f.skills)), section('職務経歴', join(careers)),
    section('自己PR', exportLimitedMarkdown(f.selfPromotion))]);
}

function international(state, locale) {
  const english = locale === 'en';
  const profile = state.profile.fields;
  const r = state.documents[locale].resume;
  const labels = english
    ? { title: 'Resume', summary: 'Summary', experience: 'Experience', projects: 'Projects', education: 'Education', skills: 'Skills', certifications: 'Certifications' }
    : { title: '中文简历', summary: '个人概述', experience: '工作经历', projects: '项目经历', education: '教育经历', skills: '专业技能', certifications: '证书与资质' };
  const range = english ? formatEnglishDateRange : formatChineseRange;
  const month = english ? formatEnglishMonth : formatChineseMonth;
  const contact = english
    ? [['Location', r.location], ['Phone', profile.phone], ['Email', profile.email]]
    : [['电话', profile.phone], ['邮箱', profile.email], ['地址', has(profile.address) ? [profile.postalCode, profile.address].filter(has).join(' · ') : '']];
  const personal = english
    ? r.showOptionalPersonalDetails ? [['Birth date', profile.birthDate], ['Gender', genderLabel(profile.gender, locale)], ['Full address', has(profile.address) ? [profile.postalCode, profile.address].filter(has).join(' · ') : ''], ['Nationality', profile.nationality]] : []
    : [['出生日期', formatChineseDate(profile.birthDate)], ['性别', genderLabel(profile.gender, locale)], ['国籍', profile.nationality]];
  const entries = (key) => join(r[key].filter((item) => entered(item, key === 'experience' ? ['startDate', 'endDate', 'company', 'role', 'details'] : key === 'education' ? ['startDate', 'endDate', 'school', 'degree', 'details'] : ['startDate', 'endDate', 'name', 'role', 'details', 'url']))
    .map((item) => join([
      heading(key === 'education' ? english ? item.degree || item.school : item.school : key === 'projects' ? item.name || (english ? item.role : '') : english ? item.role || item.company : item.company, 3),
      markdownParagraph(range(item.startDate, item.endDate)),
      markdownParagraph(key === 'education' ? english ? item.degree ? item.school : '' : item.degree : key === 'projects' ? item.name ? item.role : '' : english ? item.role ? item.company : '' : item.role),
      key === 'education' ? markdownParagraph(item.details) : achievements(item.details),
      key === 'projects' && has(item.url) ? markdownLink(item.url, item.url) : ''
    ])));
  const certifications = join(r.certifications.filter((item) => entered(item, ['date', 'name', 'url'])).map((item) => join([
    markdownParagraph([item.name, month(item.date)].filter(has).join(' · ')), has(item.url) ? markdownLink(item.url, item.url) : ''
  ])));
  return join([heading(labels.title, 1), heading(profile.fullName), markdownParagraph(r.headline), fields([...contact, ...personal]), profileLinks(profile),
    section(labels.summary, markdownParagraph(r.summary)), section(labels.experience, entries('experience')), section(labels.projects, entries('projects')),
    section(labels.education, entries('education')), section(labels.skills, markdownParagraph(r.skills)), section(labels.certifications, certifications)]);
}

export function exportMarkdown(state, locale = state.settings.locale) {
  if (!['ja', 'zh-CN', 'en'].includes(locale)) throw new Error('Unsupported Markdown locale');
  const career = locale === 'ja' && state.documents.ja.activeDocument !== 'resume';
  return {
    text: `${locale === 'ja' ? japanese(state, career) : international(state, locale)}\n`,
    filename: `resume-studio-${locale}-${career ? 'career' : 'resume'}.md`
  };
}
