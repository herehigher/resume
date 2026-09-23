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
  privacyRepositoryLink: 'repositoryLink',
  privacyNoticeLink: 'privacyNoticeLink',
  privacySecurityCloseButton: 'close'
});

function privacyNoticeUrl(locale) {
  return `${REPOSITORY_URL}/blob/main/PRIVACY.md#${PRIVACY_ANCHORS[locale]}`;
}

export function initPrivacySecurity(initialLocale, { draftStorageAvailable = true } = {}) {
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
    for (const [id, key] of Object.entries(TEXT_TARGETS)) {
      document.getElementById(id).textContent = copy[key];
    }
    document.getElementById('privacySecurityStorageBody').textContent = copy[
      draftStorageAvailable ? 'storageBody' : 'storageUnavailableBody'
    ];
    document.getElementById('privacySecurityUserBody').textContent = copy.userBody;
    document.getElementById('privacySecurityTechnicalBody').textContent = copy.technicalBody;
    document.querySelectorAll('[data-privacy-notice]').forEach((element) => {
      element.textContent = copy.disclosure;
    });
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
