import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { writeArtifactEvidence } from '../scripts/release-artifact-evidence.mjs';
import { ensureImmutableReleaseTag, validateRollbackTag } from '../scripts/release-publication.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const command = path.join(root, 'scripts/release-publication.mjs');
const analytics = { analyticsMode: 'enabled', analyticsProvider: 'cloudflare-web-analytics' };

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function fixture(t) {
  const cwd = mkdtempSync(path.join(os.tmpdir(), 'resume-publication-'));
  t.after(() => rmSync(cwd, { force: true, recursive: true }));
  mkdirSync(path.join(cwd, 'site'));
  writeFileSync(path.join(cwd, 'site/index.html'), '<p>Fictional release fixture</p>');
  writeFileSync(path.join(cwd, 'package.json'), JSON.stringify({ version: '7.4.2' }));
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
  await writeArtifactEvidence({ ...analytics, artifactDirectory: artifact, outputPath: evidence, sourceDirectory: cwd, sourceSha: sha });
  const created = await ensureImmutableReleaseTag({ artifactDirectory: artifact, cwd, evidencePath: evidence, sourceDirectory: cwd, sourceSha: sha, tag: 'v7.4.2' });
  assert.equal(created.resumed, false);
  const resumed = await ensureImmutableReleaseTag({ artifactDirectory: artifact, cwd, evidencePath: evidence, sourceDirectory: cwd, sourceSha: sha, tag: 'v7.4.2' });
  assert.equal(resumed.resumed, true);
});

test('publication rejects tag and artifact mismatches', async (t) => {
  const { artifact, cwd, evidence, sha } = fixture(t);
  await writeArtifactEvidence({ ...analytics, artifactDirectory: artifact, outputPath: evidence, sourceDirectory: cwd, sourceSha: sha });
  await assert.rejects(ensureImmutableReleaseTag({ artifactDirectory: artifact, cwd, evidencePath: evidence, sourceDirectory: cwd, sourceSha: sha, tag: 'v9.9.9' }), /does not match/);
  writeFileSync(path.join(cwd, 'different.txt'), 'different commit\n');
  git(cwd, 'add', 'different.txt');
  git(cwd, 'commit', '--no-gpg-sign', '-m', 'different commit');
  const differentSha = git(cwd, 'rev-parse', 'HEAD');
  git(cwd, '-c', 'tag.gpgSign=false', 'tag', '-a', 'v7.4.2', '-m', 'wrong', differentSha);
  await assert.rejects(ensureImmutableReleaseTag({ artifactDirectory: artifact, cwd, evidencePath: evidence, sourceDirectory: cwd, sourceSha: sha, tag: 'v7.4.2' }), /different commit/);
});

test('publication CLI accepts only historical rollback targets and excludes v0.2.1', () => {
  assert.equal(validateRollbackTag('v0.2.2'), 'v0.2.2');
  assert.throws(() => validateRollbackTag('v0.2.1'), /not an accepted/);
  assert.throws(() => validateRollbackTag('v0.2.0'), /incompatible legacy/);
  const rejected = spawnSync(process.execPath, [command, 'rollback', '--tag', 'v0.2.1'], { encoding: 'utf8' });
  assert.notEqual(rejected.status, 0);
  assert.match(rejected.stderr, /not an accepted/);
});

test('publication CLI creates and resumes a real annotated tag from a temporary artifact', async (t) => {
  const { artifact, cwd, evidence, sha } = fixture(t);
  await writeArtifactEvidence({ ...analytics, artifactDirectory: artifact, outputPath: evidence, sourceDirectory: cwd, sourceSha: sha });
  const invoke = () => spawnSync(process.execPath, [command, 'publish',
    '--artifact-dir', artifact, '--cwd', cwd, '--evidence', evidence,
    '--source-dir', cwd, '--source-sha', sha, '--tag', 'v7.4.2'
  ], { encoding: 'utf8' });
  const created = invoke();
  assert.equal(created.status, 0, created.stderr);
  assert.match(created.stdout, /Created immutable v7\.4\.2/);
  assert.equal(git(cwd, 'rev-parse', 'v7.4.2^{commit}'), sha);
  const resumed = invoke();
  assert.equal(resumed.status, 0, resumed.stderr);
  assert.match(resumed.stdout, /Resumed immutable v7\.4\.2/);
});
