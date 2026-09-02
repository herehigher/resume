import { createDefaultState } from '../../site/assets/js/state/defaults.js';

export const PDF_LENGTHS = Object.freeze(['short', 'standard', 'extra-long']);

const LINE_COUNTS = Object.freeze({
  short: 2,
  standard: 24,
  'extra-long': 180
});

function lines(prefix, length, endMarker) {
  const count = LINE_COUNTS[length];
  return Array.from({ length: count }, (_, index) => (
    index === count - 1 ? `${prefix} ${index + 1} ${endMarker}` : `${prefix} ${index + 1}`
  )).join('\n');
}

function itemCount(length) {
  if (length === 'short') return 1;
  if (length === 'standard') return 5;
  return 1;
}

function marker(locale, length, documentType, pageSize) {
  return `PDF-END-${locale.toUpperCase().replace(/[^A-Z]/g, '-')}-${documentType.toUpperCase()}-${length.toUpperCase()}-${pageSize}`;
}

function fillProfile(state, locale) {
  state.profile.fields = {
    ...state.profile.fields,
    fullName: locale === 'ja' ? '印刷 試験' : locale === 'zh-CN' ? '打印测试' : 'Print Test',
    phone: '000-0000-0000',
    email: 'pdf-fixture@example.com',
    links: ['https://example.com/pdf-fixture']
  };
}

function fillJapanese(state, length, documentType, endMarker) {
  const document = state.documents.ja;
  document.activeDocument = documentType;
  document.fields = {
    ...document.fields,
    nameKana: 'いんさつ しけん',
    addressKana: 'とうきょうと',
    createdDate: '2026-09-01',
    motivation: lines('志望動機の検証行', length, endMarker),
    requests: `本人希望欄 ${endMarker}`,
    careerSummary: lines('職務要約の検証行', length, `${endMarker}-SUMMARY`),
    skills: lines('スキルの検証行', length, `${endMarker}-SKILLS`),
    selfPromotion: lines('自己PRの検証行', length, endMarker)
  };

  const rows = length === 'short' ? 2 : length === 'standard' ? 18 : 70;
  document.education = Array.from({ length: rows }, (_, index) => ({
    date: `20${String(index % 20).padStart(2, '0')}-04`,
    detail: `学歴の検証行 ${index + 1}`
  }));
  document.employment = Array.from({ length: rows }, (_, index) => ({
    date: `20${String(index % 20).padStart(2, '0')}-10`,
    detail: `職歴の検証行 ${index + 1}`
  }));
  document.qualification = Array.from({ length: Math.max(2, Math.ceil(rows / 2)) }, (_, index) => ({
    date: `20${String(index % 20).padStart(2, '0')}-12`,
    detail: `資格の検証行 ${index + 1}`,
    url: ''
  }));

  document.careers = Array.from({ length: itemCount(length) }, (_, index) => ({
    company: `検証株式会社 ${index + 1}`,
    role: '印刷品質担当',
    startDate: '2020-01',
    endDate: '',
    companyInfo: 'PDFページ分割の検証用データ',
    responsibilities: lines('担当業務の検証行', length, `${endMarker}-RESPONSIBILITIES-${index + 1}`),
    achievements: lines('実績の検証行', length, index === itemCount(length) - 1 ? endMarker : `${endMarker}-${index + 1}`)
  }));
}

function fillChinese(state, length, endMarker) {
  const resume = state.documents['zh-CN'].resume;
  resume.headline = 'PDF 分页测试';
  resume.summary = lines('个人概述测试行', length, `${endMarker}-SUMMARY`);
  resume.experience = Array.from({ length: itemCount(length) }, (_, index) => ({
    startDate: '2020-01',
    endDate: '',
    company: `分页测试公司 ${index + 1}`,
    role: '打印质量负责人',
    details: lines('工作经历测试行', length, index === itemCount(length) - 1 ? endMarker : `${endMarker}-${index + 1}`)
  }));
  resume.projects = Array.from({ length: itemCount(length) }, (_, index) => ({
    startDate: '2021-01',
    endDate: '2022-12',
    name: `分页测试项目 ${index + 1}`,
    role: '负责人',
    details: lines('项目经历测试行', length, `${endMarker}-PROJECT-${index + 1}`),
    url: 'https://example.com/pdf-fixture'
  }));
  resume.education = [{
    startDate: '2010-04',
    endDate: '2014-03',
    school: '测试大学',
    degree: '测试学位',
    details: '教育经历测试内容'
  }];
  resume.skills = lines('专业技能测试行', length, `${endMarker}-SKILLS`);
  resume.certifications = [{ date: '2025-01', name: '打印质量认证', url: '' }];
}

function fillEnglish(state, length, endMarker) {
  const resume = state.documents.en.resume;
  resume.headline = 'PDF Pagination Test';
  resume.location = 'Tokyo, Japan';
  resume.summary = lines('Summary test line', length, `${endMarker}-SUMMARY`);
  resume.experience = Array.from({ length: itemCount(length) }, (_, index) => ({
    startDate: '2020-01',
    endDate: '',
    company: `Pagination Test Company ${index + 1}`,
    role: 'Print Quality Lead',
    details: lines('Experience test line', length, index === itemCount(length) - 1 ? endMarker : `${endMarker}-${index + 1}`)
  }));
  resume.projects = Array.from({ length: itemCount(length) }, (_, index) => ({
    startDate: '2021-01',
    endDate: '2022-12',
    name: `Pagination Test Project ${index + 1}`,
    role: 'Owner',
    details: lines('Project test line', length, `${endMarker}-PROJECT-${index + 1}`),
    url: 'https://example.com/pdf-fixture'
  }));
  resume.education = [{
    startDate: '2010-08',
    endDate: '2014-05',
    school: 'Test University',
    degree: 'Test Degree',
    details: 'Education pagination fixture'
  }];
  resume.skills = lines('Skill test line', length, `${endMarker}-SKILLS`);
  resume.certifications = [{ date: '2025-01', name: 'Print Quality Certificate', url: '' }];
}

export function createPdfFixture({ locale, length, documentType = 'resume', pageSize } = {}) {
  if (!['ja', 'zh-CN', 'en'].includes(locale)) throw new TypeError(`Unsupported PDF fixture locale: ${locale}`);
  if (!PDF_LENGTHS.includes(length)) throw new TypeError(`Unsupported PDF fixture length: ${length}`);
  if (locale !== 'ja' && documentType !== 'resume') throw new TypeError(`${locale} only supports the resume fixture`);

  const resolvedPageSize = locale === 'en' && pageSize === 'A4' ? 'A4' : locale === 'en' ? 'LETTER' : 'A4';
  const state = createDefaultState(locale);
  state.settings.pageSizeByLocale[locale] = resolvedPageSize;
  fillProfile(state, locale);
  const endMarker = marker(locale, length, documentType, resolvedPageSize);

  if (locale === 'ja') fillJapanese(state, length, documentType, endMarker);
  if (locale === 'zh-CN') fillChinese(state, length, endMarker);
  if (locale === 'en') fillEnglish(state, length, endMarker);

  return { endMarker, state };
}

export function pdfFixtureCases() {
  const cases = [];
  for (const length of PDF_LENGTHS) {
    cases.push({ locale: 'ja', length, documentType: 'resume', pageSize: 'A4' });
    cases.push({ locale: 'ja', length, documentType: 'career', pageSize: 'A4' });
    cases.push({ locale: 'zh-CN', length, documentType: 'resume', pageSize: 'A4' });
    cases.push({ locale: 'en', length, documentType: 'resume', pageSize: 'A4' });
    cases.push({ locale: 'en', length, documentType: 'resume', pageSize: 'LETTER' });
  }
  return cases;
}
