import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
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
  validateReleaseSource
} from '../scripts/prepare-site-artifact.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const sourceSite = path.join(root, 'site');
const scriptPath = path.join(root, 'scripts/prepare-site-artifact.mjs');

function temporaryDirectory(t) {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'resume-site-artifact-test-'));
  t.after(() => rmSync(directory, { force: true, recursive: true }));
  return directory;
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

test('validate CLI checks the complete source site and reports its digest', async (t) => {
  const temporary = temporaryDirectory(t);
  const result = spawnSync(process.execPath, [scriptPath, 'validate', '--source', sourceSite], {
    encoding: 'utf8',
    env: { ...process.env, GITHUB_OUTPUT: path.join(temporary, 'actions-output') }
  });
  const sourceDigest = await computeTreeDigest(sourceSite);
  assert.equal((await validateReleaseSource({ sourceDirectory: sourceSite })).sourceDigest, sourceDigest);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, new RegExp(`Validated site source ${sourceDigest}\\.`));
  assert.equal(readFileSync(path.join(temporary, 'actions-output'), 'utf8'), `source_digest=${sourceDigest}\n`);

  const invalidSite = path.join(temporary, 'invalid-site');
  cpSync(sourceSite, invalidSite, { recursive: true });
  writeFileSync(path.join(invalidSite, 'extra.html'), '<html></html>');
  const invalidResult = spawnSync(process.execPath, [scriptPath, 'validate', '--source', invalidSite], { encoding: 'utf8' });
  assert.notEqual(invalidResult.status, 0);
  assert.match(invalidResult.stderr, /exactly the public and editor HTML paths/);
});

test('prepared site artifact is byte-identical to the validated source', async (t) => {
  const temporary = temporaryDirectory(t);
  const sourceDigest = await computeTreeDigest(sourceSite);
  const output = path.join(temporary, 'output');
  const before = await computeTreeDigest(sourceSite);

  const result = await prepareArtifact({
    outputDirectory: output,
    sourceDirectory: sourceSite
  });

  assert.equal(result.artifactDigest, sourceDigest);
  assert.equal(await computeTreeDigest(output), sourceDigest);
  assert.equal(await computeTreeDigest(sourceSite), before);
  assert.deepEqual(collectFiles(output), collectFiles(sourceSite));
});

test('preparation rejects symlinked source roots and output paths that resolve into the source tree', async (t) => {
  const temporary = temporaryDirectory(t);
  const source = path.join(temporary, 'site');
  const sourceLink = path.join(temporary, 'site-link');
  const outputParentLink = path.join(temporary, 'output-parent-link');
  cpSync(sourceSite, source, { recursive: true });
  symlinkSync(source, sourceLink, 'dir');
  symlinkSync(source, outputParentLink, 'dir');
  await assert.rejects(prepareArtifact({
    sourceDirectory: sourceLink,
    outputDirectory: path.join(temporary, 'source-link-output')
  }), /source directory must not be a symbolic link/i);
  await assert.rejects(prepareArtifact({
    sourceDirectory: source,
    outputDirectory: path.join(outputParentLink, 'prepared')
  }), /outside the source tree/);
  assert.deepEqual(collectFiles(source), collectFiles(sourceSite));
});

test('site source validation rejects beacon, legacy state, missing notice, body, path, and symlink defects', async (t) => {
  const temporary = temporaryDirectory(t);
  const cases = [
    ['existing beacon', (site) => {
      const file = path.join(site, 'index.html');
      writeFileSync(file, readFileSync(file, 'utf8').replace('</body>', '<script src="https://static.cloudflareinsights.com/beacon.min.js"></script></body>'));
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
    await assert.rejects(prepareArtifact({
      outputDirectory: `${site}-output`,
      sourceDirectory: site
    }), undefined, name);
  }
});

test('artifact output cannot overlap the source tree', async (t) => {
  const temporary = temporaryDirectory(t);
  const source = path.join(temporary, 'site');
  cpSync(sourceSite, source, { recursive: true });
  const originalDigest = await computeTreeDigest(source);
  const originalFiles = collectFiles(source);

  const absentParent = path.join(source, 'must-not-be-created', 'deeper');
  await assert.rejects(prepareArtifact({
    outputDirectory: path.join(absentParent, 'artifact'),
    sourceDirectory: source
  }), /outside the source tree/);
  assert.equal(existsSync(path.join(source, 'must-not-be-created')), false);
  assert.equal(await computeTreeDigest(source), originalDigest);
  assert.deepEqual(collectFiles(source), originalFiles);

  mkdirSync(path.join(source, 'nested'));
  const nestedDigest = await computeTreeDigest(source);
  const nestedFiles = collectFiles(source);
  await assert.rejects(prepareArtifact({
    outputDirectory: path.join(source, 'nested', 'artifact'),
    sourceDirectory: source
  }), /outside the source tree/);
  assert.equal(await computeTreeDigest(source), nestedDigest);
  assert.deepEqual(collectFiles(source), nestedFiles);
});

test('prepare CLI refuses an existing output without changing its sentinel', async (t) => {
  const temporary = temporaryDirectory(t);
  const output = path.join(temporary, 'existing-output');
  const sentinel = path.join(output, 'sentinel.txt');
  mkdirSync(output);
  writeFileSync(sentinel, 'preserve me');

  const result = spawnSync(process.execPath, [
    scriptPath,
    'prepare',
    '--source', sourceSite,
    '--output', output
  ], { encoding: 'utf8' });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /output already exists/i);
  assert.equal(readFileSync(sentinel, 'utf8'), 'preserve me');
});

test('prepare CLI builds and reports the byte-identical site artifact', async (t) => {
  const temporary = temporaryDirectory(t);
  const output = path.join(temporary, 'prepared-site');
  const actionsOutput = path.join(temporary, 'actions-output');
  const result = spawnSync(process.execPath, [scriptPath,
    'prepare', '--source', sourceSite, '--output', output
  ], {
    encoding: 'utf8',
    env: { ...process.env, GITHUB_OUTPUT: actionsOutput }
  });
  assert.equal(result.status, 0, result.stderr);
  const digest = await computeTreeDigest(output);
  assert.ok(readFileSync(actionsOutput, 'utf8').includes(`artifact_digest=${digest}\n`));
  assert.ok(readFileSync(actionsOutput, 'utf8').includes(`source_digest=${digest}\n`));
  const html = readFileSync(path.join(output, 'editor/index.html'), 'utf8');
  assert.equal(digest, await computeTreeDigest(sourceSite));
  assert.doesNotMatch(html, /\bdata-cf-beacon\s*=|cloudflareinsights\.com/i);
});
