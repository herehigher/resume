import { escapeHTML, isClickableUrl } from './html.js';

export const MAX_PROFILE_LINKS = 3;

const KNOWN_SITES = Object.freeze([
  { hostname: 'github.com', name: 'GitHub', icon: 'github' },
  { hostname: 'linkedin.com', name: 'LinkedIn', icon: 'linkedin' },
  { hostname: 'gitlab.com', name: 'GitLab', icon: 'gitlab' },
  { hostname: 'qiita.com', name: 'Qiita', icon: 'qiita' },
  { hostname: 'note.com', name: 'note', icon: 'note' },
  { hostname: 'zenn.dev', name: 'Zenn', icon: 'zenn' },
  { hostname: 'medium.com', name: 'Medium', icon: 'medium' },
  { hostname: 'x.com', name: 'X', icon: 'x' },
  { hostname: 'youtube.com', name: 'YouTube', icon: 'youtube' }
]);

function matchesHostname(hostname, expected) {
  return hostname === expected || hostname.endsWith(`.${expected}`);
}

export function profileLinkMeta(value) {
  const url = String(value || '').trim();
  if (!isClickableUrl(url)) return { name: 'Website', icon: 'external' };
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return KNOWN_SITES.find((site) => matchesHostname(hostname, site.hostname))
      || { name: 'Website', icon: 'external' };
  } catch {
    return { name: 'Website', icon: 'external' };
  }
}

export function profileLinkDisplayUrl(value) {
  return String(value || '').trim().replace(/^https?:\/\//i, '').replace(/\/$/, '');
}

export function getProfileLinks(fields) {
  return (Array.isArray(fields?.links) ? fields.links : [])
    .map((value, index) => ({ index, url: String(value || '').trim() }))
    .filter(({ url }) => url)
    .map((link) => ({ ...link, ...profileLinkMeta(link.url), displayUrl: profileLinkDisplayUrl(link.url) }));
}

export function addProfileLink(fields) {
  if (!Array.isArray(fields.links) || fields.links.length >= MAX_PROFILE_LINKS) return false;
  fields.links.push('');
  return true;
}

export function removeProfileLink(fields, index) {
  if (!Array.isArray(fields.links) || !Number.isInteger(index) || index < 0 || index >= fields.links.length) return false;
  fields.links.splice(index, 1);
  return true;
}

export function profileLinkIcon(icon) {
  const paths = {
    github: '<path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.49v-1.74c-2.78.62-3.37-1.19-3.37-1.19-.46-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.61.07-.61 1 .07 1.53 1.05 1.53 1.05.9 1.56 2.34 1.11 2.91.85.09-.66.35-1.11.63-1.36-2.22-.26-4.56-1.14-4.56-5.06 0-1.12.4-2.03 1.04-2.75-.1-.26-.45-1.3.1-2.71 0 0 .84-.28 2.75 1.05A9.5 9.5 0 0 1 12 6.8c.85 0 1.7.12 2.5.35 1.91-1.33 2.75-1.05 2.75-1.05.55 1.41.2 2.45.1 2.71.64.72 1.04 1.63 1.04 2.75 0 3.93-2.34 4.8-4.57 5.05.36.32.68.93.68 1.88v2.8c0 .27.18.59.69.49A10 10 0 0 0 12 2Z"/>',
    linkedin: '<path d="M6.5 8.5H3.4V20h3.1V8.5ZM5 3A1.8 1.8 0 1 0 5 6.6 1.8 1.8 0 0 0 5 3Zm3.4 5.5V20h3.1v-5.7c0-1.5.28-2.95 2.15-2.95 1.84 0 1.86 1.72 1.86 3.05V20h3.1v-6.24c0-3.07-.66-5.43-4.25-5.43-1.72 0-2.87.94-3.34 1.84h-.04V8.5H8.4Z"/>',
    external: '<path d="M14 3h7v7h-2V6.41l-8.3 8.3-1.4-1.42L17.59 5H14V3ZM5 5h6v2H7v10h10v-4h2v6H5V5Z"/>',
    gitlab: '<path d="m12 21 3.7-11.4H8.3L12 21ZM12 21 2.7 9.6h5.6L12 21Zm0 0 9.3-11.4h-5.6L12 21ZM8.3 9.6 10.1 4h3.8l1.8 5.6H8.3ZM2.7 9.6 5.1 4h5L8.3 9.6H2.7Zm18.6 0L18.9 4h-5l1.8 5.6h5.6Z"/>',
    qiita: '<path d="M5 3h14v18H5V3Zm3.2 4.2v9.6h1.7v-3.4h2.5c2.1 0 3.5-1.2 3.5-3.1 0-1.9-1.4-3.1-3.5-3.1H8.2Zm1.7 1.5h2.35c1.12 0 1.75.55 1.75 1.6s-.63 1.6-1.75 1.6H9.9V8.7Z"/>',
    note: '<path d="M4 4h16v16H4V4Zm3 3v10h10V7H7Zm2 2h6v2H9V9Zm0 4h6v2H9v-2Z"/>',
    zenn: '<path d="m4 5 7 7-7 7h4l7-7-7-7H4Zm8 0 7 7-7 7h4l7-7-7-7h-4Z"/>',
    medium: '<path d="M3 6.5c0-.8.3-1.2 1-1.2h5.4l4.1 9.2 3.6-9.2H22c.6 0 1 .4 1 1v11.2c0 .7-.4 1.2-1.1 1.2h-3.2V9.8l-3.6 8.9h-2.7L8.2 9.8v8.9H4.1c-.7 0-1.1-.5-1.1-1.2V6.5Z"/>',
    x: '<path d="M4 3h4.2l4.4 5.9L17.6 3H20l-6.3 7.2L20.5 21h-4.2l-4.8-6.4L5.9 21H3.5l6.9-7.9L4 3Zm3.1 1.8 9.8 14.4h1.7L8.8 4.8H7.1Z"/>',
    youtube: '<path d="M21.6 7.2a2.8 2.8 0 0 0-2-2C17.8 4.7 12 4.7 12 4.7s-5.8 0-7.6.5a2.8 2.8 0 0 0-2 2A29 29 0 0 0 2 12a29 29 0 0 0 .4 4.8 2.8 2.8 0 0 0 2 2c1.8.5 7.6.5 7.6.5s5.8 0 7.6-.5a2.8 2.8 0 0 0 2-2A29 29 0 0 0 22 12a29 29 0 0 0-.4-4.8ZM10 15.5v-7l6 3.5-6 3.5Z"/>'
  };
  return `<svg class="profile-link-icon profile-link-icon--${escapeHTML(icon)}" aria-hidden="true" viewBox="0 0 24 24">${paths[icon] || paths.external}</svg>`;
}
