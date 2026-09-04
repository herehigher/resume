import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { mkdir, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  computeReleaseSourceTreeDigest,
  parseArguments,
  promoteReleaseAssetBundle,
  promoteReleaseAssets,
  stageReleaseAssets,
  verifyReleaseAssetBundle
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
  const bundlePath = '/private/tmp/resume-release-assets-example';
  assert.deepEqual(parseArguments(['--source-sha', sourceSha]), { sourceSha });
  assert.deepEqual(parseArguments(['--bundle', bundlePath, '--owner-approval']), { bundlePath, ownerApproval: true });
  assert.throws(() => parseArguments([]), /provide --source-sha/);
  assert.throws(() => parseArguments(['--owner-approval', '--source-sha', sourceSha]), /provide --source-sha/);
  assert.throws(() => parseArguments(['--bundle', bundlePath]), /provide --source-sha/);
  assert.throws(() => parseArguments(['--approve', '--source-sha', sourceSha]), /invalid command arguments/);
  assert.throws(() => parseArguments(['--owner-approval', '--owner-approval', '--bundle', bundlePath]), /invalid command arguments/);
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
        await writeTargets(path.join(path.dirname(sourceRoot), 'candidate'), 'candidate');
      },
      verifyReleaseAssets: async () => ({ siteHash: 'b'.repeat(64), targets })
    }
  });

  assert.equal(seen.length, 2);
  assert.deepEqual(plan, result);
  assert.equal(existsSync(result.bundlePath), true);
  assert.equal(statSync(result.bundlePath).mode & 0o777, 0o700);
  await import('node:fs/promises').then(({ rm }) => rm(result.bundlePath, { force: true, recursive: true }));
});

async function writeTargets(directory, prefix) {
  for (const target of targets) {
    const file = path.join(directory, target);
    await mkdir(path.dirname(file), { recursive: true });
    writeFileSync(file, `${prefix}:${target}`);
  }
}

function approvedHashes(candidateRoot) {
  return Object.fromEntries(targets.map((target) => [
    target,
    createHash('sha256').update(readFileSync(path.join(candidateRoot, target))).digest('hex')
  ]));
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
        approvedAssetHashes: approvedHashes(candidateRoot),
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

  await promoteReleaseAssets({
    candidateRoot,
    cwd: workingRoot,
    operations: { approvedAssetHashes: approvedHashes(candidateRoot) }
  });
  for (const target of targets) {
    assert.equal(readFileSync(path.join(workingRoot, target), 'utf8'), `candidate:${target}`);
  }
  assert.deepEqual(await readdir(path.join(workingRoot, 'docs/screenshots')), ['en.png', 'ja.png', 'zh-CN.png']);
});

test('promotion retains a backup and attempts every restoration after a restoration failure', async (t) => {
  const temporary = mkdtempSync(path.join(os.tmpdir(), 'resume-release-assets-restore-test-'));
  const backup = path.join(temporary, 'resume-release-assets-backup-retained');
  t.after(() => rmSync(temporary, { force: true, recursive: true }));
  const candidateRoot = path.join(temporary, 'candidate');
  const workingRoot = path.join(temporary, 'working');
  await writeTargets(candidateRoot, 'candidate');
  await writeTargets(workingRoot, 'original');
  const restored = [];

  await assert.rejects(promoteReleaseAssets({
    candidateRoot,
    cwd: workingRoot,
    operations: {
      approvedAssetHashes: approvedHashes(candidateRoot),
      copyFile: async (source, destination) => {
        if (source.startsWith(candidateRoot) && destination.endsWith('docs/screenshots/zh-CN.png')) {
          throw new Error('simulated promotion failure');
        }
        if (source.startsWith(backup)) {
          restored.push(destination);
          if (destination.endsWith('docs/screenshots/ja.png')) throw new Error('simulated restoration failure');
        }
        const { copyFile } = await import('node:fs/promises');
        await copyFile(source, destination);
      },
      mkdtemp: async () => backup,
      rm: async () => assert.fail('incomplete restoration must retain the backup')
    }
  }), new RegExp(`restoration is incomplete \\(${targets.length - 1}\\/${targets.length}\\)\\. Backup retained at ${backup}`));

  assert.equal(restored.length, targets.length);
  assert.equal(existsSync(backup), true);
  for (const target of targets) {
    assert.equal(readFileSync(path.join(backup, target), 'utf8'), `original:${target}`);
  }
});

function initializeWorkingRepository(directory) {
  execFileSync('git', ['init', '--initial-branch=main'], { cwd: directory, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.name', 'Release Assets Test'], { cwd: directory });
  execFileSync('git', ['config', 'user.email', 'release-assets@example.invalid'], { cwd: directory });
  execFileSync('git', ['config', 'commit.gpgSign', 'false'], { cwd: directory });
  execFileSync('git', ['add', '.'], { cwd: directory });
  execFileSync('git', ['commit', '-m', 'tracked release assets'], { cwd: directory, stdio: 'ignore' });
}

test('promotion revalidates and binds approval to the staged candidate bundle', async (t) => {
  const temporary = mkdtempSync(path.join(os.tmpdir(), 'resume-release-assets-bundle-test-'));
  t.after(() => rmSync(temporary, { force: true, recursive: true }));
  const workingRoot = path.join(temporary, 'working');
  await writeTargets(workingRoot, 'original');
  initializeWorkingRepository(workingRoot);
  const sourceSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: workingRoot, encoding: 'utf8' }).trim();
  const verifier = async ({ sourceCommit, sourceRoot }) => ({
    siteHash: 'b'.repeat(64),
    sourceCommit,
    sourceRoot,
    targets: [...targets]
  });
  const staged = await stageReleaseAssets({
    cwd: workingRoot,
    sourceSha,
    operations: {
      generateReleaseAssets: async ({ outputRoot }) => writeTargets(outputRoot, 'candidate'),
      verifyReleaseAssets: verifier
    }
  });
  const stagedTarget = path.join(staged.bundlePath, 'candidate', targets[0]);
  writeFileSync(stagedTarget, 'tampered candidate');
  await assert.rejects(verifyReleaseAssetBundle({
    bundlePath: staged.bundlePath,
    cwd: workingRoot,
    operations: { verifyReleaseAssets: verifier }
  }), /bundle asset hash no longer matches its metadata/);
  await assert.rejects(promoteReleaseAssetBundle({
    bundlePath: staged.bundlePath,
    cwd: workingRoot,
    operations: { verifyReleaseAssets: verifier }
  }), /bundle asset hash no longer matches its metadata/);
  for (const target of targets) {
    assert.equal(readFileSync(path.join(workingRoot, target), 'utf8'), `original:${target}`);
  }
  assert.equal(existsSync(staged.bundlePath), true);
});

test('promotion rejects a forged bundle source even when its metadata digest is rewritten', async (t) => {
  const temporary = mkdtempSync(path.join(os.tmpdir(), 'resume-release-assets-source-binding-test-'));
  t.after(() => rmSync(temporary, { force: true, recursive: true }));
  const workingRoot = path.join(temporary, 'working');
  await writeTargets(workingRoot, 'original');
  initializeWorkingRepository(workingRoot);
  const sourceSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: workingRoot, encoding: 'utf8' }).trim();
  const verifier = async ({ sourceCommit, sourceRoot }) => ({
    siteHash: 'b'.repeat(64), sourceCommit, sourceRoot, targets: [...targets]
  });
  const staged = await stageReleaseAssets({
    cwd: workingRoot,
    sourceSha,
    operations: {
      generateReleaseAssets: async ({ outputRoot }) => writeTargets(outputRoot, 'candidate'),
      verifyReleaseAssets: verifier
    }
  });
  const sourceFile = path.join(staged.bundlePath, 'source', targets[0]);
  writeFileSync(sourceFile, 'forged source tree');
  const metadataPath = path.join(staged.bundlePath, 'release-assets-bundle.json');
  const metadata = JSON.parse(readFileSync(metadataPath, 'utf8'));
  metadata.sourceTreeSha256 = await computeReleaseSourceTreeDigest(path.join(staged.bundlePath, 'source'));
  writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);

  await assert.rejects(verifyReleaseAssetBundle({
    bundlePath: staged.bundlePath,
    cwd: workingRoot,
    operations: { verifyReleaseAssets: verifier }
  }), /bundle source tree does not match a fresh archive/);
});

test('promotion rejects a bundle whose claimed source commit has changed', async (t) => {
  const temporary = mkdtempSync(path.join(os.tmpdir(), 'resume-release-assets-commit-binding-test-'));
  t.after(() => rmSync(temporary, { force: true, recursive: true }));
  const workingRoot = path.join(temporary, 'working');
  await writeTargets(workingRoot, 'original');
  initializeWorkingRepository(workingRoot);
  const sourceSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: workingRoot, encoding: 'utf8' }).trim();
  const verifier = async ({ sourceCommit, sourceRoot }) => ({
    siteHash: 'b'.repeat(64), sourceCommit, sourceRoot, targets: [...targets]
  });
  const staged = await stageReleaseAssets({
    cwd: workingRoot,
    sourceSha,
    operations: {
      generateReleaseAssets: async ({ outputRoot }) => writeTargets(outputRoot, 'candidate'),
      verifyReleaseAssets: verifier
    }
  });
  writeFileSync(path.join(workingRoot, 'later-commit.txt'), 'different archive');
  execFileSync('git', ['add', 'later-commit.txt'], { cwd: workingRoot });
  execFileSync('git', ['commit', '-m', 'later source'], { cwd: workingRoot, stdio: 'ignore' });
  const metadataPath = path.join(staged.bundlePath, 'release-assets-bundle.json');
  const metadata = JSON.parse(readFileSync(metadataPath, 'utf8'));
  metadata.sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: workingRoot, encoding: 'utf8' }).trim();
  writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);

  await assert.rejects(verifyReleaseAssetBundle({
    bundlePath: staged.bundlePath,
    cwd: workingRoot,
    operations: { verifyReleaseAssets: verifier }
  }), /bundle source tree does not match a fresh archive/);
});

test('candidate bytes are rechecked immediately before each promotion copy', async (t) => {
  const temporary = mkdtempSync(path.join(os.tmpdir(), 'resume-release-assets-rehash-test-'));
  t.after(() => rmSync(temporary, { force: true, recursive: true }));
  const candidateRoot = path.join(temporary, 'candidate');
  const workingRoot = path.join(temporary, 'working');
  await writeTargets(candidateRoot, 'candidate');
  await writeTargets(workingRoot, 'original');
  const hashes = approvedHashes(candidateRoot);
  writeFileSync(path.join(candidateRoot, targets[0]), 'changed after approval');

  await assert.rejects(promoteReleaseAssets({
    candidateRoot,
    cwd: workingRoot,
    operations: { approvedAssetHashes: hashes }
  }), /candidate asset changed after approval/);
  for (const target of targets) {
    assert.equal(readFileSync(path.join(workingRoot, target), 'utf8'), `original:${target}`);
  }
});

test('successful promotion reports a retained backup when cleanup fails', async (t) => {
  const temporary = mkdtempSync(path.join(os.tmpdir(), 'resume-release-assets-cleanup-test-'));
  const backup = path.join(temporary, 'resume-release-assets-backup-retained');
  t.after(() => rmSync(temporary, { force: true, recursive: true }));
  const candidateRoot = path.join(temporary, 'candidate');
  const workingRoot = path.join(temporary, 'working');
  await writeTargets(candidateRoot, 'candidate');
  await writeTargets(workingRoot, 'original');

  const result = await promoteReleaseAssets({
    candidateRoot,
    cwd: workingRoot,
    operations: {
      approvedAssetHashes: approvedHashes(candidateRoot),
      mkdtemp: async () => backup,
      rm: async () => { throw new Error('simulated cleanup failure'); }
    }
  });

  assert.deepEqual(result, { backupCleanup: 'retained', backupPath: backup });
  for (const target of targets) {
    assert.equal(readFileSync(path.join(workingRoot, target), 'utf8'), `candidate:${target}`);
    assert.equal(readFileSync(path.join(backup, target), 'utf8'), `original:${target}`);
  }
});

test('bundle path rejects a symlinked parent directory', { skip: process.platform === 'win32' }, async (t) => {
  const outside = mkdtempSync(path.join(os.tmpdir(), 'resume-release-assets-outside-'));
  const link = path.join(os.tmpdir(), `resume-release-assets-link-${process.pid}-${Date.now()}`);
  const bundle = path.join(outside, 'resume-release-assets-bundle');
  writeFileSync(path.join(outside, 'placeholder'), 'outside');
  await mkdir(bundle);
  symlinkSync(outside, link, 'dir');
  t.after(() => {
    unlinkSync(link);
    rmSync(outside, { force: true, recursive: true });
  });

  await assert.rejects(verifyReleaseAssetBundle({ bundlePath: path.join(link, path.basename(bundle)) }), /bundle path is unsafe/);
});

test('bundle path requires owner-only permissions on POSIX hosts', { skip: process.platform === 'win32' || typeof process.getuid !== 'function' }, async (t) => {
  const sourceSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  const verifier = async ({ sourceCommit, sourceRoot }) => ({
    siteHash: 'b'.repeat(64), sourceCommit, sourceRoot, targets: [...targets]
  });
  const staged = await stageReleaseAssets({
    cwd: root,
    sourceSha,
    operations: {
      generateReleaseAssets: async ({ outputRoot }) => writeTargets(outputRoot, 'candidate'),
      verifyReleaseAssets: verifier
    }
  });
  t.after(() => rmSync(staged.bundlePath, { force: true, recursive: true }));
  assert.equal(statSync(staged.bundlePath).uid, process.getuid());
  chmodSync(staged.bundlePath, 0o755);
  await assert.rejects(verifyReleaseAssetBundle({
    bundlePath: staged.bundlePath,
    operations: { verifyReleaseAssets: verifier }
  }), /owned by the current user with mode 0700/);
});
