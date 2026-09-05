import assert from 'node:assert/strict';
import test from 'node:test';

import { CLOUDFLARE_BEACON_URL, CLOUDFLARE_RUM_URL } from '../scripts/cloudflare-analytics.mjs';
import { isAllowedNetworkRequest } from '../scripts/network-contract.mjs';

const baseUrl = 'https://example.test/resume/';

function request(overrides = {}) {
  return {
    headers: {}, method: 'GET', postData: null, resourceType: 'script', url: CLOUDFLARE_BEACON_URL, ...overrides
  };
}

test('blocked-beacon policy permits only the fixed script GET and rejects RUM POST', () => {
  assert.equal(isAllowedNetworkRequest(request(), { allowBlockedBeaconScript: true, baseUrl }), true);
  assert.equal(isAllowedNetworkRequest(request({
    headers: { 'content-type': 'application/json' }, method: 'POST', postData: JSON.stringify({ siteToken: 'a'.repeat(32) }),
    resourceType: 'xhr', url: CLOUDFLARE_RUM_URL
  }), { allowBlockedBeaconScript: true, baseUrl }), false);
});
