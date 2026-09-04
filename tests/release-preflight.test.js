import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { archiveRelease, runReleasePreflight } from '../scripts/release-preflight.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));

test('release preflight archives the complete release repository', async (t) => {
  const target = mkdtempSync(path.join(os.tmpdir(), 'resume-release-archive-test-'));
  t.after(() => rmSync(target, { force: true, recursive: true }));

  await archiveRelease(root, 'HEAD', target);

  const packageJson = JSON.parse(readFileSync(path.join(target, 'package.json'), 'utf8'));
  assert.equal(packageJson.name, 'resume-studio');
  assert.equal(readFileSync(path.join(target, 'site/assets/favicon/resume-studio-marmot-512.png')).byteLength > 200_000, true);
});

function mockPreflight({
  commandFailure,
  origin = 'https://github.com/herehigher/resume.git',
  remoteTag = '',
  statusOverrides = {},
  version = '0.1.0',
  providerToken = 'a'.repeat(32),
  verifyFailure = false
} = {}) {
  const releaseSha = '1'.repeat(40);
  const remoteMainSha = '2'.repeat(40);
  const calls = [];
  const statusCalls = [];
  const artifactCalls = [];
  const command = (name, args) => {
    calls.push([name, args]);
    if (commandFailure?.(name, args)) throw new Error('simulated command failure');
    if (args[0] === 'remote') return origin;
    if (args[0] === 'rev-parse') return remoteMainSha;
    if (args[0] === 'ls-remote') return remoteTag;
    if (args[0] === 'show') {
      if (args.at(-1).endsWith(':package.json')) return JSON.stringify({ version });
      if (args.at(-1).endsWith(':CHANGELOG.md')) return `## [${version}] - 2026-09-03`;
      return `export const APP_VERSION = '${version}';`;
    }
    throw new Error(`unexpected command: ${args.join(' ')}`);
  };
  const commandStatus = (_name, args) => {
    statusCalls.push(args);
    return statusOverrides[args[0]] ?? (args[0] === 'show-ref' ? 1 : 0);
  };
  const operations = {
    archiveRelease: async () => {},
    command,
    commandStatus,
    mkdtemp: async () => '/tmp/release-preflight-test',
    prepareArtifact: async (input) => {
      artifactCalls.push(['prepare', input]);
      return { sourceDigest: '3'.repeat(64) };
    },
    readProviderValue: async () => providerToken,
    rm: async () => {},
    validateDeploymentArtifact: async (input) => artifactCalls.push(['smoke', input]),
    validateReleaseSource: async () => ({
      adapter_digest: '4'.repeat(64),
      analytics_mode: 'enabled',
      analytics_provider: 'cloudflare-web-analytics',
      manifest: { analyticsMode: 'enabled' },
      provider_fingerprint: '5'.repeat(64)
    }),
    verifyArtifact: async (input) => {
      artifactCalls.push(['verify', input]);
      if (verifyFailure) throw new Error('final artifact digest mismatch');
      return '6'.repeat(64);
    }
  };
  return {
    calls,
    statusCalls,
    artifactCalls,
    releaseSha,
    run: (environmentOverrides = {}) => runReleasePreflight({
      environment: {
        GITHUB_ACTIONS: 'true',
        GITHUB_EVENT_NAME: 'workflow_dispatch',
        GITHUB_RUN_ID: '12345',
        RUNNER_TEMP: '/tmp',
        ...environmentOverrides
      },
      operations,
      releaseSha,
      releaseTag: 'v0.1.0'
    })
  };
}

test('release preflight refreshes remote main and verifies the complete immutable artifact contract', async () => {
  const fixture = mockPreflight();
  const result = await fixture.run();
  assert.equal(result.releaseSha, fixture.releaseSha);
  assert.equal(result.packageVersion, '0.1.0');
  assert.equal(result.providerFingerprint, '5'.repeat(64));
  assert.deepEqual(fixture.calls.map(([, args]) => args[0]), [
    'remote', 'rev-parse', 'ls-remote', 'show', 'show', 'show'
  ]);
  assert.ok(fixture.calls.some(([, args]) => args[0] === 'rev-parse' && args.at(-1) === 'refs/remotes/origin/main^{commit}'));
  assert.deepEqual(fixture.statusCalls.map((args) => args[0]), ['show-ref', 'fetch', 'merge-base']);
  assert.deepEqual(fixture.statusCalls[1], [
    'fetch', '--no-tags', 'origin', 'refs/heads/main:refs/remotes/origin/main'
  ]);
  assert.equal(fixture.artifactCalls[0][0], 'prepare');
  assert.equal(fixture.artifactCalls[0][1].token, 'a'.repeat(32));
  assert.equal(fixture.artifactCalls[1][0], 'verify');
  assert.deepEqual(fixture.artifactCalls[2], ['smoke', {
    analyticsMode: 'enabled',
    analyticsProvider: 'cloudflare-web-analytics',
    directory: '/tmp/release-preflight-test/artifact',
    packageVersion: '0.1.0',
    providerFingerprint: '5'.repeat(64)
  }]);
});

test('release preflight accepts the canonical Actions checkout origin without a dot-git suffix', async () => {
  const fixture = mockPreflight({ origin: 'https://github.com/herehigher/resume' });
  const result = await fixture.run();
  assert.equal(result.releaseSha, fixture.releaseSha);
});

test('release preflight fails closed for stale main, network failure, tag conflict, and missing runner provider value', async () => {
  await assert.rejects(mockPreflight({ statusOverrides: { 'merge-base': 1 } }).run(), /not on origin\/main/);
  await assert.rejects(mockPreflight({ statusOverrides: { fetch: 1 } }).run(), /unable to refresh remote main/);
  await assert.rejects(mockPreflight({ commandFailure: (_name, args) => args[0] === 'ls-remote' }).run(), /simulated command failure/);
  await assert.rejects(mockPreflight({ remoteTag: 'deadbeef\trefs/tags/v0.1.0' }).run(), /already exists remotely/);
  await assert.rejects(mockPreflight({ statusOverrides: { 'show-ref': 0 } }).run(), /tag already exists locally/);
  await assert.rejects(mockPreflight({ version: '0.1.1' }).run(), /does not match package version/);
  await assert.rejects(
    mockPreflight({ providerToken: '' }).run(),
    /provider variable is unavailable in the GitHub pre-tag runner/
  );
  await assert.rejects(mockPreflight({ verifyFailure: true }).run(), /final artifact digest mismatch/);
});

test('release preflight rejects non-runner execution before queries or artifact work', async () => {
  for (const environment of [
    { GITHUB_ACTIONS: 'false' },
    { GITHUB_EVENT_NAME: 'push' },
    { GITHUB_RUN_ID: '' },
    { RUNNER_TEMP: 'relative/temp' }
  ]) {
    const fixture = mockPreflight();
    await assert.rejects(fixture.run(environment), /GitHub pre-tag|runner metadata/);
    assert.deepEqual(fixture.calls, []);
    assert.deepEqual(fixture.statusCalls, []);
    assert.deepEqual(fixture.artifactCalls, []);
  }
});

test('release preflight never queries, returns, or prints a raw provider token and contains no release mutation command', async () => {
  const token = 'b'.repeat(32);
  const result = await mockPreflight({ providerToken: token }).run();
  assert.doesNotMatch(JSON.stringify(result), new RegExp(token));
  const preflight = readFileSync(path.join(root, 'scripts/release-preflight.mjs'), 'utf8');
  assert.doesNotMatch(preflight, /git tag|git push|gh variable (?:get|set)|workflow run/);
  assert.doesNotMatch(preflight, /readProviderToken/);
  assert.doesNotMatch(preflight, /environment\.CLOUDFLARE_WEB_ANALYTICS_TOKEN/);
  assert.doesNotMatch(preflight, /console\.log\([^\n]*token/i);
});

test('workflows retain security options while using maintained Node 24 action majors', () => {
  for (const file of ['.github/workflows/ci.yml', '.github/workflows/deploy-pages.yml']) {
    const workflow = readFileSync(path.join(root, file), 'utf8');
    assert.match(workflow, /actions\/checkout@v7/);
    assert.match(workflow, /actions\/setup-node@v7/);
    assert.match(workflow, /persist-credentials: false/);
  }
  const ci = readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8');
  const deploy = readFileSync(path.join(root, '.github/workflows/deploy-pages.yml'), 'utf8');
  assert.match(ci, /actions\/upload-artifact@v7/);
  assert.match(deploy, /actions\/upload-pages-artifact@v5/);
  assert.match(deploy, /actions\/configure-pages@v6/);
  assert.match(deploy, /actions\/deploy-pages@v5/);
  assert.match(ci, /lfs: true/);
  assert.match(ci, /cache: npm/);
  assert.match(deploy, /id-token: write\s*\n\s*pages: write/);
});
