import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  cpSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  CLOUDFLARE_BEACON_URL,
  CLOUDFLARE_PROVIDER,
  OFFICIAL_REPOSITORY,
  computeTreeDigest,
  prepareArtifact,
  validateManifest
} from '../scripts/prepare-pages-artifact.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const sourceSite = path.join(root, 'site');
const adapterPath = path.join(root, 'scripts/prepare-pages-artifact.mjs');
const token = 'a'.repeat(32);

function temporaryDirectory(t) {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'resume-pages-test-'));
  t.after(() => rmSync(directory, { force: true, recursive: true }));
  return directory;
}

function manifestValue({ mode = 'disabled' } = {}) {
  return {
    analyticsMode: mode,
    analyticsProvider: mode === 'enabled' ? CLOUDFLARE_PROVIDER : 'none',
    schemaVersion: 2
  };
}

function writeManifest(directory, value) {
  const manifestPath = path.join(directory, 'manifest.json');
  writeFileSync(manifestPath, `${JSON.stringify(value)}\n`);
  return manifestPath;
}

function collectFiles(directory, rootDirectory = directory) {
  return readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))
    .flatMap((entry) => {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) return collectFiles(absolutePath, rootDirectory);
      return [path.relative(rootDirectory, absolutePath).split(path.sep).join('/')];
    });
}

test('manifest accepts only the two closed analytics tuples', () => {
  const values = ['disabled', 'enabled', 'unknown'];
  const providers = ['none', CLOUDFLARE_PROVIDER, 'unknown'];
  for (const analyticsMode of values) {
    for (const analyticsProvider of providers) {
      const value = { analyticsMode, analyticsProvider, schemaVersion: 2 };
      const valid = (analyticsMode === 'disabled' && analyticsProvider === 'none')
        || (analyticsMode === 'enabled' && analyticsProvider === CLOUDFLARE_PROVIDER);
      if (valid) assert.deepEqual(validateManifest(value), value);
      else assert.throws(() => validateManifest(value), /Unsupported analytics mode\/provider tuple/);
    }
  }
  assert.throws(() => validateManifest({
    ...manifestValue(),
    endpoint: 'https://example.test'
  }), /unknown or missing fields/);
  assert.throws(() => validateManifest({
    ...manifestValue(),
    schemaVersion: 0
  }), /Unsupported Pages release manifest schemaVersion/);
});

test('final gate validate CLI fails closed for malformed manifest contracts', async (t) => {
  const temporary = temporaryDirectory(t);
  const valid = manifestValue();
  const cases = [
    ['invalid tuple', { ...valid, analyticsMode: 'unknown' }],
    ['unknown field', { ...valid, providerConfig: 'forbidden' }],
    ['unsupported schema', { ...valid, schemaVersion: 0 }]
  ];
  const run = (manifestPath) => spawnSync('bash', ['-c', `
set -euo pipefail
node "$1" validate --source "$2" --manifest "$3"
printf 'FINAL_GATE_SUCCESS\\n'
`, 'final-gate-validate', adapterPath, sourceSite, manifestPath], { encoding: 'utf8' });

  const validResult = run(writeManifest(temporary, valid));
  assert.equal(validResult.status, 0, validResult.stderr);
  assert.match(validResult.stdout, /FINAL_GATE_SUCCESS/);

  for (const [name, manifest] of cases) {
    const caseDirectory = path.join(temporary, name.replaceAll(' ', '-'));
    mkdirSync(caseDirectory);
    const result = run(writeManifest(caseDirectory, manifest));
    assert.notEqual(result.status, 0, name);
    assert.doesNotMatch(result.stdout, /FINAL_GATE_SUCCESS/, name);
  }
});

test('disabled artifacts and non-official repositories remain byte-identical to source', async (t) => {
  const temporary = temporaryDirectory(t);
  const sourceDigest = await computeTreeDigest(sourceSite);
  const manifestPath = writeManifest(temporary, manifestValue());
  const output = path.join(temporary, 'output');
  const before = await computeTreeDigest(sourceSite);

  const result = await prepareArtifact({
    manifestPath,
    outputDirectory: output,
    repository: 'fork/example',
    sourceDirectory: sourceSite
  });

  assert.equal(result.finalDigest, sourceDigest);
  assert.equal(await computeTreeDigest(output), sourceDigest);
  assert.equal(await computeTreeDigest(sourceSite), before);
  assert.deepEqual(collectFiles(output), collectFiles(sourceSite));
});

test('enabled official artifact changes only the five allowlisted HTML documents', async (t) => {
  const temporary = temporaryDirectory(t);
  const sourceDigest = await computeTreeDigest(sourceSite);
  const manifestPath = writeManifest(temporary, manifestValue({ mode: 'enabled' }));
  const output = path.join(temporary, 'output');

  await prepareArtifact({
    manifestPath,
    outputDirectory: output,
    repository: OFFICIAL_REPOSITORY,
    sourceDirectory: sourceSite,
    token
  });

  assert.deepEqual(collectFiles(output), collectFiles(sourceSite));
  for (const relativePath of collectFiles(sourceSite)) {
    const source = readFileSync(path.join(sourceSite, relativePath));
    const artifact = readFileSync(path.join(output, relativePath));
    if (!relativePath.endsWith('.html')) {
      assert.deepEqual(artifact, source, relativePath);
      continue;
    }
    const html = artifact.toString('utf8');
    assert.match(html, /data-analytics-mode="enabled" data-analytics-provider="cloudflare-web-analytics"/);
    assert.equal((html.match(new RegExp(CLOUDFLARE_BEACON_URL.replaceAll('.', '\\.'), 'g')) || []).length, 1);
    assert.match(html, new RegExp(token));
  }
  assert.equal(await computeTreeDigest(sourceSite), sourceDigest);
});

test('enabled preparation rejects token and repository failures without leaking token', async (t) => {
  const temporary = temporaryDirectory(t);
  const sourceDigest = await computeTreeDigest(sourceSite);
  const manifestPath = writeManifest(temporary, manifestValue({ mode: 'enabled' }));
  const run = (candidate, repository = OFFICIAL_REPOSITORY) => prepareArtifact({
    manifestPath,
    outputDirectory: path.join(temporary, `output-${Math.random()}`),
    repository,
    sourceDirectory: sourceSite,
    token: candidate
  });

  for (const candidate of ['', 'a'.repeat(31), 'g'.repeat(32), `${token} `]) {
    await assert.rejects(run(candidate), (error) => {
      assert.doesNotMatch(error.message, new RegExp(token));
      return /missing or invalid/.test(error.message);
    });
  }
  await assert.rejects(run('', 'fork/example'), /restricted to the official repository/);
});

test('source validation rejects beacon, body, HTML path, symlink, and non-canonical path defects', async (t) => {
  const temporary = temporaryDirectory(t);
  const cases = [
    ['existing beacon', (site) => {
      const file = path.join(site, 'index.html');
      writeFileSync(file, readFileSync(file, 'utf8').replace('</body>', `<script src="${CLOUDFLARE_BEACON_URL}"></script></body>`));
    }],
    ['missing body', (site) => {
      const file = path.join(site, 'index.html');
      writeFileSync(file, readFileSync(file, 'utf8').replace('</body>', ''));
    }],
    ['misplaced analytics attributes', (site) => {
      const file = path.join(site, 'index.html');
      const attributes = 'data-analytics-mode="disabled" data-analytics-provider="none"';
      writeFileSync(file, readFileSync(file, 'utf8')
        .replace(` ${attributes}`, '')
        .replace('<body>', `<body ${attributes}>`));
    }],
    ['extra HTML', (site) => writeFileSync(path.join(site, 'extra.html'), '<html></html>')],
    ['missing HTML', (site) => rmSync(path.join(site, 'en/index.html'))],
    ['symlink', (site) => symlinkSync(path.join(site, 'index.html'), path.join(site, 'linked.html'))],
    ['non-canonical path', (site) => writeFileSync(path.join(site, 'bad\\name.txt'), 'bad')]
  ];

  for (const [name, mutate] of cases) {
    const site = path.join(temporary, name.replaceAll(' ', '-'));
    cpSync(sourceSite, site, { recursive: true });
    mutate(site);
    const manifestPath = writeManifest(path.dirname(site), manifestValue());
    await assert.rejects(prepareArtifact({
      manifestPath,
      outputDirectory: `${site}-output`,
      repository: 'fork/example',
      sourceDirectory: site
    }), undefined, name);
  }
});

test('artifact output cannot overlap the source tree', async (t) => {
  const temporary = temporaryDirectory(t);
  const source = path.join(temporary, 'site');
  cpSync(sourceSite, source, { recursive: true });
  const manifestPath = writeManifest(temporary, manifestValue());
  mkdirSync(path.join(source, 'nested'));
  await assert.rejects(prepareArtifact({
    manifestPath,
    outputDirectory: path.join(source, 'nested', 'artifact'),
    repository: 'fork/example',
    sourceDirectory: source
  }), /outside the source tree/);
});

test('prepare CLI refuses an existing output without changing its sentinel', async (t) => {
  const temporary = temporaryDirectory(t);
  const manifestPath = writeManifest(temporary, manifestValue());
  const output = path.join(temporary, 'existing-output');
  const sentinel = path.join(output, 'sentinel.txt');
  mkdirSync(output);
  writeFileSync(sentinel, 'preserve me');

  const result = spawnSync(process.execPath, [
    adapterPath,
    'prepare',
    '--source', sourceSite,
    '--output', output,
    '--manifest', manifestPath,
    '--repository', 'fork/example'
  ], { encoding: 'utf8' });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /output already exists/i);
  assert.equal(readFileSync(sentinel, 'utf8'), 'preserve me');
});

test('derive and prepare CLI boundaries never expose the provider token', async (t) => {
  const temporary = temporaryDirectory(t);
  const manifestPath = writeManifest(temporary, manifestValue({ mode: 'enabled' }));
  const commands = [
    {
      args: ['derive-cloudflare', '--source', sourceSite],
      output: path.join(temporary, 'derive-output.txt')
    },
    {
      args: [
        'prepare', '--source', sourceSite,
        '--output', path.join(temporary, 'prepared-site'),
        '--manifest', manifestPath,
        '--repository', OFFICIAL_REPOSITORY
      ],
      output: path.join(temporary, 'prepare-output.txt')
    }
  ];

  for (const command of commands) {
    writeFileSync(command.output, '');
    const result = spawnSync(process.execPath, [adapterPath, ...command.args], {
      encoding: 'utf8',
      env: {
        ...process.env,
        CLOUDFLARE_WEB_ANALYTICS_TOKEN: token,
        GITHUB_OUTPUT: command.output
      }
    });
    assert.equal(result.status, 0, result.stderr);
    for (const boundary of [result.stdout, result.stderr, readFileSync(command.output, 'utf8')]) {
      assert.doesNotMatch(boundary, new RegExp(token));
    }
  }
});
