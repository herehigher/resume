import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  assertArtifactManifestProvenance,
  assertCandidateSource,
  parseArguments,
  resolvePromotionIdentity,
  selectExactArtifact,
  selectQualityRun
} from '../scripts/promote-pr-doc-assets.mjs';

const candidateSha = 'a'.repeat(40);
const mergeSha = 'b'.repeat(40);
const repository = { id: 1, full_name: 'herehigher/resume' };
const workflow = { id: 17, path: '.github/workflows/ci.yml' };
const pullRequest = {
  base: { repo: repository }, head: { ref: 'release-v0.2.8', repo: repository, sha: candidateSha }, number: 167, state: 'open'
};
const run = {
  conclusion: 'success', event: 'pull_request', head_branch: 'release-v0.2.8', head_repository: repository,
  head_sha: mergeSha, id: 34478079250, path: workflow.path, pull_requests: [{ number: 167 }], repository,
  status: 'completed', workflow_id: workflow.id
};
const artifact = {
  expired: false, name: `documentation-assets-${mergeSha}`,
  workflow_run: { head_sha: mergeSha, id: run.id }
};

test('promotion identity accepts the PR merge artifact when branch HEAD differs', () => {
  const identity = resolvePromotionIdentity({ artifact, mergeSha, pullRequest, run, workflow });
  assert.equal(identity.candidateSha, candidateSha);
  assert.equal(identity.mergeSha, mergeSha);
  assert.notEqual(identity.candidateSha, identity.mergeSha);
  assert.equal(identity.qualityRunId, '34478079250');
  assertArtifactManifestProvenance({
    artifactName: artifact.name, checkoutCommit: mergeSha, qualityRunId: '34478079250'
  }, identity);
});

test('promotion fails closed for run, artifact, and manifest provenance mismatches', () => {
  assert.throws(() => resolvePromotionIdentity({
    artifact, mergeSha, pullRequest, run: { ...run, head_sha: candidateSha }, workflow
  }), /merge commit/);
  assert.throws(() => resolvePromotionIdentity({
    artifact: { ...artifact, name: `documentation-assets-${candidateSha}` }, mergeSha, pullRequest, run, workflow
  }), /artifact/);
  const identity = resolvePromotionIdentity({ artifact, mergeSha, pullRequest, run, workflow });
  assert.throws(() => assertArtifactManifestProvenance({
    artifactName: artifact.name, checkoutCommit: candidateSha, qualityRunId: identity.qualityRunId
  }, identity), /manifest provenance/);
});

test('promotion refuses empty, multiple, and expired run or artifact selections', () => {
  assert.throws(() => selectQualityRun([], pullRequest, mergeSha), /exactly one successful Quality run/);
  assert.throws(() => selectQualityRun([run, run], pullRequest, mergeSha), /exactly one successful Quality run/);
  assert.equal(selectQualityRun([run], pullRequest, mergeSha), run);
  assert.throws(() => selectExactArtifact([], run.id, mergeSha), /exactly one documentation artifact/);
  assert.throws(() => selectExactArtifact([artifact, artifact], run.id, mergeSha), /exactly one documentation artifact/);
  assert.throws(() => selectExactArtifact([{ ...artifact, expired: true }], run.id, mergeSha), /has expired/);
});

test('promotion accepts exactly one identifier and rejects a dirty candidate source', async (t) => {
  assert.deepEqual(parseArguments(['--pr', '167']), { pr: '167' });
  assert.deepEqual(parseArguments(['--quality-run-id', '34478079250']), { 'quality-run-id': '34478079250' });
  assert.throws(() => parseArguments(['--pr', '167', '--quality-run-id', '34478079250']), /exactly one/);

  const sourceRoot = await mkdtemp(path.join(os.tmpdir(), 'resume-pr-doc-assets-source-'));
  t.after(() => rm(sourceRoot, { force: true, recursive: true }));
  await mkdir(path.join(sourceRoot, 'site'));
  await writeFile(path.join(sourceRoot, 'site/index.html'), '<title>fixture</title>');
  execFileSync('git', ['init', '--initial-branch=main'], { cwd: sourceRoot, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.name', 'Promotion Test'], { cwd: sourceRoot });
  execFileSync('git', ['config', 'user.email', 'promotion@example.invalid'], { cwd: sourceRoot });
  execFileSync('git', ['add', 'site/index.html'], { cwd: sourceRoot });
  execFileSync('git', ['-c', 'commit.gpgSign=false', 'commit', '-m', 'fixture'], { cwd: sourceRoot, stdio: 'ignore' });
  const sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: sourceRoot, encoding: 'utf8' }).trim();
  assert.equal(assertCandidateSource(sourceRoot, sha), sha);
  assert.throws(() => assertCandidateSource(sourceRoot, candidateSha), /source SHA does not match/);

  await writeFile(path.join(sourceRoot, 'site/index.html'), '<title>dirty</title>');
  assert.throws(() => assertCandidateSource(sourceRoot, sha), /uncommitted site, package, or generator changes/);
});
