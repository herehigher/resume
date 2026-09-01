import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { isStableReleaseTag, validateReleaseRef } from '../scripts/validate-release-ref.mjs';

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function createRepository({ annotated = false, version = '0.1.0' } = {}) {
  const cwd = mkdtempSync(path.join(tmpdir(), 'resume-release-ref-'));
  git(cwd, 'init', '--initial-branch=main');
  git(cwd, 'config', 'user.name', 'Release Test');
  git(cwd, 'config', 'user.email', 'release@example.invalid');
  git(cwd, 'config', 'commit.gpgSign', 'false');
  git(cwd, 'config', 'tag.gpgSign', 'false');
  writeFileSync(path.join(cwd, 'package.json'), `${JSON.stringify({ version })}\n`);
  git(cwd, 'add', 'package.json');
  git(cwd, 'commit', '-m', 'release fixture');
  git(cwd, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
  const releaseTag = `v${version}`;
  if (annotated) git(cwd, 'tag', '-a', releaseTag, '-m', releaseTag);
  else git(cwd, 'tag', releaseTag);
  return { cwd, releaseTag };
}

function validatePush(cwd, releaseTag, eventSha = git(cwd, 'rev-parse', releaseTag)) {
  return validateReleaseRef({
    cwd,
    defaultBranch: 'main',
    eventName: 'push',
    eventRef: `refs/tags/${releaseTag}`,
    eventSha
  });
}

test('stable release tags accept only vMAJOR.MINOR.PATCH without leading zeroes', () => {
  for (const tag of ['v0.1.0', 'v1.20.300', 'v999.0.4']) assert.equal(isStableReleaseTag(tag), true, tag);
  for (const tag of [
    'v01.2.3',
    'v1.02.3',
    'v1.2.03',
    'v1.2',
    'v1.2.3.4',
    'v1.2.3-rc.1',
    'v1.2.3+build.1',
    'v1.2.3\nmain',
    'refs/tags/v1.2.3',
    'v1.2.3^{commit}',
    '--help'
  ]) assert.equal(isStableReleaseTag(tag), false, tag);
});

test('lightweight and annotated tag push objects peel to the same full commit SHA', () => {
  for (const annotated of [false, true]) {
    const { cwd, releaseTag } = createRepository({ annotated });
    const release = validatePush(cwd, releaseTag);
    assert.match(release.releaseSha, /^[0-9a-f]{40}$/);
    assert.equal(release.releaseSha, git(cwd, 'rev-parse', `${releaseTag}^{commit}`));
  }
});

test('manual release resolves an existing tag only from the default branch', () => {
  const { cwd, releaseTag } = createRepository();
  const release = validateReleaseRef({
    cwd,
    defaultBranch: 'main',
    eventName: 'workflow_dispatch',
    eventRef: 'refs/heads/main',
    eventSha: git(cwd, 'rev-parse', 'HEAD'),
    manualTag: releaseTag
  });
  assert.equal(release.releaseTag, releaseTag);
  assert.match(release.releaseSha, /^[0-9a-f]{40}$/);

  assert.throws(() => validateReleaseRef({
    cwd,
    defaultBranch: 'main',
    eventName: 'workflow_dispatch',
    eventRef: 'refs/heads/feature',
    eventSha: git(cwd, 'rev-parse', 'HEAD'),
    manualTag: releaseTag
  }), /default branch/);
  assert.throws(() => validateReleaseRef({
    cwd,
    defaultBranch: 'main',
    eventName: 'workflow_dispatch',
    eventRef: 'refs/heads/main',
    eventSha: git(cwd, 'rev-parse', 'HEAD'),
    manualTag: 'v9.9.9'
  }));
});

test('release validation rejects package mismatch, divergent commits, and mismatched push objects', () => {
  const mismatch = createRepository();
  git(mismatch.cwd, 'tag', 'v0.1.1');
  assert.throws(() => validatePush(mismatch.cwd, 'v0.1.1'), /does not match package version/);

  const divergent = createRepository();
  git(divergent.cwd, 'switch', '--quiet', '--orphan', 'feature');
  writeFileSync(path.join(divergent.cwd, 'package.json'), `${JSON.stringify({ version: '0.2.0' })}\n`);
  git(divergent.cwd, 'add', 'package.json');
  git(divergent.cwd, 'commit', '-m', 'divergent release');
  git(divergent.cwd, 'tag', 'v0.2.0');
  assert.throws(() => validatePush(divergent.cwd, 'v0.2.0'));

  const wrongObject = createRepository();
  writeFileSync(path.join(wrongObject.cwd, 'note.txt'), 'other\n');
  git(wrongObject.cwd, 'add', 'note.txt');
  git(wrongObject.cwd, 'commit', '-m', 'other commit');
  assert.throws(
    () => validatePush(wrongObject.cwd, wrongObject.releaseTag, git(wrongObject.cwd, 'rev-parse', 'HEAD')),
    /different commits/
  );
});
