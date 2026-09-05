import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { writeArtifactEvidence } from '../scripts/release-artifact-evidence.mjs';
import { ensureImmutableReleaseTag, validateRollbackTag } from '../scripts/release-publication.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const command = path.join(root, 'scripts/release-publication.mjs');

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function fixture(t) {
  const cwd = mkdtempSync(path.join(os.tmpdir(), 'resume-publication-'));
  t.after(() => rmSync(cwd, { force: true, recursive: true }));
  cpSync(path.join(root, 'site'), path.join(cwd, 'site'), { recursive: true });
  writeFileSync(path.join(cwd, 'package.json'), readFileSync(path.join(root, 'package.json')));
  git(cwd, 'init', '--initial-branch=main');
  git(cwd, 'config', 'user.email', 'release@example.invalid');
  git(cwd, 'config', 'user.name', 'Release test');
  git(cwd, 'add', '.');
  git(cwd, 'commit', '--no-gpg-sign', '-m', 'release fixture');
  const sha = git(cwd, 'rev-parse', 'HEAD');
  const artifact = path.join(cwd, 'artifact');
  cpSync(path.join(cwd, 'site'), artifact, { recursive: true });
  return { artifact, cwd, evidence: path.join(cwd, 'release-evidence.json'), sha };
}

test('publication creates an immutable tag and safely resumes the same tag', async (t) => {
  const { artifact, cwd, evidence, sha } = fixture(t);
  await writeArtifactEvidence({ artifactDirectory: artifact, outputPath: evidence, sourceDirectory: cwd, sourceSha: sha });
  const created = await ensureImmutableReleaseTag({ artifactDirectory: artifact, cwd, evidencePath: evidence, sourceDirectory: cwd, sourceSha: sha, tag: 'v0.2.2' });
  assert.equal(created.resumed, false);
  const resumed = await ensureImmutableReleaseTag({ artifactDirectory: artifact, cwd, evidencePath: evidence, sourceDirectory: cwd, sourceSha: sha, tag: 'v0.2.2' });
  assert.equal(resumed.resumed, true);
});

test('publication rejects tag and artifact mismatches', async (t) => {
  const { artifact, cwd, evidence, sha } = fixture(t);
  await writeArtifactEvidence({ artifactDirectory: artifact, outputPath: evidence, sourceDirectory: cwd, sourceSha: sha });
  await assert.rejects(ensureImmutableReleaseTag({ artifactDirectory: artifact, cwd, evidencePath: evidence, sourceDirectory: cwd, sourceSha: sha, tag: 'v9.9.9' }), /does not match/);
  git(cwd, '-c', 'tag.gpgSign=false', 'tag', '-a', 'v0.2.2', '-m', 'wrong', 'HEAD');
  writeFileSync(path.join(cwd, 'site', 'index.html'), `${readFileSync(path.join(cwd, 'site', 'index.html'), 'utf8')}\n`);
  await assert.rejects(ensureImmutableReleaseTag({ artifactDirectory: artifact, cwd, evidencePath: evidence, sourceDirectory: cwd, sourceSha: sha, tag: 'v0.2.2' }), /source bytes/);
});

test('publication CLI accepts only historical rollback targets and excludes v0.2.1', () => {
  assert.equal(validateRollbackTag('v0.2.2'), 'v0.2.2');
  assert.throws(() => validateRollbackTag('v0.2.1'), /not an accepted/);
  const rejected = spawnSync(process.execPath, [command, 'rollback', '--tag', 'v0.2.1'], { encoding: 'utf8' });
  assert.notEqual(rejected.status, 0);
  assert.match(rejected.stderr, /not an accepted/);
});
