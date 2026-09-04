import process from 'node:process';

import { OFFICIAL_REPOSITORY } from './prepare-pages-artifact.mjs';

export const PROVIDER_VARIABLE_NAME = 'CLOUDFLARE_WEB_ANALYTICS_TOKEN';

const providerValuePattern = /^[0-9a-f]{32}$/;

function fail(message) {
  throw new Error(`Runner provider variable read failed: ${message}`);
}

export async function readRunnerProviderValue({
  environment = process.env,
  fetchImpl = globalThis.fetch,
  maskValue = (value) => process.stdout.write(`::add-mask::${value}\n`)
} = {}) {
  if (environment.GITHUB_ACTIONS !== 'true') fail('GitHub Actions runner is required');
  if (environment.GITHUB_REPOSITORY !== OFFICIAL_REPOSITORY) fail('official repository is required');
  const githubToken = environment.RELEASE_GITHUB_TOKEN || '';
  if (!githubToken) fail('masked GitHub runner token is unavailable');
  if (typeof fetchImpl !== 'function') fail('GitHub API client is unavailable');

  let response;
  try {
    response = await fetchImpl(
      `https://api.github.com/repos/${OFFICIAL_REPOSITORY}/actions/variables/${PROVIDER_VARIABLE_NAME}`,
      {
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${githubToken}`,
          'X-GitHub-Api-Version': '2022-11-28'
        }
      }
    );
  } catch {
    fail('GitHub API request failed');
  }
  if (!response?.ok) fail('GitHub API did not return the provider variable');

  let value;
  try {
    value = (await response.json()).value;
  } catch {
    fail('GitHub API response is invalid');
  }
  if (!providerValuePattern.test(value || '')) fail('provider variable has an invalid format');
  maskValue(value);
  return value;
}
