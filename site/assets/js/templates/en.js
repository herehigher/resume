import { escapeHTML, isClickableUrl } from '../utils/html.js';
import { getProfileLinks, profileLinkIcon } from '../utils/profile-links.js';

const MONTH_NAMES = Object.freeze([
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December'
]);

const ENTRY_FIELDS = Object.freeze({
  experience: ['startDate', 'endDate', 'company', 'role', 'details'],
  projects: ['startDate', 'endDate', 'name', 'role', 'details', 'url'],
  education: ['startDate', 'endDate', 'school', 'degree', 'details'],
  certifications: ['date', 'name', 'url']
});

export function normalizeEnglishPageSize(value) {
  return value === 'A4' ? 'A4' : 'LETTER';
}

export function formatEnglishMonth(value) {
  const match = /^(\d{4})-(\d{2})$/.exec(String(value || '').trim());
  if (!match) return '';
  const month = Number(match[2]);
  if (month < 1 || month > 12) return '';
  return `${MONTH_NAMES[month - 1]} ${match[1]}`;
}

export function formatEnglishDateRange(startDate, endDate) {
  const start = formatEnglishMonth(startDate);
  const end = formatEnglishMonth(endDate);
  if (start && end) return `${start} – ${end}`;
  if (start) return `${start} – Present`;
  return end;
}

export function getEnglishResume(state) {
  return state.documents.en.resume;
}

export function hasEnglishEntry(type, entry) {
  return ENTRY_FIELDS[type].some((field) => String(entry?.[field] || '').trim());
}

export function sortEnglishEntriesDescending(items, type) {
  const enteredItems = items.filter((item) => hasEnglishEntry(type, item));
  const datedItems = enteredItems.map((item, index) => {
    const endDate = type === 'certifications' ? item.date : item.endDate;
    const startDate = type === 'certifications' ? item.date : item.startDate;
    const sortDate = endDate || (startDate ? '9999-12' : '');
    return { item, index, sortDate, startDate: startDate || '' };
  });
  return datedItems
    .sort((left, right) => (
      right.sortDate.localeCompare(left.sortDate)
      || right.startDate.localeCompare(left.startDate)
      || left.index - right.index
    ))
    .map(({ item }) => item);
}

function text(value) {
  return escapeHTML(String(value || '').trim());
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
  return `<ul class="en-achievement-list">${items.map((item) => `<li>${escapeHTML(item)}</li>`).join('')}</ul>`;
}

function renderUrl(value, className = 'en-url') {
  const url = String(value || '').trim();
  if (!url) return '';
  const label = url.replace(/^https?:\/\//i, '').replace(/\/$/, '');
  if (!isClickableUrl(url)) return `<span class="${className}">${escapeHTML(label)}</span>`;
  return `<a class="${className}" href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer">${escapeHTML(label)}</a>`;
}

function renderContact(profile, location) {
  const profileLinks = getProfileLinks(profile).map((link) => {
    const content = `${profileLinkIcon(link.icon)}<span>${escapeHTML(link.name)} · ${escapeHTML(link.displayUrl)}</span>`;
    const rendered = isClickableUrl(link.url)
      ? `<a class="en-url" href="${escapeHTML(link.url)}" target="_blank" rel="noopener noreferrer">${content}</a>`
      : `<span class="en-url">${content}</span>`;
    return `<li>${rendered}</li>`;
  });
  const contactItems = [
    location ? `<li><span class="en-contact-label">Location:</span> ${text(location)}</li>` : '',
    profile.phone ? `<li><span class="en-contact-label">Phone:</span> ${text(profile.phone)}</li>` : '',
    profile.email ? `<li><span class="en-contact-label">Email:</span> ${text(profile.email)}</li>` : '',
    profileLinks.length ? `<li class="en-profile-links"><span class="en-contact-label">Links:</span><ul class="en-profile-link-list">${profileLinks.join('')}</ul></li>` : ''
  ].filter(Boolean);
  return contactItems.length ? `<ul class="en-contact-list">${contactItems.join('')}</ul>` : '';
}

function renderExperience(entries) {
  const items = sortEnglishEntriesDescending(entries, 'experience').map((entry) => {
    const date = formatEnglishDateRange(entry.startDate, entry.endDate);
    return `<article class="en-entry en-experience-entry">
      <div class="en-entry-heading">
        <h3>${text(entry.role || entry.company)}</h3>
        ${date ? `<p class="en-entry-date">${escapeHTML(date)}</p>` : ''}
      </div>
      ${entry.company && entry.role ? `<p class="en-entry-organization">${text(entry.company)}</p>` : ''}
      ${renderAchievements(entry.details)}
    </article>`;
  }).join('');
  return items ? `<section class="en-section" aria-labelledby="en-experience-heading"><h2 id="en-experience-heading">Experience</h2>${items}</section>` : '';
}

function renderProjects(entries) {
  const items = sortEnglishEntriesDescending(entries, 'projects').map((entry) => {
    const date = formatEnglishDateRange(entry.startDate, entry.endDate);
    return `<article class="en-entry en-project-entry">
      <div class="en-entry-heading">
        <h3>${text(entry.name || entry.role)}</h3>
        ${date ? `<p class="en-entry-date">${escapeHTML(date)}</p>` : ''}
      </div>
      ${entry.role && entry.name ? `<p class="en-entry-organization">${text(entry.role)}</p>` : ''}
      ${renderAchievements(entry.details)}
      ${entry.url ? `<p class="en-entry-link"><span>Project:</span> ${renderUrl(entry.url)}</p>` : ''}
    </article>`;
  }).join('');
  return items ? `<section class="en-section" aria-labelledby="en-projects-heading"><h2 id="en-projects-heading">Projects</h2>${items}</section>` : '';
}

function renderEducation(entries) {
  const items = sortEnglishEntriesDescending(entries, 'education').map((entry) => {
    const date = formatEnglishDateRange(entry.startDate, entry.endDate);
    return `<article class="en-entry en-education-entry">
      <div class="en-entry-heading">
        <h3>${text(entry.degree || entry.school)}</h3>
        ${date ? `<p class="en-entry-date">${escapeHTML(date)}</p>` : ''}
      </div>
      ${entry.school && entry.degree ? `<p class="en-entry-organization">${text(entry.school)}</p>` : ''}
      ${entry.details ? `<div class="en-entry-details">${text(entry.details)}</div>` : ''}
    </article>`;
  }).join('');
  return items ? `<section class="en-section" aria-labelledby="en-education-heading"><h2 id="en-education-heading">Education</h2>${items}</section>` : '';
}

function renderCertifications(entries) {
  const items = sortEnglishEntriesDescending(entries, 'certifications').map((entry) => {
    const date = formatEnglishMonth(entry.date);
    return `<li>
      <span class="en-certification-name">${text(entry.name)}</span>
      ${date ? `<span class="en-certification-date">${escapeHTML(date)}</span>` : ''}
      ${entry.url ? `<span class="en-certification-link">${renderUrl(entry.url)}</span>` : ''}
    </li>`;
  }).join('');
  return items ? `<section class="en-section" aria-labelledby="en-certifications-heading"><h2 id="en-certifications-heading">Certifications</h2><ul class="en-certification-list">${items}</ul></section>` : '';
}

export function renderEnglishResume(state) {
  const profile = state.profile.fields;
  const resume = getEnglishResume(state);
  const pageSize = normalizeEnglishPageSize(state.settings.pageSizeByLocale.en);
  const pageClass = pageSize === 'A4' ? 'en-page-size-a4' : 'en-page-size-letter';
  const summary = String(resume.summary || '').trim();
  const skills = String(resume.skills || '').trim();
  return `<article class="document-page english-document ${pageClass}" data-page-size="${pageSize}" aria-label="English resume">
    <header class="en-resume-header">
      <h1>${text(profile.fullName) || '<span class="empty-preview">Your Name</span>'}</h1>
      ${resume.headline ? `<p class="en-headline">${text(resume.headline)}</p>` : ''}
      ${renderContact(profile, resume.location)}
    </header>
    ${summary ? `<section class="en-section" aria-labelledby="en-summary-heading"><h2 id="en-summary-heading">Summary</h2><div class="en-section-body">${escapeHTML(summary)}</div></section>` : ''}
    ${renderExperience(resume.experience)}
    ${renderProjects(resume.projects)}
    ${renderEducation(resume.education)}
    ${skills ? `<section class="en-section" aria-labelledby="en-skills-heading"><h2 id="en-skills-heading">Skills</h2><div class="en-section-body">${escapeHTML(skills)}</div></section>` : ''}
    ${renderCertifications(resume.certifications)}
  </article>`;
}

export function renderEnglishDocument(state) {
  return renderEnglishResume(state);
}
