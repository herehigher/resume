export const STATE_VERSION = 3;
// Local drafts use the same version as imported and exported JSON. Namespaces
// outside the explicit compatibility list never participate in startup.
export const STORAGE_KEY = `resume-studio-web-v${STATE_VERSION}`;
// Newest first. Add only version namespaces accepted by the current migration
// registry. Keys outside this explicit list are never inspected.
export const COMPATIBLE_DRAFT_STORAGE_KEYS = Object.freeze(['resume-studio-web-v2']);
export const LOCALE_PREFERENCE_KEY = 'resume-studio-locale-v1';
export const APP_VERSION = '0.3.0';
export const REPOSITORY_URL = 'https://github.com/herehigher/resume';
export const SUPPORTED_LOCALES = Object.freeze(['ja', 'zh-CN', 'en']);
export const DEFAULT_LOCALE = 'ja';
export const PAGE_SIZES = Object.freeze(['A4', 'LETTER']);
