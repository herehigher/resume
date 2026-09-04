import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { validatePreTagRelease } from '../scripts/validate-pretag-release.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function createRepository({ version = '0.2.0' } = {}) {
  const cwd = mkdtempSync(path.join(tmpdir(), 'resume-pretag-gate-'));
  git(cwd, 'init', '--initial-branch=main');
  git(cwd, 'config', 'user.name', 'Pre-tag Gate Test');
  git(cwd, 'config', 'user.email', 'pretag@example.invalid');
  git(cwd, 'config', 'commit.gpgSign', 'false');
  writeFileSync(path.join(cwd, 'package.json'), `${JSON.stringify({ version })}\n`);
  git(cwd, 'add', 'package.json');
  git(cwd, 'commit', '-m', 'merged release fixture');
  git(cwd, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
  return { cwd, releaseSha: git(cwd, 'rev-parse', 'HEAD'), releaseTag: `v${version}` };
}

function validate(cwd, { releaseSha, releaseTag }, overrides = {}) {
  return validatePreTagRelease({
    cwd,
    defaultBranch: 'main',
    eventName: 'workflow_dispatch',
    eventRef: 'refs/heads/main',
    eventSha: git(cwd, 'rev-parse', 'HEAD'),
    releaseSha,
    releaseTag,
    repository: 'herehigher/resume',
    ...overrides
  });
}

test('pre-tag gate accepts only a stable versioned merged commit on the dispatched default branch', () => {
  const release = createRepository();
  assert.deepEqual(validate(release.cwd, release), {
    packageVersion: '0.2.0',
    releaseSha: release.releaseSha,
    releaseTag: release.releaseTag
  });
});

test('pre-tag gate fails closed for repository, dispatch, SHA, ancestry, and version failures', () => {
  const release = createRepository();
  assert.throws(() => validate(release.cwd, release, { repository: 'fork/resume' }), /official repository/);
  assert.throws(() => validate(release.cwd, release, { eventName: 'push' }), /manual workflow dispatch/);
  assert.throws(() => validate(release.cwd, release, { eventRef: 'refs/heads/feature' }), /default branch/);
  assert.throws(() => validate(release.cwd, release, { eventSha: 'a'.repeat(40) }), /Needed a single revision/);
  assert.throws(() => validate(release.cwd, { ...release, releaseSha: release.releaseSha.slice(0, 12) }), /full lowercase/);
  assert.throws(() => validate(release.cwd, { ...release, releaseTag: 'v0.2.0-rc.1' }), /stable SemVer/);
  assert.throws(() => validate(release.cwd, { ...release, releaseTag: 'v0.2.1' }), /does not match package version/);

  git(release.cwd, 'switch', '--quiet', '--orphan', 'outside-main');
  writeFileSync(path.join(release.cwd, 'package.json'), `${JSON.stringify({ version: '0.3.0' })}\n`);
  git(release.cwd, 'add', 'package.json');
  git(release.cwd, 'commit', '-m', 'unmerged fixture');
  const unmergedSha = git(release.cwd, 'rev-parse', 'HEAD');
  assert.throws(() => validate(release.cwd, {
    releaseSha: unmergedSha,
    releaseTag: 'v0.3.0'
  }, { eventSha: release.releaseSha }), /Command failed/);
});

test('pre-tag workflow remains read-only and writes only non-secret summary evidence', () => {
  const workflow = readFileSync(path.join(root, '.github/workflows/pre-tag-artifact-gate.yml'), 'utf8');
  assert.match(workflow, /^on:\n {2}workflow_dispatch:/m);
  assert.match(workflow, /release_tag:[\s\S]*required: true/);
  assert.match(workflow, /release_sha:[\s\S]*required: true/);
  assert.match(workflow, /^permissions: \{\}$/m);
  assert.match(workflow, /permissions:\n {6}contents: read/);
  assert.match(workflow, /ref: \$\{\{ github\.sha \}\}[\s\S]*fetch-depth: 0[\s\S]*persist-credentials: false/);
  assert.match(workflow, /ref: \$\{\{ steps\.release\.outputs\.release_sha \}\}/);
  assert.match(workflow, /validate-pretag-release\.mjs/);
  assert.match(workflow, /prepare-pages-artifact\.mjs verify/);
  assert.match(workflow, /validate-pages-smoke\.mjs/);
  assert.match(workflow, /CLOUDFLARE_WEB_ANALYTICS_TOKEN: \$\{\{ vars\.CLOUDFLARE_WEB_ANALYTICS_TOKEN \}\}/);
  assert.match(workflow, /Provider fingerprint:[\s\S]*Artifact digest:[\s\S]*Run:/);
  assert.doesNotMatch(workflow, /upload-artifact|upload-pages-artifact|deploy-pages|git tag|git push|gh issue|gh api/i);
  assert.equal((workflow.match(/vars\.CLOUDFLARE_WEB_ANALYTICS_TOKEN/g) || []).length, 1);
  const summary = workflow.slice(workflow.indexOf('- name: Write non-secret gate summary'));
  assert.doesNotMatch(summary, /CLOUDFLARE_WEB_ANALYTICS_TOKEN/);
});
