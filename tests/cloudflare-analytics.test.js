import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CLOUDFLARE_ANALYTICS_TOKEN,
  CLOUDFLARE_BEACON_URL,
  CLOUDFLARE_RUM_URL,
  cloudflareAnalyticsScriptTags,
  isAllowedCloudflareAnalyticsRequest
} from '../scripts/cloudflare-analytics.mjs';

const expectedOrigin = 'https://herehigher.github.io';

function rumRequest(overrides = {}) {
  const payload = {
    eventType: 1,
    firstContentfulPaint: 128,
    firstPaint: 128,
    location: `${expectedOrigin}/resume/?lang=ja`,
    memory: {
      jsHeapSizeLimit: 4_294_705_152,
      totalJSHeapSize: 21_398_290,
      usedJSHeapSize: 18_054_158
    },
    nt: 'navigate',
    pageloadId: 'page-load-id',
    referrer: '',
    siteToken: CLOUDFLARE_ANALYTICS_TOKEN,
    st: 2,
    startTime: 0,
    timingsV2: { domComplete: 248, loadEventEnd: 248 },
    versions: { fl: '2026.8.0', js: '2026.8.0', timings: 2 },
    ...overrides.payload
  };
  return {
    expectedOrigin,
    headers: { 'content-type': 'application/json' },
    method: 'POST',
    postData: JSON.stringify(payload),
    resourceType: 'xhr',
    url: CLOUDFLARE_RUM_URL,
    ...overrides,
    payload: undefined
  };
}

test('Cloudflare beacon configuration permits only the fixed standard script and token', () => {
  const valid = `<script type="module" src="${CLOUDFLARE_BEACON_URL}" data-cf-beacon='{"token":"${CLOUDFLARE_ANALYTICS_TOKEN}"}'></script>`;
  assert.equal(cloudflareAnalyticsScriptTags(valid).length, 1);
  assert.equal(cloudflareAnalyticsScriptTags(valid.replace(CLOUDFLARE_ANALYTICS_TOKEN, 'wrong')).length, 0);
  assert.equal(cloudflareAnalyticsScriptTags(valid.replace('></script>', ' data-user-id="1"></script>')).length, 0);
  assert.equal(cloudflareAnalyticsScriptTags(valid.replace(CLOUDFLARE_BEACON_URL, `${CLOUDFLARE_BEACON_URL}?v=1`)).length, 0);
});

test('analytics request allowlist accepts only the fixed GET and constrained standard RUM POST', () => {
  assert.equal(isAllowedCloudflareAnalyticsRequest({
    expectedOrigin,
    headers: {},
    method: 'GET',
    postData: null,
    resourceType: 'script',
    url: CLOUDFLARE_BEACON_URL
  }), true);
  assert.equal(isAllowedCloudflareAnalyticsRequest(rumRequest()), true);
  assert.equal(isAllowedCloudflareAnalyticsRequest(rumRequest({
    payload: { st: 1 },
    resourceType: 'ping'
  })), true);
  assert.equal(isAllowedCloudflareAnalyticsRequest(rumRequest({
    payload: {
      eventType: 3,
      lcp: { url: 'blob:https://herehigher.github.io/opaque-photo-id' },
      st: 1
    },
    resourceType: 'ping'
  })), true);

  const rejected = [
    rumRequest({ resourceType: 'fetch' }),
    rumRequest({ payload: { st: 1 } }),
    rumRequest({ resourceType: 'ping' }),
    rumRequest({ url: `${CLOUDFLARE_RUM_URL}?extra=1` }),
    rumRequest({ method: 'GET' }),
    rumRequest({ headers: { 'content-type': 'text/plain' } }),
    rumRequest({ payload: { siteToken: 'wrong' } }),
    rumRequest({ payload: { st: undefined } }),
    rumRequest({ payload: { location: `${expectedOrigin}/resume/?name=personal-data` } }),
    rumRequest({ payload: { referrer: 'https://example.test/?personal-data=1' } }),
    rumRequest({
      payload: {
        eventType: 3,
        lcp: { url: 'data:image/png;base64,private-photo-bytes' },
        st: 1
      },
      resourceType: 'ping'
    }),
    rumRequest({ payload: { resume: 'personal-data' } }),
    rumRequest({ payload: { pageloadId: 'person@example.test' } })
  ];
  for (const request of rejected) assert.equal(isAllowedCloudflareAnalyticsRequest(request), false);
});
