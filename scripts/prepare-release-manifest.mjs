import { appendFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CLOUDFLARE_PROVIDER,
  OFFICIAL_REPOSITORY,
  deriveCloudflareArtifact,
  validateManifest
} from './prepare-pages-artifact.mjs';

const fullCommitPattern = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/;
const stableVersionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

function fail(message) {
  throw new Error(`Release manifest preparation failed: ${message}`);
}

function assertTrustedRunner(environment) {
  if (environment.GITHUB_ACTIONS !== 'true' || environment.GITHUB_EVENT_NAME !== 'workflow_dispatch') {
    fail('manifest preparation must run in its manually dispatched GitHub workflow');
  }
  if (environment.GITHUB_REPOSITORY !== OFFICIAL_REPOSITORY) fail('official repository is required');
  const defaultBranch = environment.RELEASE_DEFAULT_BRANCH || '';
  if (!/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(defaultBranch)
    || environment.GITHUB_REF !== `refs/heads/${defaultBranch}`) {
    fail('workflow must be dispatched from the repository default branch');
  }
  if (!fullCommitPattern.test(environment.GITHUB_SHA || '')) fail('a full default-branch commit SHA is required');
  if (!environment.GITHUB_OUTPUT) fail('GITHUB_OUTPUT is required');
}

export async function prepareReleaseManifest({
  cwd = process.cwd(),
  environment = process.env,
  operations = {}
} = {}) {
  assertTrustedRunner(environment);
  const readFile = operations.readFile || readFileSync;
  const deriveArtifact = operations.deriveArtifact || deriveCloudflareArtifact;
  const readProviderValue = operations.readProviderValue
    || (({ environment: runtimeEnvironment }) => runtimeEnvironment.CLOUDFLARE_WEB_ANALYTICS_TOKEN || '');
  let manifest;
  let packageJson;
  try {
    manifest = validateManifest(JSON.parse(readFile(path.join(cwd, '.github/pages-release-manifest.json'), 'utf8')));
    packageJson = JSON.parse(readFile(path.join(cwd, 'package.json'), 'utf8'));
  } catch (error) {
    fail(`release metadata is invalid: ${error.message}`);
  }
  if (manifest.analyticsMode !== 'enabled' || manifest.analyticsProvider !== CLOUDFLARE_PROVIDER) {
    fail('the runner-only preparation workflow is only valid for the enabled Cloudflare manifest');
  }
  if (!stableVersionPattern.test(packageJson.version || '')) fail('package version must be stable SemVer');
  const token = await readProviderValue({ environment });
  if (!token) fail('provider secret is unavailable in the GitHub runner');
  const derived = await deriveArtifact({ sourceDirectory: path.join(cwd, 'site'), token });
  if (derived.provider_fingerprint !== manifest.providerTokenSha256) {
    fail('provider fingerprint does not match the reviewed manifest');
  }
  return Object.freeze({
    adapterDigest: derived.adapter_digest,
    finalDigest: derived.final_digest,
    packageVersion: packageJson.version,
    providerFingerprint: derived.provider_fingerprint,
    releaseSha: environment.GITHUB_SHA,
    sourceDigest: derived.source_digest
  });
}

function main() {
  return prepareReleaseManifest().then((result) => {
    appendFileSync(process.env.GITHUB_OUTPUT, [
      `package_version=${result.packageVersion}`,
      `release_sha=${result.releaseSha}`,
      ''
    ].join('\n'));
    console.log(`Prepared non-secret release manifest digests for ${result.packageVersion} at ${result.releaseSha}.`);
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
