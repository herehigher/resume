import { displayText, escapeHTML, isClickableUrl } from '../utils/html.js';
import { getProfileLinks, profileLinkIcon } from '../utils/profile-links.js';

function hasText(value) {
  return Boolean(String(value || '').trim());
}

function achievementLines(value) {
  return String(value || '')
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^(?:[•●▪◦*-]|\d+[.)])\s+/, ''))
    .filter(Boolean);
}

function renderAchievements(value) {
  const items = achievementLines(value);
  if (!items.length) return '';
  return `<ul class="zh-achievement-list">${items.map((item) => `<li>${escapeHTML(item)}</li>`).join('')}</ul>`;
}

export function formatChineseMonth(value) {
  if (!hasText(value)) return '';
  const match = /^(\d{4})-(\d{2})$/.exec(String(value).trim());
  if (!match) return String(value).trim();
  return `${match[1]}.${match[2]}`;
}

export function formatChineseDate(value) {
  if (!hasText(value)) return '';
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value).trim());
  if (!match) return String(value).trim();
  return `${match[1]}年${Number(match[2])}月${Number(match[3])}日`;
}

export function formatChineseRange(startDate, endDate, currentLabel = '至今') {
  const start = formatChineseMonth(startDate);
  const end = hasText(endDate) ? formatChineseMonth(endDate) : currentLabel;
  if (!start && !hasText(endDate)) return '';
  if (!start) return end;
  return `${start} — ${end}`;
}

function sortKey(item) {
  if (!hasText(item.endDate) && hasText(item.startDate)) return '9999-99';
  return String(item.endDate || item.startDate || '0000-00');
}

export function newestFirst(items) {
  return [...items].sort((left, right) => {
    const endOrder = sortKey(right).localeCompare(sortKey(left));
    if (endOrder) return endOrder;
    return String(right.startDate || '').localeCompare(String(left.startDate || ''));
  });
}

export function getChineseFields(state) {
  return {
    ...state.profile.fields,
    ...state.documents['zh-CN'].resume
  };
}

function renderLink(value, label, className = 'zh-link') {
  if (!hasText(value)) return '';
  const url = String(value).trim();
  const text = label || url.replace(/^https?:\/\//i, '').replace(/\/$/, '');
  if (!isClickableUrl(url)) return `<span class="${className}">${escapeHTML(text)}</span>`;
  return `<a class="${className}" href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer">${escapeHTML(text)}</a>`;
}

function renderContact(fields) {
  const contacts = [
    fields.phone && `<span>${escapeHTML(fields.phone)}</span>`,
    fields.email && `<span>${escapeHTML(fields.email)}</span>`,
    fields.address && `<span>${fields.postalCode ? `${escapeHTML(fields.postalCode)} · ` : ''}${escapeHTML(fields.address)}</span>`
  ].filter(Boolean);
  return contacts.length ? `<div class="zh-contact">${contacts.join('')}</div>` : '';
}

function renderProfiles(fields) {
  const links = getProfileLinks(fields).map((link) => {
    const content = `${profileLinkIcon(link.icon)}<span>${escapeHTML(link.name)} · ${escapeHTML(link.displayUrl)}</span>`;
    if (!isClickableUrl(link.url)) return `<span class="zh-link">${content}</span>`;
    return `<a class="zh-link" href="${escapeHTML(link.url)}" target="_blank" rel="noopener noreferrer">${content}</a>`;
  });
  return links.length ? `<div class="zh-profile-links"><strong>Links</strong>${links.join('')}</div>` : '';
}

function renderOptionalDetails(fields) {
  const details = [
    fields.birthDate && `<span>出生日期：${escapeHTML(formatChineseDate(fields.birthDate))}</span>`,
    fields.gender && `<span>性别：${escapeHTML(fields.gender)}</span>`
  ].filter(Boolean);
  return details.length ? `<div class="zh-optional-details">${details.join('')}</div>` : '';
}

function renderSection(title, body, className = '') {
  if (!hasText(body)) return '';
  return `<section class="zh-section ${className}"><h2>${escapeHTML(title)}</h2><div class="zh-section-body">${displayText(body)}</div></section>`;
}

function isEntered(item, keys) {
  return keys.some((key) => hasText(item[key]));
}

function renderTimeline(title, items, { kind, keys }) {
  const entered = newestFirst(items.filter((item) => isEntered(item, keys)));
  if (!entered.length) return '';
  const rows = entered.map((item) => {
    const heading = kind === 'education' ? item.school : item.company;
    const subheading = kind === 'education' ? item.degree : item.role;
    return `
      <article class="zh-timeline-item">
        <div class="zh-timeline-date">${escapeHTML(formatChineseRange(item.startDate, item.endDate))}</div>
        <div class="zh-timeline-content">
          <h3>${displayText(heading, kind === 'education' ? '学校名称' : '公司名称')}</h3>
          ${hasText(subheading) ? `<div class="zh-timeline-role">${escapeHTML(subheading)}</div>` : ''}
          ${kind === 'experience'
            ? renderAchievements(item.details)
            : hasText(item.details) ? `<div class="zh-timeline-details">${displayText(item.details)}</div>` : ''}
        </div>
      </article>`;
  }).join('');
  return `<section class="zh-section"><h2>${escapeHTML(title)}</h2><div class="zh-timeline">${rows}</div></section>`;
}

function renderProjects(projects) {
  const entered = newestFirst(projects.filter((item) => isEntered(item, [
    'startDate', 'endDate', 'name', 'role', 'details', 'url'
  ])));
  if (!entered.length) return '';
  const rows = entered.map((project) => `
    <article class="zh-project">
      <div class="zh-project-heading">
        <div><h3>${displayText(project.name, '项目名称')}</h3>${hasText(project.role) ? `<span>${escapeHTML(project.role)}</span>` : ''}</div>
        ${(hasText(project.startDate) || hasText(project.endDate)) ? `<time>${escapeHTML(formatChineseRange(project.startDate, project.endDate))}</time>` : ''}
      </div>
      ${renderAchievements(project.details)}
      ${renderLink(project.url, '', 'zh-project-link')}
    </article>`).join('');
  return `<section class="zh-section"><h2>项目经历</h2><div class="zh-project-list">${rows}</div></section>`;
}

function renderCertifications(certifications) {
  const entered = certifications
    .filter((item) => isEntered(item, ['date', 'name', 'url']))
    .sort((left, right) => String(right.date || '').localeCompare(String(left.date || '')));
  if (!entered.length) return '';
  const rows = entered.map((item) => `
    <li>
      ${hasText(item.date) ? `<time>${escapeHTML(formatChineseMonth(item.date))}</time>` : ''}
      <span>${displayText(item.name, '证书名称')}</span>
      ${renderLink(item.url, '查看证书', 'zh-certification-link')}
    </li>`).join('');
  return `<section class="zh-section zh-certifications"><h2>证书与资质</h2><ul>${rows}</ul></section>`;
}

export function renderChineseResume(state, { photoUrl = '' } = {}) {
  const fields = getChineseFields(state);
  const headerClass = photoUrl ? 'zh-resume-header has-photo' : 'zh-resume-header';
  return `
    <article class="document-page zh-resume-document" lang="zh-CN">
      <header class="${headerClass}">
        <div class="zh-identity">
          <h1>${displayText(fields.fullName, '姓名')}</h1>
          ${hasText(fields.headline) ? `<p>${escapeHTML(fields.headline)}</p>` : ''}
          ${renderContact(fields)}
          ${renderProfiles(fields)}
          ${renderOptionalDetails(fields)}
        </div>
        ${photoUrl ? `<img class="zh-profile-photo" src="${escapeHTML(photoUrl)}" alt="">` : ''}
      </header>
      <div class="zh-resume-content">
        ${renderSection('个人概述', fields.summary, 'zh-summary')}
        ${renderTimeline('工作经历', fields.experience, {
          kind: 'experience',
          keys: ['startDate', 'endDate', 'company', 'role', 'details']
        })}
        ${renderProjects(fields.projects)}
        ${renderTimeline('教育经历', fields.education, {
          kind: 'education',
          keys: ['startDate', 'endDate', 'school', 'degree', 'details']
        })}
        ${renderSection('专业技能', fields.skills, 'zh-skills')}
        ${renderCertifications(fields.certifications)}
      </div>
    </article>`;
}

export function renderChineseDocument(state, options = {}) {
  return renderChineseResume(state, options);
}
