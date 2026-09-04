import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  hasDirectGitHubTokenVariable,
  parseArguments,
  publishReleaseTag,
  validateTagPublication
} from '../scripts/publish-release-tag.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const repository = 'herehigher/resume';
const tag = 'v0.2.0';

function git(cwd, ...args) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  }).trim();
}

function configureRepository(cwd) {
  git(cwd, 'config', 'user.name', 'Release Fixture');
  git(cwd, 'config', 'user.email', 'release-fixture@example.invalid');
  git(cwd, 'config', 'commit.gpgSign', 'false');
  git(cwd, 'config', 'tag.gpgSign', 'false');
}

function createFixture(t) {
  const directory = mkdtempSync(path.join(tmpdir(), 'resume-tag-publish-'));
  t.after(() => rmSync(directory, { force: true, recursive: true }));
  const remote = path.join(directory, 'remote.git');
  const work = path.join(directory, 'work');
  git(directory, 'init', '--bare', remote);
  git(directory, 'init', '--initial-branch=main', work);
  configureRepository(work);
  writeFileSync(path.join(work, 'package.json'), `${JSON.stringify({ version: '0.2.0' })}\n`);
  git(work, 'add', 'package.json');
  git(work, 'commit', '-m', 'merged release');
  const releaseSha = git(work, 'rev-parse', 'HEAD');
  git(work, 'remote', 'add', 'origin', remote);
  git(work, 'push', 'origin', 'HEAD:refs/heads/main');
  git(work, 'fetch', '--no-tags', 'origin', 'refs/heads/main:refs/remotes/origin/main');
  return { directory, releaseSha, remote, work };
}

function addLaterCommit(fixture) {
  writeFileSync(path.join(fixture.work, 'note.txt'), 'later release state\n');
  git(fixture.work, 'add', 'note.txt');
  git(fixture.work, 'commit', '-m', 'later main commit');
  const sha = git(fixture.work, 'rev-parse', 'HEAD');
  git(fixture.work, 'push', 'origin', 'HEAD:refs/heads/main');
  return sha;
}

function seedRemoteTag(fixture, targetSha, name = tag) {
  const publisher = path.join(fixture.directory, `publisher-${Math.random()}`);
  git(fixture.directory, 'clone', '--quiet', fixture.remote, publisher);
  configureRepository(publisher);
  git(publisher, 'tag', '--annotate', '--no-sign', name, targetSha, '--message', `fixture ${name}`);
  git(publisher, 'push', 'origin', `refs/tags/${name}:refs/tags/${name}`);
}

function fixtureOperations() {
  return {
    originUrl: 'https://github.com/herehigher/resume.git',
    readAccount: async () => ({ login: 'release-owner', permission: 'ADMIN' }),
    verifyPreTagGate: async ({ releaseSha, releaseTag, runId }) => {
      assert.equal(runId, '123');
      assert.equal(releaseTag, tag);
      assert.match(releaseSha, /^[0-9a-f]{40}$/);
      return { runId, url: 'https://github.com/herehigher/resume/actions/runs/123' };
    }
  };
}

function input(fixture, overrides = {}) {
  return {
    cwd: fixture.work,
    environment: {},
    operations: fixtureOperations(),
    preTagGateRunId: '123',
    releaseSha: fixture.releaseSha,
    releaseTag: tag,
    repository,
    ...overrides
  };
}

function localTagSha(cwd, name = tag) {
  return git(cwd, 'rev-parse', `${name}^{commit}`);
}

function hasLocalTag(cwd, name = tag) {
  try {
    git(cwd, 'show-ref', '--verify', '--quiet', `refs/tags/${name}`);
    return true;
  } catch {
    return false;
  }
}

function remoteTagSha(fixture, name = tag) {
  const output = git(fixture.work, 'ls-remote', '--tags', fixture.remote, `refs/tags/${name}`, `refs/tags/${name}^{}`);
  const peeled = output.split('\n').find((line) => line.endsWith(`refs/tags/${name}^{}`));
  return (peeled || output).split('\t')[0];
}

test('tag helper creates an absent local tag and pushes only its exact ref after explicit approval', async (t) => {
  const fixture = createFixture(t);
  const approvals = [];
  const result = await publishReleaseTag({
    ...input(fixture),
    confirm: async (tuple) => {
      approvals.push(tuple);
      return true;
    }
  });

  assert.equal(approvals.length, 1);
  assert.equal(approvals[0].approvalPhrase, `publish ${repository} ${tag} ${fixture.releaseSha} 0.2.0`);
  assert.equal(result.localAction, 'created');
  assert.equal(result.remoteAction, 'published');
  assert.equal(localTagSha(fixture.work), fixture.releaseSha);
  assert.equal(remoteTagSha(fixture), fixture.releaseSha);
});

test('tag helper resumes a matching local tag and recognizes an already-published exact tag', async (t) => {
  const localOnly = createFixture(t);
  git(localOnly.work, 'tag', '--annotate', '--no-sign', tag, localOnly.releaseSha, '--message', 'local fixture');
  const resumed = await publishReleaseTag({ ...input(localOnly), confirm: async () => true });
  assert.deepEqual({ local: resumed.localAction, remote: resumed.remoteAction }, { local: 'resumed', remote: 'published' });
  assert.equal(remoteTagSha(localOnly), localOnly.releaseSha);

  const remoteOnly = createFixture(t);
  seedRemoteTag(remoteOnly, remoteOnly.releaseSha);
  const alreadyPublished = await publishReleaseTag({ ...input(remoteOnly), confirm: async () => true });
  assert.deepEqual(
    { local: alreadyPublished.localAction, remote: alreadyPublished.remoteAction },
    { local: 'created', remote: 'already-published' }
  );
  assert.equal(localTagSha(remoteOnly.work), remoteOnly.releaseSha);
});

test('tag helper fails closed for different local or remote tags', async (t) => {
  const localDifferent = createFixture(t);
  const laterLocal = addLaterCommit(localDifferent);
  git(localDifferent.work, 'tag', '--annotate', '--no-sign', tag, laterLocal, '--message', 'wrong local fixture');
  await assert.rejects(publishReleaseTag({ ...input(localDifferent), confirm: async () => true }), /local tag resolves to a different commit/);

  const remoteDifferent = createFixture(t);
  const laterRemote = addLaterCommit(remoteDifferent);
  seedRemoteTag(remoteDifferent, laterRemote);
  await assert.rejects(publishReleaseTag({ ...input(remoteDifferent), confirm: async () => true }), /remote tag resolves to a different commit/);
});

test('tag helper does not mutate before approval and stops when tag state changes after approval', async (t) => {
  const denied = createFixture(t);
  await assert.rejects(publishReleaseTag({ ...input(denied), confirm: async () => false }), /did not explicitly approve/);
  assert.equal(hasLocalTag(denied.work), false);
  assert.equal(git(denied.work, 'ls-remote', '--tags', denied.remote, `refs/tags/${tag}`), '');

  const changed = createFixture(t);
  const laterSha = addLaterCommit(changed);
  let approvalCount = 0;
  await assert.rejects(publishReleaseTag({
    ...input(changed),
    confirm: async () => {
      approvalCount += 1;
      seedRemoteTag(changed, laterSha);
      return true;
    }
  }), /remote tag resolves to a different commit/);
  assert.equal(approvalCount, 1);
  assert.equal(hasLocalTag(changed.work), false);
});

test('validation requires the official repository, strict tuple, account, and pre-tag gate', async (t) => {
  const fixture = createFixture(t);
  await assert.rejects(validateTagPublication({ ...input(fixture), repository: 'fork/resume' }), /official repository/);
  await assert.rejects(validateTagPublication({ ...input(fixture), releaseTag: 'v0.2.0-rc.1' }), /stable SemVer/);
  await assert.rejects(validateTagPublication({ ...input(fixture), releaseSha: fixture.releaseSha.slice(0, 12) }), /full lowercase/);
  await assert.rejects(validateTagPublication({
    ...input(fixture),
    operations: { ...fixtureOperations(), readAccount: async () => ({ login: 'writer', permission: 'WRITE' }) }
  }), /owner-level access/);
  await assert.rejects(validateTagPublication({
    ...input(fixture),
    operations: { ...fixtureOperations(), verifyPreTagGate: async () => { throw new Error('gate failed'); } }
  }), /gate failed/);
});

function environmentWithDirectToken(name) {
  return new Proxy({}, {
    get() {
      throw new Error('raw environment values must not be read');
    },
    getOwnPropertyDescriptor(_target, property) {
      if (property === name) return { configurable: true, enumerable: true, value: '' };
      return undefined;
    }
  });
}

test('direct token-variable presence always defers without reading the value or mutating', async (t) => {
  for (const name of ['GH_TOKEN', 'GITHUB_TOKEN']) {
    const environment = environmentWithDirectToken(name);
    assert.equal(hasDirectGitHubTokenVariable(environment), true);
  }

  const fixture = createFixture(t);
  let confirmationCalls = 0;
  let commandCalls = 0;
  let commandStatusCalls = 0;
  let accountCalls = 0;
  let gateCalls = 0;
  await assert.rejects(publishReleaseTag({
    ...input(fixture),
    environment: environmentWithDirectToken('GH_TOKEN'),
    confirm: async () => {
      confirmationCalls += 1;
      return true;
    },
    operations: {
      command: () => {
        commandCalls += 1;
        throw new Error('commands must not run after deferral');
      },
      commandStatus: () => {
        commandStatusCalls += 1;
        throw new Error('status commands must not run after deferral');
      },
      readAccount: () => {
        accountCalls += 1;
        throw new Error('account queries must not run after deferral');
      },
      verifyPreTagGate: () => {
        gateCalls += 1;
        throw new Error('gate queries must not run after deferral');
      }
    },
    agentAssisted: false
  }), /deferred to an owner-approved trusted release host/);
  assert.equal(confirmationCalls, 0);
  assert.equal(commandCalls, 0);
  assert.equal(commandStatusCalls, 0);
  assert.equal(accountCalls, 0);
  assert.equal(gateCalls, 0);
  assert.equal(hasLocalTag(fixture.work), false);
  assert.equal(git(fixture.work, 'ls-remote', '--tags', fixture.remote, `refs/tags/${tag}`), '');
});

test('legacy owner-isolated-session flag is rejected', () => {
  assert.throws(
    () => parseArguments(['--owner-isolated-session', '--release-tag', tag, '--release-sha', 'a'.repeat(40), '--pre-tag-gate-run', '123']),
    /invalid command arguments/
  );
});

test('helper uses metadata-only gate verification and keeps token values outside outputs and commands', () => {
  const source = readFileSync(path.join(root, 'scripts/publish-release-tag.mjs'), 'utf8');
  assert.match(source, /Pre-tag artifact gate/);
  assert.match(source, /headBranch,headSha,url,workflowName,displayTitle/);
  assert.match(source, /displayTitle !== `Pre-tag artifact gate: \$\{releaseTag\} -> \$\{releaseSha\}`/);
  assert.match(source, /refs\/tags\/\$\{releaseTag\}:refs\/tags\/\$\{releaseTag\}/);
  assert.match(source, /'repo', 'view', repository, '--json', 'viewerPermission'/);
  assert.doesNotMatch(source, /'repo', 'view', '--repo'/);
  assert.match(source, /Object\.hasOwn\(environment, name\)/);
  assert.doesNotMatch(source, /agentAssisted|owner-isolated-session/);
  assert.doesNotMatch(source, /--log|CLOUDFLARE_WEB_ANALYTICS_TOKEN|gh variable|get.*token|--force|delete-ref|push origin --all/i);
  assert.match(readFileSync(path.join(root, 'package.json'), 'utf8'), /"release:publish-tag"/);

  const workflow = readFileSync(path.join(root, '.github/workflows/pre-tag-artifact-gate.yml'), 'utf8');
  assert.match(workflow, /^run-name: "Pre-tag artifact gate: \$\{\{ inputs\.release_tag \}\} -> \$\{\{ inputs\.release_sha \}\}"$/m);
  assert.doesNotMatch(workflow, /GITHUB_STEP_SUMMARY[\s\S]*CLOUDFLARE_WEB_ANALYTICS_TOKEN/);
});
