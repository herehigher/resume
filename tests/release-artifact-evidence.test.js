import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  createArtifactEvidence,
  verifyArtifactEvidence,
  writeArtifactEvidence
} from '../scripts/release-artifact-evidence.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const command = path.join(root, 'scripts/release-artifact-evidence.mjs');

function fixture(t) {
  const temporary = mkdtempSync(path.join(os.tmpdir(), 'resume-artifact-evidence-'));
  t.after(() => rmSync(temporary, { force: true, recursive: true }));
  const source = path.join(temporary, 'source');
  const artifact = path.join(temporary, 'artifact');
  cpSync(path.join(root, 'site'), artifact, { recursive: true });
  cpSync(path.join(root, 'site'), path.join(source, 'site'), { recursive: true });
  writeFileSync(path.join(source, 'package.json'), readFileSync(path.join(root, 'package.json')));
  return { artifact, evidence: path.join(temporary, 'release-evidence.json'), source };
}

test('artifact evidence binds immutable bytes, package version, and source SHA', async (t) => {
  const { artifact, evidence, source } = fixture(t);
  const sha = 'a'.repeat(40);
  const created = await writeArtifactEvidence({ artifactDirectory: artifact, outputPath: evidence, sourceDirectory: source, sourceSha: sha });
  const verified = await verifyArtifactEvidence({ artifactDirectory: artifact, evidencePath: evidence, sourceDirectory: source, sourceSha: sha });
  assert.deepEqual(verified, created);
});

test('artifact evidence rejects mismatched source, artifact, and resume attempts', async (t) => {
  const { artifact, evidence, source } = fixture(t);
  const sha = 'b'.repeat(40);
  await writeArtifactEvidence({ artifactDirectory: artifact, outputPath: evidence, sourceDirectory: source, sourceSha: sha });
  await assert.rejects(verifyArtifactEvidence({ artifactDirectory: artifact, evidencePath: evidence, sourceDirectory: source, sourceSha: 'c'.repeat(40) }), /different source SHA/);
  writeFileSync(path.join(artifact, 'index.html'), `${readFileSync(path.join(artifact, 'index.html'), 'utf8')}\n`);
  await assert.rejects(verifyArtifactEvidence({ artifactDirectory: artifact, evidencePath: evidence, sourceDirectory: source, sourceSha: sha }), /artifact bytes/);
});

test('artifact evidence refuses to overwrite a prepared record', async (t) => {
  const { artifact, evidence, source } = fixture(t);
  const sha = 'd'.repeat(40);
  await writeArtifactEvidence({ artifactDirectory: artifact, outputPath: evidence, sourceDirectory: source, sourceSha: sha });
  await assert.rejects(writeArtifactEvidence({ artifactDirectory: artifact, outputPath: evidence, sourceDirectory: source, sourceSha: sha }), /EEXIST/);
  const derived = await createArtifactEvidence({ artifactDirectory: artifact, sourceDirectory: source, sourceSha: sha });
  assert.equal(derived.sourceSha, sha);
});

test('artifact evidence CLI succeeds, resumes, and rejects an artifact mismatch', (t) => {
  const { artifact, evidence, source } = fixture(t);
  const sha = 'e'.repeat(40);
  const invoke = (verb, inputSha = sha) => spawnSync(process.execPath, [command, verb,
    '--artifact-dir', artifact, '--evidence', evidence, '--source-dir', source, '--source-sha', inputSha
  ], { encoding: 'utf8' });
  const created = invoke('create');
  assert.equal(created.status, 0, created.stderr);
  const resumed = invoke('verify');
  assert.equal(resumed.status, 0, resumed.stderr);
  writeFileSync(path.join(artifact, 'index.html'), `${readFileSync(path.join(artifact, 'index.html'), 'utf8')}\n`);
  const mismatch = invoke('verify');
  assert.notEqual(mismatch.status, 0);
  assert.match(mismatch.stderr, /artifact bytes/);
});
