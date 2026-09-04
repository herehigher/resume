import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { mkdir, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  parseArguments,
  promoteReleaseAssets,
  stageReleaseAssets
} from '../scripts/release-assets.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const targets = [
  'docs/assets-manifest.json',
  'docs/screenshots/ja.png',
  'docs/screenshots/zh-CN.png',
  'docs/screenshots/en.png',
  'output/pdf/ja-a4.pdf',
  'output/pdf/zh-CN-a4.pdf',
  'output/pdf/en-letter.pdf'
];

test('release asset command requires a pinned commit and only accepts explicit owner approval', () => {
  const sourceSha = 'a'.repeat(40);
  assert.deepEqual(parseArguments(['--source-sha', sourceSha]), { ownerApproval: false, sourceSha });
  assert.deepEqual(parseArguments(['--owner-approval', '--source-sha', sourceSha]), { ownerApproval: true, sourceSha });
  assert.throws(() => parseArguments([]), /source SHA is required/);
  assert.throws(() => parseArguments(['--approve', '--source-sha', sourceSha]), /invalid command arguments/);
  assert.throws(() => parseArguments(['--owner-approval', '--owner-approval', '--source-sha', sourceSha]), /invalid command arguments/);
});

test('staging uses a clean git archive and leaves tracked outputs untouched without owner approval', async (t) => {
  const sentinels = [
    path.join(root, '.release-assets-untracked-sentinel'),
    path.join(root, 'node_modules', '.release-assets-ignored-sentinel')
  ];
  for (const sentinel of sentinels) writeFileSync(sentinel, 'must not enter git archive');
  t.after(() => {
    for (const sentinel of sentinels) rmSync(sentinel, { force: true });
  });
  const sourceSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  const seen = [];
  let plan;

  const result = await stageReleaseAssets({
    cwd: root,
    onCandidateReady: (candidate) => {
      plan = candidate;
    },
    sourceSha,
    operations: {
      generateReleaseAssets: async ({ sourceRoot }) => {
        seen.push(...sentinels.map((sentinel) => path.join(sourceRoot, path.relative(root, sentinel))));
        assert.equal(readFileSync(path.join(sourceRoot, 'package.json'), 'utf8').includes('resume-studio'), true);
        for (const sentinel of seen) assert.equal(existsSync(sentinel), false);
      },
      verifyReleaseAssets: async () => ({ siteHash: 'b'.repeat(64), targets })
    }
  });

  assert.equal(result.promoted, false);
  assert.equal(seen.length, 2);
  assert.deepEqual(plan, result);
});

async function writeTargets(directory, prefix) {
  for (const target of targets) {
    const file = path.join(directory, target);
    await mkdir(path.dirname(file), { recursive: true });
    writeFileSync(file, `${prefix}:${target}`);
  }
}

test('a failed promotion restores every original tracked output', async (t) => {
  const temporary = mkdtempSync(path.join(os.tmpdir(), 'resume-release-assets-promotion-test-'));
  t.after(() => rmSync(temporary, { force: true, recursive: true }));
  const candidateRoot = path.join(temporary, 'candidate');
  const workingRoot = path.join(temporary, 'working');
  await writeTargets(candidateRoot, 'candidate');
  await writeTargets(workingRoot, 'original');

  await assert.rejects(
    promoteReleaseAssets({
      candidateRoot,
      cwd: workingRoot,
      operations: {
        copyFile: async (source, destination) => {
          if (source.startsWith(candidateRoot) && destination.endsWith('docs/screenshots/zh-CN.png')) {
            throw new Error('simulated copy failure');
          }
          const { copyFile } = await import('node:fs/promises');
          await copyFile(source, destination);
        }
      }
    }),
    /original outputs were restored \(7\/7\)/
  );

  for (const target of targets) {
    assert.equal(readFileSync(path.join(workingRoot, target), 'utf8'), `original:${target}`);
  }
});

test('a successful promotion replaces the complete target set', async (t) => {
  const temporary = mkdtempSync(path.join(os.tmpdir(), 'resume-release-assets-promotion-test-'));
  t.after(() => rmSync(temporary, { force: true, recursive: true }));
  const candidateRoot = path.join(temporary, 'candidate');
  const workingRoot = path.join(temporary, 'working');
  await writeTargets(candidateRoot, 'candidate');
  await writeTargets(workingRoot, 'original');

  await promoteReleaseAssets({ candidateRoot, cwd: workingRoot });
  for (const target of targets) {
    assert.equal(readFileSync(path.join(workingRoot, target), 'utf8'), `candidate:${target}`);
  }
  assert.deepEqual(await readdir(path.join(workingRoot, 'docs/screenshots')), ['en.png', 'ja.png', 'zh-CN.png']);
});
