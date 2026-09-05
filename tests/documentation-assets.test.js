import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  parseArguments as parseGenerationArguments,
  prepareDocumentationOutputDirectory,
  resolveSourceCommit
} from '../scripts/generate-doc-assets.mjs';
import { parseArguments as parseVerificationArguments } from '../scripts/verify-doc-assets.mjs';

test('documentation asset commands require explicit temporary output and source provenance', () => {
  const sourceSha = 'a'.repeat(40);
  assert.deepEqual(parseGenerationArguments(['--output-dir', '/private/tmp/doc-assets', '--source-sha', sourceSha]), {
    outputRoot: '/private/tmp/doc-assets',
    sourceCommit: sourceSha
  });
  assert.throws(() => parseGenerationArguments(['--output-dir', '/private/tmp/doc-assets']), /source-sha/);
  assert.throws(() => parseGenerationArguments(['--source-sha', sourceSha]), /output-dir/);
  assert.throws(() => parseGenerationArguments(['--output-dir', '/private/tmp/doc-assets', '--output-dir', '/private/tmp/other', '--source-sha', sourceSha]), /Invalid/);
  assert.deepEqual(parseVerificationArguments(['--asset-root', '/private/tmp/doc-assets', '--source-root', '/source', '--source-sha', sourceSha]), {
    assetRoot: '/private/tmp/doc-assets',
    sourceRoot: '/source',
    sourceSha
  });
  assert.throws(() => parseVerificationArguments(['--asset-root', '/private/tmp/doc-assets']), /Provide/);
});

test('documentation assets require a new empty directory independent from source', async (t) => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'resume-doc-assets-test-'));
  t.after(() => rm(temporary, { force: true, recursive: true }));
  const sourceRoot = path.join(temporary, 'source');
  const outputRoot = path.join(temporary, 'output');
  await mkdir(sourceRoot);

  assert.equal(await prepareDocumentationOutputDirectory({ outputRoot, sourceRoot }), await realpath(outputRoot));
  await writeFile(path.join(outputRoot, 'sentinel'), 'keep');
  await assert.rejects(
    prepareDocumentationOutputDirectory({ outputRoot, sourceRoot }),
    /must be empty/
  );
  assert.equal(await readFile(path.join(outputRoot, 'sentinel'), 'utf8'), 'keep');
  await assert.rejects(
    prepareDocumentationOutputDirectory({ outputRoot: path.join(sourceRoot, 'generated'), sourceRoot }),
    /independent/
  );
});

test('documentation asset provenance rejects a dirty site checkout', async (t) => {
  const sourceRoot = await mkdtemp(path.join(os.tmpdir(), 'resume-doc-assets-source-test-'));
  t.after(() => rm(sourceRoot, { force: true, recursive: true }));
  await mkdir(path.join(sourceRoot, 'site'));
  await writeFile(path.join(sourceRoot, 'site', 'index.html'), '<title>sample</title>');
  execFileSync('git', ['init', '--initial-branch=main'], { cwd: sourceRoot, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.name', 'Documentation Assets Test'], { cwd: sourceRoot });
  execFileSync('git', ['config', 'user.email', 'documentation-assets@example.invalid'], { cwd: sourceRoot });
  execFileSync('git', ['add', 'site/index.html'], { cwd: sourceRoot });
  execFileSync('git', ['-c', 'commit.gpgSign=false', 'commit', '-m', 'add sample site'], { cwd: sourceRoot, stdio: 'ignore' });
  const sourceSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: sourceRoot, encoding: 'utf8' }).trim();
  assert.equal(resolveSourceCommit(sourceRoot, sourceSha), sourceSha);

  await writeFile(path.join(sourceRoot, 'site', 'index.html'), '<title>changed</title>');
  assert.throws(() => resolveSourceCommit(sourceRoot, sourceSha), /uncommitted site changes/);
});
