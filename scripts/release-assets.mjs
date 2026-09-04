import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, lstat, mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

import { checkReleaseAssets } from './check-release-assets.mjs';
import { computeSiteHash, generateReleaseAssets } from './generate-doc-assets.mjs';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const fullCommitPattern = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/;
const targets = Object.freeze([
  'docs/assets-manifest.json',
  'docs/screenshots/ja.png',
  'docs/screenshots/zh-CN.png',
  'docs/screenshots/en.png',
  'output/pdf/ja-a4.pdf',
  'output/pdf/zh-CN-a4.pdf',
  'output/pdf/en-letter.pdf'
]);

function fail(message) {
  throw new Error(`Release assets failed: ${message}`);
}

function checkedPath(base, relativePath) {
  if (!targets.includes(relativePath)) fail(`unexpected release asset path: ${relativePath}`);
  const resolved = path.resolve(base, relativePath);
  if (!resolved.startsWith(`${base}${path.sep}`)) fail(`release asset escapes its root: ${relativePath}`);
  return resolved;
}

async function assertRegularFile(file) {
  let metadata;
  try {
    metadata = await lstat(file);
  } catch {
    fail(`required release asset is missing: ${file}`);
  }
  if (!metadata.isFile() || metadata.isSymbolicLink()) fail(`release asset is not a regular file: ${file}`);
}

async function assertNoSymlinks(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) fail(`archive contains a symbolic link: ${entryPath}`);
    if (entry.isDirectory()) await assertNoSymlinks(entryPath);
  }
}

async function sha256(file) {
  return createHash('sha256').update(await readFile(file)).digest('hex');
}

async function validatePng(file, output) {
  const data = await readFile(file);
  assert.deepEqual([...data.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(data.subarray(12, 16).toString('ascii'), 'IHDR');
  assert.equal(data.readUInt32BE(16), output.screenshot.width);
  assert.equal(data.readUInt32BE(20), output.screenshot.height);
}

async function validatePdf(file, output) {
  const loadingTask = getDocument({
    data: new Uint8Array(await readFile(file)),
    disableFontFace: true,
    isEvalSupported: false,
    useSystemFonts: true
  });
  const document = await loadingTask.promise;
  const size = output.paper === 'A4'
    ? { height: 841.89, width: 595.28 }
    : { height: 792, width: 612 };
  try {
    assert.ok(document.numPages >= 1);
    const pages = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      assert.ok(Math.abs(viewport.width - size.width) < 1);
      assert.ok(Math.abs(viewport.height - size.height) < 1);
      pages.push(content.items.map((item) => item.str).join(' ').replace(/\s+/g, ''));
    }
    assert.ok(pages[0].includes(output.firstText.replace(/\s+/g, '')));
    assert.ok(pages.at(-1).includes(output.lastText.replace(/\s+/g, '')));
  } finally {
    await loadingTask.destroy();
  }
}

export async function verifyReleaseAssets({ assetRoot, sourceCommit, sourceRoot }) {
  await checkReleaseAssets({ assetRoot, sourceRoot });
  const manifestFile = checkedPath(assetRoot, 'docs/assets-manifest.json');
  await assertRegularFile(manifestFile);
  const manifest = JSON.parse(await readFile(manifestFile, 'utf8'));
  const siteHash = await computeSiteHash(path.join(sourceRoot, 'site'));
  if (manifest.source?.siteHash !== siteHash) fail('candidate manifest site hash does not match the archived site');
  if (sourceCommit && manifest.source?.commit !== sourceCommit) fail('candidate manifest source commit does not match the archived commit');
  if (!Array.isArray(manifest.outputs) || manifest.outputs.length !== 3) fail('candidate manifest must describe three locales');

  const expectedLocales = new Set(['ja', 'zh-CN', 'en']);
  for (const output of manifest.outputs) {
    if (!expectedLocales.delete(output.locale)) fail(`unexpected manifest locale: ${output.locale}`);
    for (const [kind, validator] of [['screenshot', validatePng], ['pdf', validatePdf]]) {
      const record = output[kind];
      const absolute = checkedPath(assetRoot, record?.path);
      await assertRegularFile(absolute);
      if (record.sha256 !== await sha256(absolute)) fail(`${kind} hash does not match the candidate manifest`);
      await validator(absolute, output);
    }
  }
  if (expectedLocales.size) fail('candidate manifest is missing a locale');
  return { siteHash, targets: [...targets] };
}

function command(commandName, args, { binary = false, cwd, input } = {}) {
  return execFileSync(commandName, args, {
    cwd,
    encoding: binary ? undefined : 'utf8',
    input,
    maxBuffer: 32 * 1024 * 1024,
    stdio: ['pipe', 'pipe', 'pipe']
  });
}

function resolveCommit(cwd, sourceSha, runCommand = command) {
  if (!fullCommitPattern.test(sourceSha || '')) fail('source SHA must be a full lowercase commit id');
  try {
    const resolved = String(runCommand('git', [
      'rev-parse', '--verify', '--end-of-options', `${sourceSha}^{commit}`
    ], { cwd })).trim();
    if (!fullCommitPattern.test(resolved)) fail('source SHA did not resolve to a full commit id');
    return resolved;
  } catch (error) {
    if (error.message.startsWith('Release assets failed:')) throw error;
    fail('unable to resolve the source commit');
  }
}

function archiveCommit(cwd, sourceCommit, destination, runCommand = command) {
  let archive;
  try {
    archive = runCommand('git', ['archive', '--format=tar', '--end-of-options', sourceCommit], { binary: true, cwd });
    runCommand('tar', ['-xf', '-', '-C', destination], { input: archive });
  } catch {
    fail('unable to create the clean archive staging input');
  }
}

async function assertPromotionPaths(cwd, runCommand = command) {
  for (const args of [
    ['diff', '--name-only', '--', ...targets],
    ['diff', '--cached', '--name-only', '--', ...targets]
  ]) {
    let changed;
    try {
      changed = String(runCommand('git', args, { cwd })).trim();
    } catch {
      fail('unable to verify that promotion targets are unchanged');
    }
    if (changed) fail('promotion targets have uncommitted changes');
  }
  for (const target of targets) {
    try {
      runCommand('git', ['ls-files', '--error-unmatch', '--', target], { cwd });
    } catch {
      fail(`promotion target is not tracked: ${target}`);
    }
    const absolute = checkedPath(cwd, target);
    await assertRegularFile(absolute);
    for (let directory = path.dirname(absolute); directory !== cwd; directory = path.dirname(directory)) {
      const metadata = await lstat(directory);
      if (!metadata.isDirectory() || metadata.isSymbolicLink()) fail(`promotion path is unsafe: ${directory}`);
    }
  }
}

export async function promoteReleaseAssets({ candidateRoot, cwd, operations = {} }) {
  const copy = operations.copyFile || copyFile;
  const createTemporaryDirectory = operations.mkdtemp || mkdtemp;
  const removeTemporaryDirectory = operations.rm || rm;
  const backup = await createTemporaryDirectory(path.join(os.tmpdir(), 'resume-release-assets-backup-'));
  const restored = [];
  try {
    for (const target of targets) {
      const original = checkedPath(cwd, target);
      const saved = path.join(backup, target);
      await mkdir(path.dirname(saved), { recursive: true });
      await copy(original, saved);
    }
    try {
      for (const target of targets) {
        await copy(checkedPath(candidateRoot, target), checkedPath(cwd, target));
      }
    } catch (error) {
      for (const target of targets) {
        await copy(path.join(backup, target), checkedPath(cwd, target));
        restored.push(target);
      }
      fail(`promotion failed and original outputs were restored (${restored.length}/${targets.length}): ${error.message}`);
    }
  } finally {
    await removeTemporaryDirectory(backup, { force: true, recursive: true });
  }
}

export async function stageReleaseAssets({
  cwd = root,
  onCandidateReady,
  ownerApproval = false,
  sourceSha,
  operations = {}
}) {
  const runCommand = operations.command || command;
  const sourceCommit = resolveCommit(cwd, sourceSha, runCommand);
  const temporary = await (operations.mkdtemp || mkdtemp)(path.join(os.tmpdir(), 'resume-release-assets-'));
  try {
    const sourceRoot = path.join(temporary, 'source');
    await mkdir(sourceRoot);
    archiveCommit(cwd, sourceCommit, sourceRoot, runCommand);
    await assertNoSymlinks(sourceRoot);
    const candidateRoot = path.join(temporary, 'candidate');
    await mkdir(candidateRoot);
    await (operations.generateReleaseAssets || generateReleaseAssets)({ outputRoot: candidateRoot, sourceCommit, sourceRoot });
    const checked = await (operations.verifyReleaseAssets || verifyReleaseAssets)({ assetRoot: candidateRoot, sourceCommit, sourceRoot });
    const result = { ...checked, sourceCommit, promoted: false };
    if (onCandidateReady) await onCandidateReady(result);
    if (!ownerApproval) return result;
    await assertPromotionPaths(cwd, runCommand);
    await promoteReleaseAssets({ candidateRoot, cwd, operations });
    return { ...result, promoted: true };
  } finally {
    await (operations.rm || rm)(temporary, { force: true, recursive: true });
  }
}

export function parseArguments(args) {
  const values = { ownerApproval: false };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--owner-approval' && !values.ownerApproval) {
      values.ownerApproval = true;
      continue;
    }
    if (argument === '--source-sha' && !values.sourceSha && args[index + 1] && !args[index + 1].startsWith('--')) {
      values.sourceSha = args[index + 1];
      index += 1;
      continue;
    }
    fail('invalid command arguments');
  }
  if (!values.sourceSha) fail('source SHA is required');
  return values;
}

async function main() {
  const values = parseArguments(process.argv.slice(2));
  const printCandidate = (result) => {
    console.log(`Release assets staged from ${result.sourceCommit}.`);
    console.log(`Site hash: ${result.siteHash}`);
    console.log(`Promotion targets: ${result.targets.join(', ')}`);
  };
  const result = await stageReleaseAssets({ ...values, onCandidateReady: printCandidate });
  if (result.promoted) console.log('Owner-approved promotion completed.');
  else console.log('No tracked output was changed. Re-run with --owner-approval only after owner review.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
