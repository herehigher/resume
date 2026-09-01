export const CLOUDFLARE_ANALYTICS_TOKEN = '0b02ba35d9bc4d4d8dd63b42d6d51241';
export const CLOUDFLARE_BEACON_URL = 'https://static.cloudflareinsights.com/beacon.min.js';
export const CLOUDFLARE_RUM_URL = 'https://cloudflareinsights.com/cdn-cgi/rum';

const DOCUMENT_PATHS = new Set([
  '/',
  '/index.html',
  '/ja/',
  '/zh-cn/',
  '/en/',
  '/resume/',
  '/resume/index.html',
  '/resume/ja/',
  '/resume/zh-cn/',
  '/resume/en/'
]);
const LOCALES = new Set(['ja', 'zh-CN', 'en']);
const RUM_KEYS = new Set([
  'cls',
  'deliveryType',
  'eventType',
  'fid',
  'firstContentfulPaint',
  'firstPaint',
  'inp',
  'lcp',
  'location',
  'memory',
  'navigationType',
  'nt',
  'pageloadId',
  'referrer',
  'resources',
  'serverTimings',
  'siteToken',
  'startTime',
  'st',
  'timingsV2',
  'ttfb',
  'versions'
]);

function attributesIn(tag) {
  const attributes = new Map();
  const openingTag = tag.match(/^<script\b([\s\S]*?)>/i)?.[1] || '';
  for (const match of openingTag.matchAll(/([^\s=]+)\s*=\s*(["'])(.*?)\2/g)) {
    attributes.set(match[1].toLowerCase(), match[3]);
  }
  return attributes;
}

export function isCloudflareAnalyticsScriptTag(tag) {
  const attributes = attributesIn(tag);
  if (attributes.size !== 3) return false;
  if (attributes.get('type') !== 'module') return false;
  if (attributes.get('src') !== CLOUDFLARE_BEACON_URL) return false;
  try {
    const configuration = JSON.parse(attributes.get('data-cf-beacon') || '');
    return Object.keys(configuration).length === 1
      && configuration.token === CLOUDFLARE_ANALYTICS_TOKEN;
  } catch {
    return false;
  }
}

export function cloudflareAnalyticsScriptTags(html) {
  return [...html.matchAll(/<script\b[^>]*\bsrc=(["'])https?:\/\/[^"']+\1[^>]*><\/script>/gi)]
    .map((match) => match[0])
    .filter(isCloudflareAnalyticsScriptTag);
}

function isAllowedDocumentUrl(value, expectedOrigin) {
  try {
    const url = new URL(value);
    const query = [...url.searchParams.entries()];
    return url.origin === expectedOrigin
      && DOCUMENT_PATHS.has(url.pathname)
      && !url.hash
      && (query.length === 0 || (
        query.length === 1
        && query[0][0] === 'lang'
        && LOCALES.has(query[0][1])
      ));
  } catch {
    return false;
  }
}

function isAllowedReferrer(value, expectedOrigin) {
  if (value === '') return true;
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash) return false;
    if (url.origin === expectedOrigin) return isAllowedDocumentUrl(value, expectedOrigin);
    return !url.search;
  } catch {
    return false;
  }
}

function hasBoundedValues(value) {
  if (value === null || typeof value === 'number' || typeof value === 'boolean') return true;
  if (typeof value === 'string') return value.length <= 512 && !/data:image|[\w.+-]+@[\w.-]+\.[a-z]{2,}/i.test(value);
  if (Array.isArray(value)) return value.length <= 100 && value.every(hasBoundedValues);
  if (typeof value !== 'object' || Object.keys(value).length > 100) return false;
  return Object.entries(value).every(([key, child]) => key.length <= 64 && hasBoundedValues(child));
}

export function isAllowedCloudflareAnalyticsRequest({
  expectedOrigin,
  headers = {},
  method,
  postData = null,
  resourceType,
  url: requestUrl
}) {
  if (method === 'GET' && resourceType === 'script' && requestUrl === CLOUDFLARE_BEACON_URL) {
    return postData === null;
  }
  if (method !== 'POST' || !['ping', 'xhr'].includes(resourceType) || requestUrl !== CLOUDFLARE_RUM_URL) {
    return false;
  }
  if (!/^application\/json(?:\s*;|$)/i.test(headers['content-type'] || '')) return false;
  if (!postData || Buffer.byteLength(postData, 'utf8') > 65_536) return false;

  try {
    const payload = JSON.parse(postData);
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false;
    if (Object.keys(payload).some((key) => !RUM_KEYS.has(key))) return false;
    if (payload.siteToken !== CLOUDFLARE_ANALYTICS_TOKEN) return false;
    const expectedTransport = resourceType === 'xhr' ? 2 : 1;
    if (payload.st !== expectedTransport) return false;
    if (!isAllowedDocumentUrl(payload.location, expectedOrigin)) return false;
    if (!isAllowedReferrer(payload.referrer ?? '', expectedOrigin)) return false;
    return hasBoundedValues(payload);
  } catch {
    return false;
  }
}

export function cloudflareAnalyticsMockScript() {
  const payload = {
    eventType: 1,
    firstContentfulPaint: 0,
    firstPaint: 0,
    location: '__LOCATION__',
    memory: {
      jsHeapSizeLimit: 0,
      totalJSHeapSize: 0,
      usedJSHeapSize: 0
    },
    nt: 'navigate',
    pageloadId: 'playwright-page-load',
    siteToken: CLOUDFLARE_ANALYTICS_TOKEN,
    st: 2,
    startTime: 0,
    timingsV2: {},
    versions: { fl: 'playwright', js: 'playwright', timings: 2 }
  };
  return `const payload=${JSON.stringify(payload)};payload.location=window.location.href;const request=new XMLHttpRequest();request.open('POST',${JSON.stringify(CLOUDFLARE_RUM_URL)});request.setRequestHeader('content-type','application/json');request.send(JSON.stringify(payload));`;
}
