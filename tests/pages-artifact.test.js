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
  computeTreeDigest,
  prepareArtifact,
  validateManifest
} from '../scripts/prepare-pages-artifact.mjs';
import { CLOUDFLARE_BEACON_URL } from '../scripts/cloudflare-analytics.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const sourceSite = path.join(root, 'site');
const adapterPath = path.join(root, 'scripts/prepare-pages-artifact.mjs');

function temporaryDirectory(t) {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'resume-pages-test-'));
  t.after(() => rmSync(directory, { force: true, recursive: true }));
  return directory;
}

function manifestValue(overrides = {}) {
  return { analyticsDelivery: 'hosting-managed', schemaVersion: 3, ...overrides };
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

test('manifest accepts only the fixed hosting-managed analytics delivery contract', () => {
  assert.deepEqual(validateManifest(manifestValue()), manifestValue());
  assert.throws(() => validateManifest(manifestValue({ analyticsDelivery: 'application-managed' })), /Unsupported analytics delivery contract/);
  assert.throws(() => validateManifest({ analyticsMode: 'enabled', analyticsProvider: 'cloudflare-web-analytics', schemaVersion: 2 }), /unknown or missing fields/);
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
    ['invalid delivery', { ...valid, analyticsDelivery: 'application-managed' }],
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

test('prepared artifacts remain byte-identical to source for every repository', async (t) => {
  const temporary = temporaryDirectory(t);
  const sourceDigest = await computeTreeDigest(sourceSite);
  const manifestPath = writeManifest(temporary, manifestValue());
  const output = path.join(temporary, 'output');
  const before = await computeTreeDigest(sourceSite);

  const result = await prepareArtifact({
    manifestPath,
    outputDirectory: output,
    sourceDirectory: sourceSite
  });

  assert.equal(result.manifest.analyticsDelivery, 'hosting-managed');
  assert.equal(result.finalDigest, sourceDigest);
  assert.equal(await computeTreeDigest(output), sourceDigest);
  assert.equal(await computeTreeDigest(sourceSite), before);
  assert.deepEqual(collectFiles(output), collectFiles(sourceSite));
});

test('source validation rejects beacon, legacy state, missing notice, body, path, and symlink defects', async (t) => {
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
    ['legacy analytics attributes', (site) => {
      const file = path.join(site, 'index.html');
      writeFileSync(file, readFileSync(file, 'utf8').replace('<html lang="ja">', '<html lang="ja" data-analytics-mode="disabled">'));
    }],
    ['missing privacy notice', (site) => {
      const file = path.join(site, 'index.html');
      writeFileSync(file, readFileSync(file, 'utf8').replace('data-privacy-notice', 'aria-label'));
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
    '--manifest', manifestPath
  ], { encoding: 'utf8' });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /output already exists/i);
  assert.equal(readFileSync(sentinel, 'utf8'), 'preserve me');
});

test('prepare CLI builds the byte-identical hosting-managed artifact without analytics credentials', async (t) => {
  const temporary = temporaryDirectory(t);
  const manifestPath = writeManifest(temporary, manifestValue());
  const output = path.join(temporary, 'prepared-site');
  const actionsOutput = path.join(temporary, 'actions-output');
  const result = spawnSync(process.execPath, [adapterPath,
    'prepare', '--source', sourceSite, '--output', output,
    '--manifest', manifestPath
  ], {
    encoding: 'utf8',
    env: { ...process.env, CLOUDFLARE_WEB_ANALYTICS_TOKEN: 'fictional-token-must-not-be-used', GITHUB_OUTPUT: actionsOutput }
  });
  assert.equal(result.status, 0, result.stderr);
  const digest = await computeTreeDigest(output);
  assert.ok(readFileSync(actionsOutput, 'utf8').includes(`final_digest=${digest}\n`));
  const html = readFileSync(path.join(output, 'editor/index.html'), 'utf8');
  assert.equal(digest, await computeTreeDigest(sourceSite));
  assert.ok(!html.includes(CLOUDFLARE_BEACON_URL));
  assert.ok(!html.includes('fictional-token-must-not-be-used'));
});
