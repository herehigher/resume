import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { prepareReleaseManifest } from '../scripts/prepare-release-manifest.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const token = 'a'.repeat(32);
const fingerprint = '8a1bd3491d2b1100e92a33a5efec9c976923e131b50c326a9172d9dc6650c38e';

function fixture(overrides = {}) {
  const calls = [];
  const environment = {
    GITHUB_ACTIONS: 'true',
    GITHUB_EVENT_NAME: 'workflow_dispatch',
    GITHUB_OUTPUT: '/tmp/release-manifest-output',
    GITHUB_REF: 'refs/heads/main',
    GITHUB_REPOSITORY: 'herehigher/resume',
    GITHUB_SHA: '1'.repeat(40),
    RELEASE_DEFAULT_BRANCH: 'main',
    ...overrides
  };
  return {
    calls,
    run: () => prepareReleaseManifest({
      cwd: root,
      environment,
      operations: {
        deriveArtifact: async (input) => {
          calls.push(input);
          return {
            adapter_digest: '2'.repeat(64),
            final_digest: '3'.repeat(64),
            provider_fingerprint: overrides.derivedFingerprint || fingerprint,
            source_digest: '4'.repeat(64)
          };
        },
        readProviderValue: async () => overrides.providerValue ?? token
      }
    })
  };
}

test('release manifest preparation derives only non-secret digest metadata on the default branch runner', async () => {
  const prepared = fixture();
  const result = await prepared.run();
  assert.equal(result.packageVersion, '0.2.1');
  assert.equal(result.releaseSha, '1'.repeat(40));
  assert.equal(result.providerFingerprint, fingerprint);
  assert.equal(prepared.calls.length, 1);
  assert.equal(prepared.calls[0].token, token);
  assert.equal(prepared.calls[0].sourceDirectory, path.join(root, 'site'));
  assert.doesNotMatch(JSON.stringify(result), new RegExp(token));
});

test('release manifest preparation fails closed outside the trusted runner contract', async () => {
  for (const overrides of [
    { GITHUB_ACTIONS: 'false' },
    { GITHUB_EVENT_NAME: 'push' },
    { GITHUB_OUTPUT: '' },
    { GITHUB_REF: 'refs/heads/feature' },
    { GITHUB_REPOSITORY: 'fork/resume' },
    { GITHUB_SHA: 'short' },
    { providerValue: '' },
    { derivedFingerprint: 'f'.repeat(64) }
  ]) {
    await assert.rejects(fixture(overrides).run(), /Release manifest preparation failed/);
  }
});

test('manifest preparation workflow is read-only and never exposes the provider value', () => {
  const workflow = readFileSync(path.join(root, '.github/workflows/prepare-release-manifest.yml'), 'utf8');
  const script = readFileSync(path.join(root, 'scripts/prepare-release-manifest.mjs'), 'utf8');
  assert.match(workflow, /^on:\n {2}workflow_dispatch:$/m);
  assert.match(workflow, /^permissions: \{\}$/m);
  assert.match(workflow, /permissions:\n {6}contents: read/);
  assert.match(workflow, /ref: \$\{\{ github\.sha \}\}/);
  assert.match(workflow, /persist-credentials: false/);
  assert.doesNotMatch(workflow, /vars\.CLOUDFLARE_WEB_ANALYTICS_TOKEN/);
  assert.match(workflow, /CLOUDFLARE_WEB_ANALYTICS_TOKEN: \$\{\{ secrets\.CLOUDFLARE_WEB_ANALYTICS_TOKEN \}\}/);
  assert.doesNotMatch(workflow, /RELEASE_GITHUB_TOKEN|github\.token/);
  const summary = workflow.slice(workflow.indexOf('- name: Write non-secret preparation summary'));
  assert.doesNotMatch(summary, /CLOUDFLARE_WEB_ANALYTICS_TOKEN/);
  assert.doesNotMatch(workflow, /upload-artifact|deploy-pages|git tag|git push|gh issue|gh api/i);
  assert.doesNotMatch(script, /gh variable|get.*token|console\.log\([^\n]*token|git push|git tag/i);
  assert.match(script, /runtimeEnvironment\.CLOUDFLARE_WEB_ANALYTICS_TOKEN/);
});
