import assert from 'node:assert/strict';
import test from 'node:test';

import { isAllowedNetworkRequest } from '../scripts/network-contract.mjs';

const baseUrl = 'https://example.test/resume/';

function request(overrides = {}) {
  return {
    headers: {},
    method: 'GET',
    postData: null,
    resourceType: 'fetch',
    url: 'https://third-party.example.invalid/collect',
    ...overrides
  };
}

test('network guard tolerates only blocked third-party script fetches', () => {
  assert.equal(isAllowedNetworkRequest(request({ resourceType: 'script' }), { baseUrl }), false);
  assert.equal(isAllowedNetworkRequest(request({ resourceType: 'script' }), {
    allowBlockedThirdPartyScripts: true,
    baseUrl
  }), true);

  const forbidden = [
    request(),
    request({ method: 'POST', postData: 'fictional-network-canary', resourceType: 'fetch' }),
    request({ resourceType: 'image' }),
    request({ method: 'POST', postData: '{}', resourceType: 'script' }),
    request({ method: 'HEAD', resourceType: 'script' })
  ];
  for (const candidate of forbidden) {
    assert.equal(isAllowedNetworkRequest(candidate, {
      allowBlockedThirdPartyScripts: true,
      baseUrl
    }), false);
  }
});

test('network guard permits only known same-origin documents and static assets', () => {
  assert.equal(isAllowedNetworkRequest(request({
    resourceType: 'document',
    url: `${baseUrl}editor/?lang=zh-CN`
  }), { baseUrl }), true);
  assert.equal(isAllowedNetworkRequest(request({
    resourceType: 'script',
    url: `${baseUrl}assets/js/main.js`
  }), { baseUrl }), true);
  assert.equal(isAllowedNetworkRequest(request({
    method: 'POST',
    postData: '{}',
    url: `${baseUrl}collect`
  }), { baseUrl }), false);
  assert.equal(isAllowedNetworkRequest(request({
    url: `${baseUrl}assets/js/main.js?unexpected=1`
  }), { baseUrl }), false);
});
