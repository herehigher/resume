import { calculateAge, formatJapaneseDate, formatJapaneseMonth } from '../utils/date.js';
import { displayText, escapeHTML, isClickableUrl } from '../utils/html.js';

function hasContent(value) {
  return String(value ?? '').trim().length > 0;
}

function itemHasContent(item, keys) {
  return keys.some((key) => hasContent(item[key]));
}

function japaneseDate(value) {
  const normalized = String(value ?? '').trim();
  if (!/^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/.test(normalized)) return '';
  return formatJapaneseDate(normalized);
}

function japaneseMonth(value) {
  const normalized = String(value ?? '').trim();
  if (!/^\d{4}-(?:0[1-9]|1[0-2])$/.test(normalized)) return '';
  return formatJapaneseMonth(normalized);
}

export function getJapaneseFields(state) {
  return {
    ...state.profile.fields,
    ...state.documents.ja.fields
  };
}

function safeLink(label, value, className, includeLabel = false) {
  if (!hasContent(value)) return '';
  const url = String(value).trim();
  const displayUrl = url.replace(/^https?:\/\//i, '').replace(/\/$/, '');
  const linkText = `${includeLabel ? `${escapeHTML(label)}: ` : ''}${escapeHTML(displayUrl)}`;
  if (!isClickableUrl(url)) return `<span class="${className}">${linkText}</span>`;
  return `<a class="${className}" href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer">${linkText}</a>`;
}

function credentialLink(value) {
  if (!hasContent(value)) return '';
  const url = String(value).trim();
  const label = url.replace(/^https?:\/\//i, '').replace(/\/$/, '');
  if (!isClickableUrl(url)) {
    return `<span class="qualification-proof">確認URL: ${escapeHTML(label)}</span>`;
  }
  return `<a class="qualification-proof" href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer">確認URL: ${escapeHTML(label)}</a>`;
}

function renderResumeProfiles(fields) {
  const profiles = [
    ['GitHub', fields.github],
    ['LinkedIn', fields.linkedin],
    ['Portfolio', fields.portfolio]
  ].filter(([, value]) => hasContent(value));
  if (!profiles.length) return '';
  const rows = profiles
    .map(([label, value]) => `<div class="resume-online-row"><span class="paper-label">${label}</span>${safeLink(label, value, 'profile-url-link')}</div>`)
    .join('');
  return `<section class="resume-online-profiles"><div class="resume-online-title">オンラインプロフィール</div>${rows}</section>`;
}

function renderCareerProfiles(fields) {
  const links = [
    ['GitHub', fields.github],
    ['LinkedIn', fields.linkedin],
    ['Portfolio', fields.portfolio]
  ].map(([label, value]) => safeLink(label, value, 'career-profile-link', true)).filter(Boolean);
  return links.length ? `<div class="career-profile-links">${links.join('')}</div>` : '';
}

function renderHistoryRows(items, category) {
  const enteredItems = items.filter((item) => itemHasContent(item, ['date', 'detail']));
  if (!enteredItems.length) return '';
  const rows = [`<div class="paper-table-row category-row"><div class="paper-table-date"></div><div class="paper-table-detail">${category}</div></div>`];
  enteredItems.forEach((item) => {
    rows.push(`<div class="paper-table-row"><div class="paper-table-date">${escapeHTML(japaneseMonth(item.date))}</div><div class="paper-table-detail">${displayText(item.detail, '未入力')}</div></div>`);
  });
  return rows.join('');
}

function renderQualificationRows(items) {
  return items
    .filter((item) => itemHasContent(item, ['date', 'detail', 'url']))
    .map((item) => `<div class="paper-table-row"><div class="paper-table-date">${escapeHTML(japaneseMonth(item.date))}</div><div class="paper-table-detail">${displayText(item.detail, '未入力')}${credentialLink(item.url)}</div></div>`)
    .join('');
}

function renderCareerPeriod(career) {
  const start = japaneseMonth(career.startDate);
  const end = japaneseMonth(career.endDate);
  if (start && end) return `${escapeHTML(start)} 〜 ${escapeHTML(end)}`;
  if (start) return `${escapeHTML(start)} 〜 現在`;
  return escapeHTML(end);
}

export function renderJapaneseResume(state) {
  const fields = getJapaneseFields(state);
  const document = state.documents.ja;
  const age = calculateAge(
    String(fields.birthDate ?? '').trim(),
    String(fields.createdDate ?? '').trim()
  );
  const photo = state.profile.photo ? `<img src="${escapeHTML(state.profile.photo)}" alt="">` : '証明写真';
  return `
    <article class="document-page resume-document">
      <h2 class="resume-document-title">履 歴 書</h2>
      <div class="resume-current-date">${displayText(japaneseDate(fields.createdDate), '作成日')} 現在</div>
      <section class="resume-profile">
        <div class="profile-text">
          <div class="profile-kana"><span class="paper-label">ふりがな</span><span class="paper-value">${displayText(fields.nameKana)}</span></div>
          <div class="profile-name"><span class="paper-label">氏名</span><span class="paper-value">${displayText(fields.fullName, '氏名未入力')}</span></div>
          <div class="profile-birth"><span class="paper-label">生年月日</span><span class="paper-value">${displayText(japaneseDate(fields.birthDate))} ${age ? `（${escapeHTML(age)}）` : ''}</span><span class="paper-value">${escapeHTML(fields.gender)}</span></div>
        </div>
        <div class="profile-photo">${photo}</div>
      </section>
      <section class="resume-contact">
        <div><span class="paper-label">ふりがな</span><span class="paper-value full-contact">${displayText(fields.addressKana)}</span></div>
        <div><span class="paper-label">現住所</span><span class="paper-value full-contact">${fields.postalCode ? `〒${escapeHTML(fields.postalCode)}　` : ''}${displayText(fields.address)}</span></div>
        <div><span class="paper-label">電話</span><span class="paper-value">${displayText(fields.phone)}</span><span class="paper-label">E-mail</span><span class="paper-value">${displayText(fields.email)}</span></div>
      </section>
      ${renderResumeProfiles(fields)}
      <section class="paper-section">
        <div class="paper-table-header"><div>年月</div><div>学歴・職歴</div></div>
        ${renderHistoryRows(document.education, '学歴')}
        ${renderHistoryRows(document.employment, '職歴')}
      </section>
    </article>
    <article class="document-page resume-document">
      <section class="paper-section paper-section-first">
        <div class="paper-table-header"><div>年月</div><div>免許・資格</div></div>
        ${renderQualificationRows(document.qualification)}
      </section>
      <section class="paper-text-section"><div class="paper-text-title">志望動機・自己PRなど</div><div class="paper-text-content">${displayText(fields.motivation, '志望動機・自己PRを入力してください')}</div></section>
      <section class="paper-text-section requests-section"><div class="paper-text-title">本人希望記入欄</div><div class="paper-text-content">${displayText(hasContent(fields.requests) ? fields.requests : '貴社規定に従います。')}</div></section>
    </article>`;
}

export function renderJapaneseCareer(state) {
  const fields = getJapaneseFields(state);
  const careers = state.documents.ja.careers
    .filter((career) => itemHasContent(career, [
      'company',
      'role',
      'startDate',
      'endDate',
      'companyInfo',
      'responsibilities',
      'achievements'
    ]))
    .map((career) => {
      const period = renderCareerPeriod(career);
      return `
    <section class="career-company">
      <div class="career-company-heading"><strong>${displayText(career.company, '会社名未入力')}</strong>${period ? `<span>${period}</span>` : ''}</div>
      <div class="career-company-info">${displayText(career.companyInfo, '事業内容・会社概要')}</div>
      <div class="career-company-grid">
        <div>所属・役職</div><div>${displayText(career.role, '未入力')}</div>
        <div>担当業務</div><div>${displayText(career.responsibilities, '担当業務を入力してください')}</div>
        <div>実績・成果</div><div>${displayText(career.achievements, '実績・成果を入力してください')}</div>
      </div>
    </section>`;
    }).join('');

  return `
    <article class="document-page career-document">
      <header class="career-doc-header">
        <h2>職務経歴書</h2>
        <div class="career-doc-meta">${displayText(japaneseDate(fields.createdDate), '作成日')}<br>${displayText(fields.fullName, '氏名未入力')}</div>
        ${renderCareerProfiles(fields)}
      </header>
      <section class="career-section"><h3 class="career-section-title">職務要約</h3><div class="career-body">${displayText(fields.careerSummary, '職務要約を入力してください')}</div></section>
      <section class="career-section"><h3 class="career-section-title">活かせる経験・知識・技術</h3><div class="career-body">${displayText(fields.skills, '経験・知識・技術を入力してください')}</div></section>
      <section class="career-section"><h3 class="career-section-title">職務経歴</h3>${careers || '<div class="career-body empty-preview">職務経歴を追加してください</div>'}</section>
      <section class="career-section"><h3 class="career-section-title">自己PR</h3><div class="career-body">${displayText(fields.selfPromotion, '自己PRを入力してください')}</div></section>
    </article>`;
}

export function renderJapaneseDocument(state) {
  return state.documents.ja.activeDocument === 'resume'
    ? renderJapaneseResume(state)
    : renderJapaneseCareer(state);
}
