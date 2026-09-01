import { APP_VERSION, REPOSITORY_URL } from '../config.js';
import { getMessages } from '../i18n/index.js';

const PRIVACY_ANCHORS = Object.freeze({
  ja: 'privacy-ja',
  'zh-CN': 'privacy-zh-cn',
  en: 'privacy-en'
});

const TEXT_TARGETS = Object.freeze({
  privacySecurityBadgeLabel: 'badgeLabel',
  repositoryLinkText: 'sourceLink',
  privacySecurityTitle: 'title',
  privacySecuritySummary: 'summary',
  privacySecurityUserHeading: 'userHeading',
  privacySecurityTechnicalHeading: 'technicalHeading',
  privacySecurityStorageHeading: 'storageHeading',
  privacySecurityStorageBody: 'storageBody',
  privacyRepositoryLink: 'repositoryLink',
  privacyNoticeLink: 'privacyNoticeLink',
  privacySecurityCloseButton: 'close'
});

function privacyNoticeUrl(locale) {
  return `${REPOSITORY_URL}/blob/main/PRIVACY.md#${PRIVACY_ANCHORS[locale]}`;
}

export function analyticsStatusFrom(element) {
  const mode = element?.dataset?.analyticsMode;
  const provider = element?.dataset?.analyticsProvider;
  if (mode === 'disabled' && provider === 'none') return 'disabled';
  if (mode === 'enabled' && provider === 'cloudflare-web-analytics') return 'enabled';
  return 'configurationError';
}

export function initPrivacySecurity(initialLocale) {
  const button = document.getElementById('privacySecurityButton');
  const dialog = document.getElementById('privacySecurityDialog');
  const repositoryLink = document.getElementById('repositoryLink');
  const dialogRepositoryLink = document.getElementById('privacyRepositoryLink');
  const privacyLink = document.getElementById('privacyNoticeLink');

  repositoryLink.href = REPOSITORY_URL;
  dialogRepositoryLink.href = REPOSITORY_URL;
  document.getElementById('privacySecurityVersion').textContent = `v${APP_VERSION}`;

  function applyLocale(locale) {
    const copy = getMessages(locale).privacySecurity;
    const analyticsStatus = analyticsStatusFrom(document.documentElement);
    for (const [id, key] of Object.entries(TEXT_TARGETS)) {
      document.getElementById(id).textContent = copy[key];
    }
    document.getElementById('privacySecurityUserBody').textContent = copy[`${analyticsStatus}UserBody`];
    document.getElementById('privacySecurityTechnicalBody').textContent = copy[`${analyticsStatus}TechnicalBody`];
    button.setAttribute('aria-label', copy.badgeAria.replace('{version}', APP_VERSION));
    repositoryLink.setAttribute('aria-label', copy.sourceLinkAria);
    repositoryLink.title = copy.sourceLink;
    privacyLink.href = privacyNoticeUrl(locale);
  }

  button.addEventListener('click', () => {
    if (!dialog.open) dialog.showModal();
  });

  applyLocale(initialLocale);
  return { applyLocale };
}
