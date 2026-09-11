import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  compareStableSemVer,
  formatPreflightSummary,
  parseArguments,
  runReleasePreflight
} from '../scripts/release-preflight.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const script = path.join(root, 'scripts/release-preflight.mjs');
const repository = { id: 1, full_name: 'herehigher/resume' };

function git(directory, ...args) {
  return execFileSync('git', args, {
    cwd: directory, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']
  }).trim();
}

function writePackage(directory, version) {
  writeFileSync(path.join(directory, 'package.json'), `${JSON.stringify({ name: 'fixture', version })}\n`);
}

function commit(directory, message) {
  git(directory, 'add', '.');
  git(directory, '-c', 'commit.gpgSign=false', 'commit', '-m', message);
}

function createFixture({ version = '0.2.8' } = {}) {
  const temporaryRoot = mkdtempSync(path.join(os.tmpdir(), 'resume-release-preflight-'));
  const remote = path.join(temporaryRoot, 'remote.git');
  const source = path.join(temporaryRoot, 'source');
  const candidate = path.join(temporaryRoot, 'candidate');
  git(temporaryRoot, 'init', '--bare', '--initial-branch=main', remote);
  git(temporaryRoot, 'clone', remote, source);
  git(source, 'config', 'user.name', 'Release Preflight Fixture');
  git(source, 'config', 'user.email', 'release-preflight@example.invalid');
  writePackage(source, version);
  writeFileSync(path.join(source, 'tracked.txt'), 'tracked\n');
  commit(source, 'base');
  git(source, 'push', 'origin', 'main');
  git(temporaryRoot, 'clone', remote, candidate);
  return { candidate, remote, source, temporaryRoot };
}

function githubApi(pullRequests = []) {
  return (endpoint, paginate) => {
    assert.equal(endpoint === '' || endpoint.startsWith('pulls?state=open&per_page=100'), true);
    if (endpoint === '') return repository;
    assert.equal(paginate, true);
    return [pullRequests];
  };
}

function fixtureDependencies(api = githubApi()) {
  return {
    api,
    git(directory, args) {
      if (args[0] === 'remote' && args[1] === 'get-url') return 'https://github.com/herehigher/resume.git';
      return git(directory, ...args);
    }
  };
}

function expectFailure(action, expected) {
  assert.throws(action, (error) => {
    assert.equal(error.status, expected.status);
    assert.equal(error.check, expected.check);
    assert.equal(error.reason, expected.reason);
    return true;
  });
}

test('release preflight accepts a clean, current main checkout with an unused stable target', (t) => {
  const fixture = createFixture();
  t.after(() => rmSync(fixture.temporaryRoot, { force: true, recursive: true }));

  const result = runReleasePreflight({
    dependencies: fixtureDependencies(), rootDirectory: fixture.candidate, targetVersion: '0.2.9'
  });

  assert.deepEqual(result, {
    baseSha: git(fixture.candidate, 'rev-parse', 'HEAD'), currentVersion: '0.2.8', status: 'pass', targetVersion: '0.2.9'
  });
});

test('release preflight fetches origin/main and refuses stale main or a feature checkout with the latest SHA', (t) => {
  const stale = createFixture();
  const feature = createFixture();
  t.after(() => rmSync(stale.temporaryRoot, { force: true, recursive: true }));
  t.after(() => rmSync(feature.temporaryRoot, { force: true, recursive: true }));

  writeFileSync(path.join(stale.source, 'remote-update.txt'), 'latest\n');
  commit(stale.source, 'remote update');
  git(stale.source, 'push', 'origin', 'main');
  const latestSha = git(stale.source, 'rev-parse', 'HEAD');
  expectFailure(
    () => runReleasePreflight({
      dependencies: fixtureDependencies(), rootDirectory: stale.candidate, targetVersion: '0.2.9'
    }),
    { check: 'origin-main', reason: 'checkout-not-current', status: 'deferred' }
  );
  try {
    runReleasePreflight({ dependencies: fixtureDependencies(), rootDirectory: stale.candidate, targetVersion: '0.2.9' });
  } catch (error) {
    assert.equal(error.baseSha, latestSha);
  }

  git(feature.candidate, 'checkout', '-b', 'feature-fixture');
  const featureLatestSha = git(feature.candidate, 'rev-parse', 'HEAD');
  try {
    runReleasePreflight({ dependencies: fixtureDependencies(), rootDirectory: feature.candidate, targetVersion: '0.2.9' });
    assert.fail('feature branch must not pass preflight');
  } catch (error) {
    assert.equal(error.check, 'origin-main');
    assert.equal(error.baseSha, featureLatestSha);
  }
});

test('release preflight rejects non-increasing and prerelease target versions before repository mutation', (t) => {
  const fixture = createFixture();
  t.after(() => rmSync(fixture.temporaryRoot, { force: true, recursive: true }));

  expectFailure(
    () => runReleasePreflight({ dependencies: fixtureDependencies(), rootDirectory: fixture.candidate, targetVersion: '0.2.8' }),
    { check: 'target-version', reason: 'not-greater', status: 'deferred' }
  );
  expectFailure(
    () => runReleasePreflight({ dependencies: fixtureDependencies(), rootDirectory: fixture.candidate, targetVersion: '0.2.9-rc.1' }),
    { check: 'target-version', reason: 'invalid', status: 'deferred' }
  );
  assert.equal(readFileSync(path.join(fixture.candidate, 'package.json'), 'utf8').includes('0.2.8'), true);
});

test('release preflight refuses an existing exact remote tag without consulting releases', (t) => {
  const fixture = createFixture();
  t.after(() => rmSync(fixture.temporaryRoot, { force: true, recursive: true }));
  git(fixture.source, 'tag', 'v0.2.9');
  git(fixture.source, 'push', 'origin', 'refs/tags/v0.2.9');

  expectFailure(
    () => runReleasePreflight({ dependencies: fixtureDependencies(), rootDirectory: fixture.candidate, targetVersion: '0.2.9' }),
    { check: 'tag', reason: 'already-exists', status: 'deferred' }
  );
});

test('release preflight refuses duplicate target-version and release-branch open pull requests', (t) => {
  const fixture = createFixture();
  t.after(() => rmSync(fixture.temporaryRoot, { force: true, recursive: true }));
  const byVersion = [{ head: { ref: 'other' }, number: 17, title: 'release v0.2.9' }];
  expectFailure(
    () => runReleasePreflight({
      dependencies: fixtureDependencies(githubApi(byVersion)), rootDirectory: fixture.candidate, targetVersion: '0.2.9'
    }),
    { check: 'open-pull-request', reason: 'already-exists', status: 'deferred' }
  );
  const byBranch = [{ head: { ref: 'codex/release-v0.2.9' }, number: 18, title: 'unrelated' }];
  expectFailure(
    () => runReleasePreflight({
      dependencies: fixtureDependencies(githubApi(byBranch)), rootDirectory: fixture.candidate, targetVersion: '0.2.9'
    }),
    { check: 'open-pull-request', reason: 'already-exists', status: 'deferred' }
  );
});

test('release preflight blocks malformed paginated open-pull-request responses', (t) => {
  const fixture = createFixture();
  t.after(() => rmSync(fixture.temporaryRoot, { force: true, recursive: true }));
  const malformedPages = [
    [{}],
    [[{ head: { ref: 'other' }, number: 19 }]],
    [[{ head: {}, number: 20, title: 'unrelated' }]]
  ];
  for (const pages of malformedPages) {
    const api = (endpoint) => (endpoint === '' ? repository : pages);
    expectFailure(
      () => runReleasePreflight({
        dependencies: fixtureDependencies(api), rootDirectory: fixture.candidate, targetVersion: '0.2.9'
      }),
      { check: 'open-pull-request', reason: 'unavailable', status: 'blocked' }
    );
  }
});

test('release preflight preserves untracked files, permits only exact explicit allowlist entries, and rejects staging', (t) => {
  const fixture = createFixture();
  t.after(() => rmSync(fixture.temporaryRoot, { force: true, recursive: true }));
  const untracked = path.join(fixture.candidate, 'local-only.txt');
  writeFileSync(untracked, 'preserve me\n');

  expectFailure(
    () => runReleasePreflight({ dependencies: fixtureDependencies(), rootDirectory: fixture.candidate, targetVersion: '0.2.9' }),
    { check: 'untracked-worktree', reason: 'not-allowlisted', status: 'deferred' }
  );
  assert.equal(existsSync(untracked), true);
  assert.equal(readFileSync(untracked, 'utf8'), 'preserve me\n');
  assert.equal(runReleasePreflight({
    allowUntracked: ['local-only.txt'], dependencies: fixtureDependencies(), rootDirectory: fixture.candidate, targetVersion: '0.2.9'
  }).status, 'pass');
  expectFailure(
    () => runReleasePreflight({
      allowUntracked: ['local-only\\..\\escaped.txt'], dependencies: fixtureDependencies(), rootDirectory: fixture.candidate, targetVersion: '0.2.9'
    }),
    { check: 'untracked-worktree', reason: 'invalid-allowlist', status: 'deferred' }
  );
  git(fixture.candidate, 'add', 'local-only.txt');
  expectFailure(
    () => runReleasePreflight({ dependencies: fixtureDependencies(), rootDirectory: fixture.candidate, targetVersion: '0.2.9' }),
    { check: 'tracked-worktree', reason: 'not-clean', status: 'deferred' }
  );
});

test('release preflight fails closed with a credential-free blocked summary when GitHub capability is unavailable', (t) => {
  const fixture = createFixture();
  t.after(() => rmSync(fixture.temporaryRoot, { force: true, recursive: true }));
  let failure;
  try {
    runReleasePreflight({
      dependencies: fixtureDependencies(() => { throw new Error('token=very-secret backend output'); }),
      rootDirectory: fixture.candidate,
      targetVersion: '0.2.9'
    });
  } catch (error) {
    failure = error;
  }
  assert.equal(failure.status, 'blocked');
  assert.equal(failure.check, 'github-session');
  const summary = formatPreflightSummary(failure);
  assert.match(summary, /"status":"blocked"/);
  assert.doesNotMatch(summary, /very-secret|token|backend output/);
});

test('release preflight classifies an unavailable origin/main fetch as blocked', (t) => {
  const fixture = createFixture();
  t.after(() => rmSync(fixture.temporaryRoot, { force: true, recursive: true }));
  const dependencies = fixtureDependencies();
  const realGit = dependencies.git;
  dependencies.git = (directory, args) => {
    if (args[0] === 'fetch') throw new Error('remote backend output must remain private');
    return realGit(directory, args);
  };

  expectFailure(
    () => runReleasePreflight({ dependencies, rootDirectory: fixture.candidate, targetVersion: '0.2.9' }),
    { check: 'origin-main', reason: 'unavailable', status: 'blocked' }
  );
});

test('release preflight argument and SemVer helpers accept only stable, exact values', () => {
  assert.equal(compareStableSemVer('0.2.9', '0.2.8') > 0, true);
  assert.equal(compareStableSemVer('1.9007199254740993.0', '1.9007199254740992.0') > 0, true);
  assert.equal(compareStableSemVer('1.9007199254740992.0', '1.9007199254740993.0') < 0, true);
  assert.throws(() => compareStableSemVer('0.2.9-rc.1', '0.2.8'), /stable SemVer/);
  assert.deepEqual(parseArguments(['--target', '0.2.9', '--allow-untracked', 'notes.txt']), {
    allowUntracked: ['notes.txt'], targetVersion: '0.2.9'
  });
  assert.throws(() => parseArguments(['--target', '0.2.9-rc.1']), /stable SemVer/);
  assert.throws(() => parseArguments(['--target', '0.2.9', '--allow-untracked', '../notes.txt']), /exact relative/);
  assert.throws(() => parseArguments(['--target', '0.2.9', '--allow-untracked', 'notes\\..\\escaped.txt']), /exact relative/);
  assert.throws(() => parseArguments(['--target', '0.2.9', '--allow-untracked', 'notes//duplicate.txt']), /exact relative/);
});

test('release preflight CLI emits a short structured failure summary without raw command output', () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'resume-release-preflight-cli-'));
  try {
    writePackage(directory, '0.2.8');
    const result = spawnSync(process.execPath, [script, '--target', '0.2.9'], { cwd: directory, encoding: 'utf8' });
    assert.equal(result.status, 1);
    const summary = JSON.parse(result.stdout);
    assert.deepEqual(summary, {
      check: 'git', command: 'release-preflight', current: '0.2.8', reason: 'unavailable', status: 'blocked', target: '0.2.9'
    });
    assert.equal(result.stderr, '');
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
});

test('the release playbook uses the release preflight command as its pre-version entry', () => {
  const playbook = readFileSync(path.join(root, 'docs/release-playbook.md'), 'utf8');
  assert.match(playbook, /唯一の事前確認入口 `npm run release:preflight -- --target VERSION`/);
  assert.match(playbook, /`--allow-untracked PATH`/);
  assert.match(playbook, /Release preflight: `deferred`[\s\S]*summary の `check` \/ `reason`[\s\S]*`pass` になるまで Version 更新へ進まない/);
  assert.match(playbook, /Release preflight: `blocked`[\s\S]*`gh` \/ fetch \/ credential capability を復旧して再実行[\s\S]*成功を推定せず[\s\S]*`pass` になるまで Version 更新へ進まない/);
  assert.match(playbook, /`<<'EOF'`/);
  assert.match(playbook, /--body-file "\$body_file"/);
});
