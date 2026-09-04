import assert from 'node:assert/strict';
import test from 'node:test';

import { PROVIDER_VARIABLE_NAME, readRunnerProviderValue } from '../scripts/github-provider-variable.mjs';

const providerValue = 'a'.repeat(32);

function environment(overrides = {}) {
  return {
    GITHUB_ACTIONS: 'true',
    GITHUB_REPOSITORY: 'herehigher/resume',
    RELEASE_GITHUB_TOKEN: 'masked-automatic-token',
    ...overrides
  };
}

test('runner provider reader fetches the repository variable and masks it before returning', async () => {
  const calls = [];
  const masked = [];
  const value = await readRunnerProviderValue({
    environment: environment(),
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return { ok: true, json: async () => ({ value: providerValue }) };
    },
    maskValue: (secret) => masked.push(secret)
  });
  assert.equal(value, providerValue);
  assert.deepEqual(masked, [providerValue]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `https://api.github.com/repos/herehigher/resume/actions/variables/${PROVIDER_VARIABLE_NAME}`);
  assert.equal(calls[0].options.headers.Authorization, 'Bearer masked-automatic-token');
});

test('runner provider reader fails closed without exposing or masking invalid values', async () => {
  for (const overrides of [
    { GITHUB_ACTIONS: 'false' },
    { GITHUB_REPOSITORY: 'fork/resume' },
    { RELEASE_GITHUB_TOKEN: '' }
  ]) {
    await assert.rejects(readRunnerProviderValue({ environment: environment(overrides) }), /Runner provider variable read failed/);
  }
  const masked = [];
  await assert.rejects(readRunnerProviderValue({
    environment: environment(),
    fetchImpl: async () => ({ ok: true, json: async () => ({ value: 'invalid\nvalue' }) }),
    maskValue: (value) => masked.push(value)
  }), /invalid format/);
  assert.deepEqual(masked, []);
});

test('runner provider reader converts network and API failures to non-sensitive errors', async () => {
  await assert.rejects(readRunnerProviderValue({
    environment: environment(),
    fetchImpl: async () => { throw new Error(providerValue); },
    maskValue: () => assert.fail('must not mask unavailable data')
  }), (error) => !error.message.includes(providerValue));
  await assert.rejects(readRunnerProviderValue({
    environment: environment(),
    fetchImpl: async () => ({ ok: false }),
    maskValue: () => assert.fail('must not mask unavailable data')
  }), /did not return/);
});
