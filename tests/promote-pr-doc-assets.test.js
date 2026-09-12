import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync } from 'node:fs';
import { chmod, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { deflateSync } from 'node:zlib';

import { computeGeneratorInputHash, computeSiteHash } from '../scripts/generate-doc-assets.mjs';
import { releaseDocumentationAssetPaths } from '../scripts/release-doc-assets.mjs';
import {
  assertArtifactManifestProvenance,
  assertCandidateSource,
  classifyEvidenceFailure,
  parseCandidateArguments,
  parseArguments,
  promoteCandidateDocumentationAssets,
  resolveCandidateAssetIdentity,
  resolveCandidateDocumentationEvidence,
  promotePullRequestDocumentationAssets,
  resolvePullRequestQualityEvidence,
  resolvePromotionIdentity,
  selectExactArtifact,
  selectExactCandidateArtifact,
  selectExactQualityJob,
  selectQualityRun
} from '../scripts/promote-pr-doc-assets.mjs';

const candidateSha = 'a'.repeat(40);
const mergeSha = 'b'.repeat(40);
const root = fileURLToPath(new URL('../', import.meta.url));
const repository = { id: 1, full_name: 'herehigher/resume' };
const workflow = { id: 17, path: '.github/workflows/ci.yml' };
const pullRequest = {
  base: { repo: repository }, head: { ref: 'release-v0.2.8', repo: repository, sha: candidateSha }, number: 167, state: 'open'
};
const run = {
  conclusion: 'failure', event: 'pull_request', head_branch: 'release-v0.2.8', head_repository: repository,
  head_sha: candidateSha, id: 34478079250, path: workflow.path, pull_requests: [{ number: 167 }], repository,
  status: 'completed', workflow_id: workflow.id
};
const qualityJob = {
  conclusion: 'success', head_sha: candidateSha, name: 'quality', run_id: run.id, status: 'completed'
};
const artifact = {
  expired: false, name: `documentation-assets-${mergeSha}`,
  workflow_run: { head_sha: candidateSha, id: run.id }
};

const outputs = Object.freeze({
  en: { paper: 'LETTER', pdfPath: 'output/pdf/en-letter.pdf', screenshotPath: 'docs/screenshots/en.png' },
  ja: { paper: 'A4', pdfPath: 'output/pdf/ja-a4.pdf', screenshotPath: 'docs/screenshots/ja.png' },
  'zh-CN': { paper: 'A4', pdfPath: 'output/pdf/zh-CN-a4.pdf', screenshotPath: 'docs/screenshots/zh-CN.png' }
});

function digest(contents) {
  return createHash('sha256').update(contents).digest('hex');
}

function crc32(contents) {
  let crc = 0xffffffff;
  for (const byte of contents) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, contents) {
  const name = Buffer.from(type, 'ascii');
  const chunk = Buffer.alloc(contents.length + 12);
  chunk.writeUInt32BE(contents.length, 0);
  name.copy(chunk, 4);
  contents.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(Buffer.concat([name, contents])), contents.length + 8);
  return chunk;
}

function createPng(locale) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(1, 0);
  header.writeUInt32BE(1, 4);
  header.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', header),
    pngChunk('tEXt', Buffer.from(`fixture\0${locale}`)),
    pngChunk('IDAT', deflateSync(Buffer.from([0, 10, 20, 30]))),
    pngChunk('IEND', Buffer.alloc(0))
  ]);
}

function createPdf(text, { height, width }) {
  const stream = `BT\n/F1 12 Tf\n72 ${height - 72} Td\n(${text}) Tj\nET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>`,
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  ];
  let body = '%PDF-1.4\n';
  const offsets = [];
  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(Buffer.byteLength(body));
    body += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(body);
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  body += offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(body, 'latin1');
}

function git(directory, ...args) {
  return execFileSync('git', args, {
    cwd: directory, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']
  }).trim();
}

async function writeArtifact({
  artifactRoot, qualityRunId, sourceRoot, sourceSha,
  producer = { controlSha: sourceSha, kind: 'quality', runAttempt: '1', workflow: '.github/workflows/ci.yml' }
}) {
  await mkdir(path.join(artifactRoot, 'docs/screenshots'), { recursive: true });
  await mkdir(path.join(artifactRoot, 'output/pdf'), { recursive: true });
  const manifestOutputs = [];
  for (const [locale, expected] of Object.entries(outputs)) {
    const screenshot = createPng(locale);
    const dimensions = expected.paper === 'A4' ? { height: 841.89, width: 595.28 } : { height: 792, width: 612 };
    const firstText = `first-${locale}`;
    const lastText = `last-${locale}`;
    const pdf = createPdf(`${firstText} ${lastText}`, dimensions);
    await writeFile(path.join(artifactRoot, expected.screenshotPath), screenshot);
    await writeFile(path.join(artifactRoot, expected.pdfPath), pdf);
    manifestOutputs.push({
      browserLocale: locale, firstText, lastText, locale, marker: `marker-${locale}`, paper: expected.paper,
      pdf: { fixture: 'deterministic-print-example', path: expected.pdfPath, sha256: digest(pdf) },
      screenshot: { fixture: 'fictional-documentation-example', height: 1, path: expected.screenshotPath, sha256: digest(screenshot), width: 1 }
    });
  }
  const manifest = {
    browser: { engine: 'Chromium', version: '123.0.0.0', viewport: { height: 1000, width: 1440 } },
    generator: {
      command: 'node scripts/generate-doc-assets.mjs --output-dir <temporary-directory> --source-sha <full-SHA> --quality-run-id <run-ID> --producer-kind <quality|release-candidate> --producer-workflow <workflow-path> --producer-run-attempt <attempt> --producer-control-sha <full-SHA>',
      inputHash: await computeGeneratorInputHash(sourceRoot),
      inputHashAlgorithm: 'sha256(relative-path + NUL + content + NUL)',
      inputs: ['package-lock.json', 'scripts/generate-doc-assets.mjs', 'scripts/verify-doc-assets.mjs'],
      path: 'scripts/generate-doc-assets.mjs', version: '1.4.0'
    },
    outputs: manifestOutputs,
    schemaVersion: 4,
    source: {
      appVersion: '0.3.0', checkoutCommit: sourceSha, fixedDate: '2026-09-01', markerHashLength: 12,
      markerPrefix: 'RESUME-STUDIO-SAMPLE',
      producer: {
        controlSha: producer.controlSha, kind: producer.kind, runAttempt: producer.runAttempt,
        runId: qualityRunId, workflow: producer.workflow
      },
      siteHash: await computeSiteHash(path.join(sourceRoot, 'site')),
      siteHashAlgorithm: 'sha256(relative-path + NUL + content + NUL)'
    }
  };
  await writeFile(path.join(artifactRoot, 'docs/assets-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
}

async function createPromotionFixture({ manifestQualityRunId = '12345' } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'resume-pr-doc-assets-integration-'));
  const candidateRoot = path.join(root, 'candidate');
  const artifactRoot = path.join(root, 'artifact');
  const temporaryRoot = path.join(root, 'temporary');
  await mkdir(path.join(candidateRoot, 'site'), { recursive: true });
  await mkdir(path.join(candidateRoot, 'scripts'), { recursive: true });
  await writeFile(path.join(candidateRoot, 'site/index.html'), '<title>fixture</title>\n');
  await writeFile(path.join(candidateRoot, 'package.json'), '{"version":"0.3.0"}\n');
  await writeFile(path.join(candidateRoot, 'package-lock.json'), '{"lockfileVersion":3}\n');
  await writeFile(path.join(candidateRoot, 'scripts/generate-doc-assets.mjs'), '// generator fixture\n');
  await writeFile(path.join(candidateRoot, 'scripts/verify-doc-assets.mjs'), '// verifier fixture\n');
  for (const relativePath of releaseDocumentationAssetPaths) {
    await mkdir(path.dirname(path.join(candidateRoot, relativePath)), { recursive: true });
    await writeFile(path.join(candidateRoot, relativePath), `old ${relativePath}\n`);
  }
  git(candidateRoot, 'init', '--initial-branch=main');
  git(candidateRoot, 'config', 'user.name', 'Promotion Integration Test');
  git(candidateRoot, 'config', 'user.email', 'promotion-integration@example.invalid');
  git(candidateRoot, 'remote', 'add', 'origin', 'https://github.com/herehigher/resume.git');
  git(candidateRoot, 'add', '.');
  git(candidateRoot, '-c', 'commit.gpgSign=false', 'commit', '-m', 'base');
  git(candidateRoot, 'checkout', '-b', 'release-v0.2.8');
  await writeFile(path.join(candidateRoot, 'candidate.txt'), 'candidate\n');
  git(candidateRoot, 'add', 'candidate.txt');
  git(candidateRoot, '-c', 'commit.gpgSign=false', 'commit', '-m', 'candidate');
  const candidateSha = git(candidateRoot, 'rev-parse', 'HEAD');
  git(candidateRoot, 'checkout', 'main');
  await writeFile(path.join(candidateRoot, 'base.txt'), 'base\n');
  git(candidateRoot, 'add', 'base.txt');
  git(candidateRoot, '-c', 'commit.gpgSign=false', 'commit', '-m', 'base update');
  git(candidateRoot, '-c', 'commit.gpgSign=false', 'merge', '--no-ff', 'release-v0.2.8', '-m', 'temporary merge');
  const mergeSha = git(candidateRoot, 'rev-parse', 'HEAD');
  git(candidateRoot, 'checkout', 'release-v0.2.8');
  await writeArtifact({ artifactRoot, qualityRunId: manifestQualityRunId, sourceRoot: candidateRoot, sourceSha: mergeSha });
  return { artifactRoot, candidateRoot, candidateSha, mergeSha, root, temporaryRoot };
}

function promotionDependencies(fixture, qualityRunId = '12345') {
  const workflow = { id: 17, path: '.github/workflows/ci.yml' };
  const pullRequest = {
    base: { repo: repository }, head: { ref: 'release-v0.2.8', repo: repository, sha: fixture.candidateSha }, number: 167, state: 'open'
  };
  const run = {
    conclusion: 'failure', event: 'pull_request', head_branch: pullRequest.head.ref, head_repository: repository,
    head_sha: fixture.candidateSha, id: Number(qualityRunId), path: workflow.path, pull_requests: [{ number: pullRequest.number }],
    repository, status: 'completed', workflow_id: workflow.id
  };
  const qualityJob = {
    conclusion: 'success', head_sha: fixture.candidateSha, name: 'quality', run_id: run.id, status: 'completed'
  };
  const qualityArtifact = {
    expired: false, name: `documentation-assets-${fixture.mergeSha}`,
    workflow_run: { head_sha: fixture.candidateSha, id: run.id }
  };
  return {
    api(endpoint) {
      if (endpoint === 'actions/workflows/ci.yml') return workflow;
      if (endpoint === 'pulls/167') return pullRequest;
      if (endpoint.startsWith('actions/workflows/17/runs?')) return [{ workflow_runs: [run] }];
      if (endpoint === `actions/runs/${run.id}`) return run;
      if (endpoint.startsWith(`actions/runs/${run.id}/jobs?`)) return [{ jobs: [qualityJob] }];
      if (endpoint.startsWith(`actions/runs/${run.id}/artifacts?`)) return [{ artifacts: [qualityArtifact] }];
      throw new Error(`Unexpected API endpoint: ${endpoint}`);
    },
    createTemporaryDirectory: async () => {
      await mkdir(fixture.temporaryRoot);
      return fixture.temporaryRoot;
    },
    currentMergeSha: () => fixture.mergeSha,
    downloadArtifact: async (_runId, _name, destination) => {
      cpSync(path.join(fixture.artifactRoot, 'docs'), path.join(destination, 'docs'), { recursive: true });
      cpSync(path.join(fixture.artifactRoot, 'output'), path.join(destination, 'output'), { recursive: true });
    },
    git(directory, args) {
      if (args[0] === 'lfs') return '';
      return git(directory, ...args);
    }
  };
}

test('promotion identity accepts the current PR merge artifact while its parent run is in progress and the same Quality job succeeded', () => {
  const identity = resolvePromotionIdentity({ artifact, mergeSha, pullRequest, qualityJob, run, workflow });
  assert.equal(identity.candidateSha, candidateSha);
  assert.equal(identity.mergeSha, mergeSha);
  assert.notEqual(identity.candidateSha, identity.mergeSha);
  assert.equal(identity.qualityRunId, '34478079250');
  assertArtifactManifestProvenance({
    artifactName: artifact.name, checkoutCommit: mergeSha, qualityRunId: '34478079250'
  }, identity);
  assert.deepEqual(resolvePromotionIdentity({
    artifact, mergeSha, pullRequest, qualityJob, run: { ...run, head_repository: undefined }, workflow
  }), identity);
  const inProgressRun = { ...run, conclusion: null, status: 'in_progress' };
  assert.equal(qualityJob.run_id, inProgressRun.id);
  assert.equal(qualityJob.status, 'completed');
  assert.equal(qualityJob.conclusion, 'success');
  assert.deepEqual(resolvePromotionIdentity({ artifact, mergeSha, pullRequest, qualityJob, run: inProgressRun, workflow }), identity);
  assert.throws(() => resolvePromotionIdentity({
    artifact, mergeSha, pullRequest, qualityJob,
    run: { ...run, head_repository: { id: 2, full_name: 'untrusted/fork' } }, workflow
  }), /head repository/);
  assert.throws(() => resolvePromotionIdentity({
    artifact, mergeSha, pullRequest, qualityJob, run: { ...run, status: 'queued' }, workflow
  }), /not active or completed/);
});

test('evidence module graph loads from a tree without repository dependencies', (t) => {
  const temporary = mkdtempSync(path.join(os.tmpdir(), 'resume-evidence-module-'));
  t.after(() => rm(temporary, { force: true, recursive: true }));
  const scripts = path.join(temporary, 'scripts');
  mkdirSync(scripts);
  for (const file of ['promote-pr-doc-assets.mjs', 'release-doc-assets.mjs']) {
    cpSync(path.join(root, 'scripts', file), path.join(scripts, file));
  }
  const moduleUrl = pathToFileURL(path.join(scripts, 'promote-pr-doc-assets.mjs')).href;
  const loaded = spawnSync(process.execPath, ['--input-type=module', '--eval', `await import(${JSON.stringify(moduleUrl)})`], {
    cwd: temporary, encoding: 'utf8'
  });
  assert.equal(loaded.status, 0, loaded.stderr);
});

function failureCategory(callback) {
  try {
    callback();
  } catch (error) {
    return classifyEvidenceFailure(error);
  }
  assert.fail('expected evidence resolution to fail');
}

test('evidence failures carry stable categories from their sources', () => {
  assert.equal(failureCategory(() => selectExactArtifact([], run.id, mergeSha, candidateSha)),
    'current-evidence-github-api-or-artifact-unavailable');
  assert.equal(failureCategory(() => selectExactArtifact([{ ...artifact, expired: true }], run.id, mergeSha, candidateSha)),
    'current-evidence-github-api-or-artifact-unavailable');
  assert.equal(failureCategory(() => selectExactArtifact([
    { ...artifact, workflow_run: { ...artifact.workflow_run, id: run.id + 1 } }
  ], run.id, mergeSha, candidateSha)), 'current-evidence-identity-mismatch');
  assert.equal(failureCategory(() => resolvePullRequestQualityEvidence({
    candidateRoot: '/fictional/candidate', dependencies: {
      api: () => { throw new Error('network failure'); },
      git: () => 'https://github.com/herehigher/resume.git'
    }, pullRequestNumber: '167', qualityRunId: String(run.id), sourceMergeSha: mergeSha
  })), 'current-evidence-github-api-or-artifact-unavailable');
  assert.equal(classifyEvidenceFailure(new Error('unexpected local bootstrap failure')),
    'current-evidence-local-tooling-bootstrap-failure');
});

test('read-only evidence resolution uniquely binds Actions objects to the current merge SHA', () => {
  const api = (endpoint) => {
    if (endpoint === 'actions/workflows/ci.yml') return workflow;
    if (endpoint === 'pulls/167') return pullRequest;
    if (endpoint === `actions/runs/${run.id}`) return run;
    if (endpoint.startsWith(`actions/runs/${run.id}/jobs?`)) return [{ jobs: [qualityJob] }];
    if (endpoint.startsWith(`actions/runs/${run.id}/artifacts?`)) return [{ artifacts: [artifact] }];
    throw new Error(`Unexpected API endpoint: ${endpoint}`);
  };
  const dependencies = {
    api,
    currentMergeSha: () => mergeSha,
    git: (_directory, args) => args[0] === 'remote' ? 'https://github.com/herehigher/resume.git' : ''
  };
  assert.deepEqual(resolvePullRequestQualityEvidence({
    candidateRoot: '/fictional/candidate', dependencies, pullRequestNumber: '167', qualityRunId: String(run.id), sourceMergeSha: mergeSha
  }), {
    artifactName: artifact.name, candidateSha, mergeSha, pullRequestNumber: '167', qualityRunId: String(run.id)
  });
  assert.throws(() => resolvePullRequestQualityEvidence({
    candidateRoot: '/fictional/candidate', dependencies, pullRequestNumber: '167', qualityRunId: String(run.id), sourceMergeSha: candidateSha
  }), /does not match this pull request merge SHA/);
  assert.throws(() => resolvePullRequestQualityEvidence({
    candidateRoot: '/fictional/candidate', dependencies, pullRequestNumber: '167', qualityRunId: '99', sourceMergeSha: mergeSha
  }), /GitHub API response is unavailable/);
});

test('promotion fails closed for run, artifact, and manifest provenance mismatches', () => {
  assert.throws(() => resolvePromotionIdentity({
    artifact, mergeSha, pullRequest, qualityJob, run: { ...run, head_sha: mergeSha }, workflow
  }), /pull request head/);
  assert.throws(() => resolvePromotionIdentity({
    artifact: { ...artifact, name: `documentation-assets-${candidateSha}` },
    mergeSha, pullRequest, qualityJob, run, workflow
  }), /artifact/);
  assert.throws(() => resolvePromotionIdentity({
    artifact: { ...artifact, workflow_run: { ...artifact.workflow_run, head_sha: mergeSha } },
    mergeSha, pullRequest, qualityJob, run, workflow
  }), /artifact/);
  assert.throws(() => resolvePromotionIdentity({
    artifact, mergeSha, pullRequest, qualityJob: { ...qualityJob, conclusion: 'failure' }, run, workflow
  }), /Quality job/);
  assert.throws(() => resolvePromotionIdentity({
    artifact, mergeSha, pullRequest, qualityJob: { ...qualityJob, run_id: run.id + 1 }, run, workflow
  }), /Quality job/);
  const identity = resolvePromotionIdentity({ artifact, mergeSha, pullRequest, qualityJob, run, workflow });
  assert.throws(() => assertArtifactManifestProvenance({
    artifactName: artifact.name, checkoutCommit: candidateSha, qualityRunId: identity.qualityRunId
  }, identity), /manifest provenance/);
});

test('promotion refuses empty, multiple, and expired run or artifact selections', () => {
  assert.throws(() => selectQualityRun([], pullRequest), /exactly one completed workflow run/);
  assert.throws(() => selectQualityRun([run, run], pullRequest), /exactly one completed workflow run/);
  assert.equal(selectQualityRun([run], pullRequest), run);
  assert.throws(() => selectExactQualityJob([], run.id, candidateSha), /exactly one Quality job/);
  assert.equal(selectExactQualityJob([qualityJob], run.id, candidateSha), qualityJob);
  assert.throws(() => selectExactQualityJob([
    { ...qualityJob, conclusion: 'failure' }
  ], run.id, candidateSha), /Quality job does not match/);
  assert.throws(() => selectExactArtifact([], run.id, mergeSha, candidateSha), /artifact is unavailable/);
  assert.throws(() => selectExactArtifact([artifact, artifact], run.id, mergeSha, candidateSha), /exactly one documentation artifact/);
  assert.throws(() => selectExactArtifact([{ ...artifact, expired: true }], run.id, mergeSha, candidateSha), /has expired/);
});

test('candidate evidence binds the trusted control workflow, source SHA, run attempt, artifact ID, and digest', () => {
  const controlSha = 'c'.repeat(40);
  const candidateWorkflow = { id: 18, path: '.github/workflows/release-candidate-assets.yml' };
  const candidateRun = {
    conclusion: 'success', event: 'workflow_dispatch', head_branch: 'main', head_repository: repository, head_sha: controlSha,
    id: 91, path: candidateWorkflow.path, repository, run_attempt: 2, status: 'completed', workflow_id: candidateWorkflow.id
  };
  const candidateArtifact = {
    digest: `sha256:${'d'.repeat(64)}`, expired: false,
    id: 1234, name: `release-candidate-documentation-assets-${candidateSha}-attempt-2`,
    workflow_run: { head_sha: controlSha, id: candidateRun.id }
  };
  const identity = resolveCandidateAssetIdentity({
    artifact: candidateArtifact, controlSha, run: candidateRun, sourceSha: candidateSha, workflow: candidateWorkflow
  });
  assert.deepEqual(identity, {
    artifactDigest: candidateArtifact.digest, artifactId: '1234', artifactName: candidateArtifact.name,
    controlSha, runAttempt: '2', runId: '91', sourceSha: candidateSha
  });
  assert.deepEqual(parseCandidateArguments([
    '--source-sha', candidateSha, '--run-id', '91', '--run-attempt', '2'
  ]), { 'run-attempt': '2', 'run-id': '91', 'source-sha': candidateSha });
  assert.throws(() => parseCandidateArguments(['--source-sha', candidateSha, '--run-id', '91']), /requires/);
  assert.throws(() => selectExactCandidateArtifact([candidateArtifact, candidateArtifact], identity), /exactly one/);
  assert.throws(() => selectExactCandidateArtifact([{ ...candidateArtifact, expired: true }], identity), /expired/);
  assert.throws(() => selectExactCandidateArtifact([{
    ...candidateArtifact, name: `release-candidate-documentation-assets-${candidateSha}-attempt-1`
  }], identity), /unavailable/);
  assert.throws(() => resolveCandidateAssetIdentity({
    artifact: { ...candidateArtifact, digest: 'sha256:not-a-digest' }, controlSha, run: candidateRun, sourceSha: candidateSha, workflow: candidateWorkflow
  }), /artifact/);
  assert.throws(() => resolveCandidateAssetIdentity({
    artifact: candidateArtifact, controlSha, run: { ...candidateRun, head_branch: 'release-v0.3.2' }, sourceSha: candidateSha, workflow: candidateWorkflow
  }), /control SHA/);
  assert.throws(() => resolveCandidateAssetIdentity({
    artifact: candidateArtifact, controlSha, run: candidateRun, sourceSha: mergeSha, workflow: candidateWorkflow
  }), /artifact/);
  assert.throws(() => resolveCandidateAssetIdentity({
    artifact: candidateArtifact, controlSha, run: candidateRun, sourceSha: candidateSha, workflow: { ...candidateWorkflow, path: '.github/workflows/ci.yml' }
  }), /workflow/);
  const api = (endpoint) => {
    if (endpoint === 'actions/workflows/release-candidate-assets.yml') return candidateWorkflow;
    if (endpoint === 'actions/runs/91') return candidateRun;
    if (endpoint.startsWith('actions/runs/91/artifacts?')) return [{ artifacts: [candidateArtifact] }];
    throw new Error(`Unexpected API endpoint: ${endpoint}`);
  };
  assert.deepEqual(resolveCandidateDocumentationEvidence({ dependencies: { api }, provenance: {
    artifactName: candidateArtifact.name, checkoutCommit: candidateSha,
    producer: { controlSha, kind: 'release-candidate', runAttempt: '2', runId: '91', workflow: candidateWorkflow.path }
  } }), identity);
  assert.throws(() => resolveCandidateDocumentationEvidence({ dependencies: { api }, provenance: {
    artifactName: candidateArtifact.name, checkoutCommit: candidateSha,
    producer: { controlSha, kind: 'release-candidate', runAttempt: '1', runId: '91', workflow: candidateWorkflow.path }
  } }), /attempt/);
});

test('candidate promotion copies only seven verified files from one explicit run attempt into a clean candidate checkout', async (t) => {
  const fixture = await createPromotionFixture();
  t.after(() => rm(fixture.root, { force: true, recursive: true }));
  const controlSha = 'c'.repeat(40);
  await rm(fixture.artifactRoot, { force: true, recursive: true });
  await writeArtifact({
    artifactRoot: fixture.artifactRoot, qualityRunId: '91', sourceRoot: fixture.candidateRoot, sourceSha: fixture.candidateSha,
    producer: {
      controlSha, kind: 'release-candidate', runAttempt: '2', workflow: '.github/workflows/release-candidate-assets.yml'
    }
  });
  const candidateWorkflow = { id: 18, path: '.github/workflows/release-candidate-assets.yml' };
  const candidateRun = {
    conclusion: 'success', event: 'workflow_dispatch', head_branch: 'main', head_repository: repository, head_sha: controlSha,
    id: 91, path: candidateWorkflow.path, repository, run_attempt: 2, status: 'completed', workflow_id: candidateWorkflow.id
  };
  const candidateArtifact = {
    digest: `sha256:${'d'.repeat(64)}`, expired: false, id: 1234,
    name: `release-candidate-documentation-assets-${fixture.candidateSha}-attempt-2`,
    workflow_run: { head_sha: controlSha, id: candidateRun.id }
  };
  const temporaryRoot = path.join(fixture.root, 'candidate-temporary');
  const result = await promoteCandidateDocumentationAssets({
    candidateRoot: fixture.candidateRoot,
    dependencies: {
      api(endpoint) {
        if (endpoint === 'actions/workflows/release-candidate-assets.yml') return candidateWorkflow;
        if (endpoint === 'actions/runs/91') return candidateRun;
        if (endpoint.startsWith('actions/runs/91/artifacts?')) return [{ artifacts: [candidateArtifact] }];
        throw new Error(`Unexpected API endpoint: ${endpoint}`);
      },
      createTemporaryDirectory: async () => {
        await mkdir(temporaryRoot);
        return temporaryRoot;
      },
      downloadCandidateArtifact: async (_identity, destination) => {
        cpSync(path.join(fixture.artifactRoot, 'docs'), path.join(destination, 'docs'), { recursive: true });
        cpSync(path.join(fixture.artifactRoot, 'output'), path.join(destination, 'output'), { recursive: true });
      }
    },
    values: { 'run-attempt': '2', 'run-id': '91', 'source-sha': fixture.candidateSha }
  });
  assert.deepEqual(result.files, releaseDocumentationAssetPaths);
  assert.equal(result.artifactId, '1234');
  assert.equal(existsSync(temporaryRoot), false);
  assert.deepEqual(
    git(fixture.candidateRoot, 'diff', '--name-only', '--no-renames').split('\n').filter(Boolean).sort(),
    [...releaseDocumentationAssetPaths].sort()
  );
  for (const relativePath of releaseDocumentationAssetPaths) {
    assert.deepEqual(
      await readFile(path.join(fixture.candidateRoot, relativePath)),
      await readFile(path.join(fixture.artifactRoot, relativePath))
    );
  }
});

test('candidate CLI uses the supported artifact endpoint and captures a binary gh API archive without unsupported flags', async (t) => {
  const fixture = await createPromotionFixture();
  t.after(() => rm(fixture.root, { force: true, recursive: true }));
  const controlSha = 'c'.repeat(40);
  await rm(fixture.artifactRoot, { force: true, recursive: true });
  await writeArtifact({
    artifactRoot: fixture.artifactRoot, qualityRunId: '91', sourceRoot: fixture.candidateRoot, sourceSha: fixture.candidateSha,
    producer: { controlSha, kind: 'release-candidate', runAttempt: '2', workflow: '.github/workflows/release-candidate-assets.yml' }
  });
  const archive = path.join(fixture.root, 'candidate-artifact.zip');
  execFileSync('zip', ['-q', '-r', archive, 'docs', 'output'], { cwd: fixture.artifactRoot });
  const candidateWorkflow = { id: 18, path: '.github/workflows/release-candidate-assets.yml' };
  const candidateRun = {
    conclusion: 'success', event: 'workflow_dispatch', head_branch: 'main', head_repository: repository, head_sha: controlSha,
    id: 91, path: candidateWorkflow.path, repository, run_attempt: 2, status: 'completed', workflow_id: candidateWorkflow.id
  };
  const candidateArtifact = {
    digest: `sha256:${digest(await readFile(archive))}`, expired: false, id: 1234,
    name: `release-candidate-documentation-assets-${fixture.candidateSha}-attempt-2`,
    workflow_run: { head_sha: controlSha, id: candidateRun.id }
  };
  const bin = path.join(fixture.root, 'bin');
  await mkdir(bin);
  const fakeGh = path.join(bin, 'gh');
  await writeFile(fakeGh, `#!/bin/sh
set -eu
if [ "$#" -eq 2 ] && [ "$1" = api ] && [ "$2" = repos/herehigher/resume/actions/workflows/release-candidate-assets.yml ]; then
  printf '%s\\n' "$FAKE_WORKFLOW"
elif [ "$#" -eq 2 ] && [ "$1" = api ] && [ "$2" = repos/herehigher/resume/actions/runs/91 ]; then
  printf '%s\\n' "$FAKE_RUN"
elif [ "$#" -eq 4 ] && [ "$1" = api ] && [ "$2" = --paginate ] && [ "$3" = --slurp ] && [ "$4" = 'repos/herehigher/resume/actions/runs/91/artifacts?per_page=100' ]; then
  printf '%s\\n' "$FAKE_ARTIFACTS"
elif [ "$#" -eq 2 ] && [ "$1" = api ] && [ "$2" = repos/herehigher/resume/actions/artifacts/1234/zip ]; then
  cat "$FAKE_ARCHIVE"
else
  exit 64
fi
`);
  await chmod(fakeGh, 0o755);
  const executed = spawnSync(process.execPath, [
    path.join(root, 'scripts/promote-pr-doc-assets.mjs'), 'candidate',
    '--source-sha', fixture.candidateSha, '--run-id', '91', '--run-attempt', '2'
  ], {
    cwd: fixture.candidateRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      FAKE_ARCHIVE: archive,
      FAKE_ARTIFACTS: JSON.stringify([{ artifacts: [candidateArtifact] }]),
      FAKE_RUN: JSON.stringify(candidateRun),
      FAKE_WORKFLOW: JSON.stringify(candidateWorkflow),
      PATH: `${bin}${path.delimiter}${process.env.PATH}`
    }
  });
  assert.equal(executed.status, 0, executed.stderr);
  assert.match(executed.stdout, /Promoted only these 7 files/);
  assert.deepEqual(
    git(fixture.candidateRoot, 'diff', '--name-only', '--no-renames').split('\n').filter(Boolean).sort(),
    [...releaseDocumentationAssetPaths].sort()
  );
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
  assert.equal(await assertCandidateSource(sourceRoot, sha), sha);
  await assert.rejects(assertCandidateSource(sourceRoot, candidateSha), /source SHA does not match/);

  await writeFile(path.join(sourceRoot, 'site/index.html'), '<title>dirty</title>');
  await assert.rejects(assertCandidateSource(sourceRoot, sha), /uncommitted site, package, or generator changes/);
});

test('promotion orchestrates a temporary merge checkout and copies only seven verified files', async (t) => {
  const fixture = await createPromotionFixture();
  t.after(() => rm(fixture.root, { force: true, recursive: true }));
  const result = await promotePullRequestDocumentationAssets({
    candidateRoot: fixture.candidateRoot, dependencies: promotionDependencies(fixture), values: { pr: '167' }
  });

  assert.equal(result.candidateSha, fixture.candidateSha);
  assert.equal(result.mergeSha, fixture.mergeSha);
  assert.notEqual(result.candidateSha, result.mergeSha);
  assert.deepEqual(result.files, releaseDocumentationAssetPaths);
  assert.equal(existsSync(fixture.temporaryRoot), false);
  assert.equal(git(fixture.candidateRoot, 'worktree', 'list', '--porcelain').includes(`${fixture.temporaryRoot}/source`), false);
  assert.deepEqual(
    git(fixture.candidateRoot, 'diff', '--name-only', '--no-renames').split('\n').filter(Boolean).sort(),
    [...releaseDocumentationAssetPaths].sort()
  );
  for (const relativePath of releaseDocumentationAssetPaths) {
    assert.deepEqual(
      await readFile(path.join(fixture.candidateRoot, relativePath)),
      await readFile(path.join(fixture.artifactRoot, relativePath))
    );
  }
});

test('promotion removes its temporary worktree and directory after manifest provenance failure', async (t) => {
  const fixture = await createPromotionFixture({ manifestQualityRunId: '999' });
  t.after(() => rm(fixture.root, { force: true, recursive: true }));
  await assert.rejects(
    promotePullRequestDocumentationAssets({
      candidateRoot: fixture.candidateRoot, dependencies: promotionDependencies(fixture), values: { pr: '167' }
    }),
    /manifest provenance/
  );
  assert.equal(existsSync(fixture.temporaryRoot), false);
  assert.equal(git(fixture.candidateRoot, 'worktree', 'list', '--porcelain').includes(`${fixture.temporaryRoot}/source`), false);
  assert.equal(git(fixture.candidateRoot, 'status', '--porcelain'), '');
});

test('promotion rejects a candidate branch whose HEAD differs from the selected pull request head', async (t) => {
  const fixture = await createPromotionFixture();
  t.after(() => rm(fixture.root, { force: true, recursive: true }));
  const dependencies = promotionDependencies(fixture);
  const api = dependencies.api;
  const selectedCandidateSha = 'c'.repeat(40);
  dependencies.api = (endpoint, paginate) => {
    const response = api(endpoint, paginate);
    if (endpoint === 'pulls/167') {
      return { ...response, head: { ...response.head, sha: selectedCandidateSha } };
    }
    if (endpoint.startsWith('actions/workflows/17/runs?')) {
      return response.map((page) => ({
        ...page, workflow_runs: page.workflow_runs.map((qualityRun) => ({ ...qualityRun, head_sha: selectedCandidateSha }))
      }));
    }
    if (/^actions\/runs\/[1-9][0-9]*$/.test(endpoint)) return { ...response, head_sha: selectedCandidateSha };
    if (endpoint.includes('/jobs?')) {
      return response.map((page) => ({
        ...page, jobs: page.jobs.map((job) => ({ ...job, head_sha: selectedCandidateSha }))
      }));
    }
    if (endpoint.includes('/artifacts?')) {
      return response.map((page) => ({
        ...page,
        artifacts: page.artifacts.map((qualityArtifact) => ({
          ...qualityArtifact, workflow_run: { ...qualityArtifact.workflow_run, head_sha: selectedCandidateSha }
        }))
      }));
    }
    return response;
  };
  await assert.rejects(
    promotePullRequestDocumentationAssets({
      candidateRoot: fixture.candidateRoot, dependencies, values: { pr: '167' }
    }),
    /source SHA does not match/
  );
  assert.equal(existsSync(fixture.temporaryRoot), false);
  assert.equal(git(fixture.candidateRoot, 'status', '--porcelain'), '');
});
