import assert from 'node:assert/strict';
import test from 'node:test';

import { CLOUDFLARE_RUM_URL } from '../scripts/cloudflare-analytics.mjs';
import { summarizeCloudflareAnalyticsCompatibility } from '../scripts/check-cloudflare-analytics-compatibility.mjs';

const token = 'c'.repeat(32);
const origin = 'http://127.0.0.1:43210';

function rumRequest(overrides = {}) {
  return {
    headers: { 'content-type': 'application/json' },
    method: 'POST',
    postData: JSON.stringify({
      bi: { be: 'WebKit', bev: '617.1.2', bv: '18.1', ov: '18.1' },
      eventType: 1,
      location: `${origin}/`,
      pageloadId: 'synthetic-page-load',
      siteToken: token,
      st: 2,
      versions: { js: '2026.9.1', timings: 2 },
      ...overrides.payload
    }),
    resourceType: 'xhr',
    url: CLOUDFLARE_RUM_URL,
    ...overrides
  };
}

test('live compatibility summary records intercept coverage without claiming a provider receipt', () => {
  assert.deepEqual(summarizeCloudflareAnalyticsCompatibility({
    beaconStatus: 200,
    expectedOrigin: origin,
    expectedToken: token,
    requests: [rumRequest(), rumRequest({ payload: { pageloadId: 'second-synthetic-page-load' } })]
  }), {
    beacon: { status: 200, transport: 'loaded-from-provider' },
    lifecycle: {
      nativePageViewCount: 2,
      simulatedHiddenPerformanceCount: 0
    },
    observationScope: 'editor-input-photo-import-reload-leave-and-page-hidden-on-loopback',
    providerReceipt: 'not-checked-rum-intercepted',
    rum: {
      biObserved: true,
      eventTypes: [1],
      fieldNames: ['bi', 'eventType', 'location', 'pageloadId', 'siteToken', 'st', 'versions'],
      pageLoadIdCount: 2,
      requestCount: 2,
      transport: 'intercepted-contract-compliant'
    },
    schemaVersion: 1
  });
});

test('live compatibility summary rejects an unknown live payload field and external endpoint', () => {
  assert.throws(() => summarizeCloudflareAnalyticsCompatibility({
    beaconStatus: 200,
    expectedOrigin: origin,
    expectedToken: token,
    requests: [rumRequest({ payload: { customEvent: 'synthetic-canary' } })]
  }), /privacy contract/);
  assert.throws(() => summarizeCloudflareAnalyticsCompatibility({
    beaconStatus: 200,
    expectedOrigin: origin,
    expectedToken: token,
    requests: [rumRequest()],
    unexpectedRequests: [{ method: 'POST', target: 'https://example.invalid/collect' }]
  }), /unexpected external request/);
});
