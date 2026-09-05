import {
  CLOUDFLARE_BEACON_URL,
  CLOUDFLARE_RUM_URL
} from './prepare-pages-artifact.mjs';
import { documentUrlPaths } from './deployment-path-contract.mjs';

const DOCUMENT_PATHS = new Set([
  ...documentUrlPaths(),
  ...documentUrlPaths('/resume/')
]);
const LOCALES = new Set(['ja', 'zh-CN', 'en']);
const RUM_KEYS = new Set([
  'cls', 'deliveryType', 'eventType', 'fcp', 'fid', 'firstContentfulPaint', 'firstPaint', 'inp', 'lcp',
  'bi', 'location', 'memory', 'navigationType', 'nt', 'pageloadId', 'referrer',
  'siteToken', 'startTime', 'st', 'timingsV2', 'ttfb', 'versions'
]);
const BROWSER_INFO_KEYS = new Set(['be', 'bev', 'bv', 'ov']);
const BROWSER_ENGINES = new Set(['Blink', 'Gecko', 'WebKit']);
const VERSION_PATTERN = /^\d+(?:\.\d+)*$/;
const TIMING_KEYS = new Set([
  'connectEnd', 'connectStart', 'decodedBodySize', 'domainLookupEnd', 'domainLookupStart',
  'domComplete', 'domInteractive', 'finalResponseHeadersStart', 'firstInterimResponseStart',
  'loadEventEnd', 'loadEventStart', 'navigationStart', 'nextHopProtocol', 'redirectEnd',
  'redirectStart', 'requestStart', 'responseEnd', 'responseStart', 'secureConnectionStart',
  'transferSize'
]);
const NEXT_HOP_PROTOCOLS = new Set(['h2', 'h3', 'http/1.0', 'http/1.1', 'quic']);

function attributesIn(tag) {
  const attributes = new Map();
  const openingTag = tag.match(/^<script\b([\s\S]*?)>/i)?.[1] || '';
  for (const match of openingTag.matchAll(/([^\s=]+)\s*=\s*(["'])(.*?)\2/g)) {
    attributes.set(match[1].toLowerCase(), match[3].replaceAll('&quot;', '"'));
  }
  return attributes;
}

export function isCloudflareAnalyticsScriptTag(tag, expectedToken) {
  const attributes = attributesIn(tag);
  if (attributes.size !== 3 || !/^[0-9a-f]{32}$/.test(expectedToken || '')) return false;
  if (attributes.get('type') !== 'module' || attributes.get('src') !== CLOUDFLARE_BEACON_URL) return false;
  try {
    const configuration = JSON.parse(attributes.get('data-cf-beacon') || '');
    return Object.keys(configuration).length === 1 && configuration.token === expectedToken;
  } catch {
    return false;
  }
}

export function cloudflareAnalyticsScriptTags(html, expectedToken) {
  return [...html.matchAll(/<script\b[^>]*\bsrc=(["'])https?:\/\/[^"']+\1[^>]*><\/script>/gi)]
    .map((match) => match[0])
    .filter((tag) => isCloudflareAnalyticsScriptTag(tag, expectedToken));
}

function isAllowedDocumentUrl(value, expectedOrigin) {
  try {
    const url = new URL(value);
    const query = [...url.searchParams.entries()];
    return url.origin === expectedOrigin
      && DOCUMENT_PATHS.has(url.pathname)
      && !url.hash
      && (query.length === 0 || (
        query.length === 1 && query[0][0] === 'lang' && LOCALES.has(query[0][1])
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

function hasAllowedBrowserInfo(value) {
  if (value === undefined) return true;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const entries = Object.entries(value);
  if (!entries.length || entries.some(([key]) => !BROWSER_INFO_KEYS.has(key))) return false;
  if (!BROWSER_ENGINES.has(value.be)) return false;
  return ['bev', 'bv', 'ov'].every((key) => value[key] === undefined
    || (typeof value[key] === 'string' && VERSION_PATTERN.test(value[key])));
}

function hasAllowedTimings(value) {
  if (value === undefined) return true;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.entries(value).every(([key, child]) => TIMING_KEYS.has(key)
    && (typeof child === 'number' || (key === 'nextHopProtocol' && NEXT_HOP_PROTOCOLS.has(child))));
}

function hasAllowedVersions(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.entries(value).every(([key, child]) => (
    (key === 'fl' && (child === '' || (typeof child === 'string' && VERSION_PATTERN.test(child))))
    || (key === 'js' && typeof child === 'string' && VERSION_PATTERN.test(child))
    || (key === 'timings' && (child === 1 || child === 2))
  ));
}

export function isAllowedCloudflareAnalyticsRequest({
  expectedOrigin,
  expectedToken,
  headers = {},
  method,
  postData = null,
  resourceType,
  url: requestUrl
}) {
  if (!/^[0-9a-f]{32}$/.test(expectedToken || '')) return false;
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
    if (payload.siteToken !== expectedToken) return false;
    if (![1, 3].includes(payload.eventType)) return false;
    if (payload.st !== (resourceType === 'xhr' ? 2 : 1)) return false;
    if (!isAllowedDocumentUrl(payload.location, expectedOrigin)) return false;
    if (!isAllowedReferrer(payload.referrer ?? '', expectedOrigin)) return false;
    return hasAllowedBrowserInfo(payload.bi)
      && hasAllowedTimings(payload.timingsV2)
      && hasAllowedVersions(payload.versions)
      && hasBoundedValues(payload);
  } catch {
    return false;
  }
}

export function cloudflareAnalyticsMockScript(expectedToken) {
  if (!/^[0-9a-f]{32}$/.test(expectedToken || '')) throw new Error('A valid test token is required');
  const payload = {
    eventType: 1,
    firstContentfulPaint: 0,
    firstPaint: 0,
    bi: { be: 'Blink', bev: '0', bv: '0', ov: '0' },
    location: '__LOCATION__',
    memory: { jsHeapSizeLimit: 0, totalJSHeapSize: 0, usedJSHeapSize: 0 },
    nt: 'navigate',
    pageloadId: 'playwright-page-load',
    siteToken: expectedToken,
    st: 2,
    startTime: 0,
    timingsV2: {},
    versions: { fl: '', js: '0.0.0', timings: 2 }
  };
  return `const payload=${JSON.stringify(payload)};payload.location=window.location.href;const request=new XMLHttpRequest();request.open('POST',${JSON.stringify(CLOUDFLARE_RUM_URL)});request.setRequestHeader('content-type','application/json');request.send(JSON.stringify(payload));`;
}

export { CLOUDFLARE_BEACON_URL, CLOUDFLARE_RUM_URL };
