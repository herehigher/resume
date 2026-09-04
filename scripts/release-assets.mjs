import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmod, copyFile, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

import { checkReleaseAssets } from './check-release-assets.mjs';
import { computeSiteHash, generateReleaseAssets } from './generate-doc-assets.mjs';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const fullCommitPattern = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/;
const bundleMetadataName = 'release-assets-bundle.json';
const bundlePrefix = 'resume-release-assets-';
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

async function collectTreeFiles(rootDirectory, directory = rootDirectory) {
  const files = [];
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((left, right) => Buffer.compare(Buffer.from(left.name), Buffer.from(right.name)));
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    const metadata = await lstat(absolute);
    if (metadata.isSymbolicLink()) fail(`archive contains a symbolic link: ${absolute}`);
    if (metadata.isDirectory()) {
      files.push(...await collectTreeFiles(rootDirectory, absolute));
      continue;
    }
    if (!metadata.isFile()) fail(`archive contains an unsupported file type: ${absolute}`);
    const relative = path.relative(rootDirectory, absolute).split(path.sep).join('/');
    if (!relative || relative.startsWith('../') || path.posix.isAbsolute(relative)) {
      fail(`archive file path is unsafe: ${relative}`);
    }
    files.push({ absolute, relative });
  }
  return files;
}

export async function computeReleaseSourceTreeDigest(directory) {
  const hash = createHash('sha256');
  for (const { absolute, relative } of await collectTreeFiles(directory)) {
    const contents = await readFile(absolute);
    hash.update(relative);
    hash.update('\0');
    hash.update(String(contents.byteLength));
    hash.update('\0');
    hash.update(contents);
    hash.update('\0');
  }
  return hash.digest('hex');
}

async function sha256(file) {
  return createHash('sha256').update(await readFile(file)).digest('hex');
}

async function assetHashes(assetRoot) {
  return Object.fromEntries(await Promise.all(targets.map(async (target) => [
    target,
    await sha256(checkedPath(assetRoot, target))
  ])));
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
  const approvedAssetHashes = operations.approvedAssetHashes;
  if (!approvedAssetHashes || typeof approvedAssetHashes !== 'object') {
    fail('approved candidate hashes are required for promotion');
  }
  for (const target of targets) {
    if (!/^[0-9a-f]{64}$/.test(approvedAssetHashes[target] || '')) fail('approved candidate hashes are invalid');
  }
  const backup = await createTemporaryDirectory(path.join(os.tmpdir(), 'resume-release-assets-backup-'));
  try {
    for (const target of targets) {
      const original = checkedPath(cwd, target);
      const saved = path.join(backup, target);
      await mkdir(path.dirname(saved), { recursive: true });
      await copy(original, saved);
    }
  } catch {
    try {
      await removeTemporaryDirectory(backup, { force: true, recursive: true });
    } catch {
      fail(`unable to create a complete promotion backup; no outputs were changed. Partial backup retained at ${backup}`);
    }
    fail('unable to create a complete promotion backup; no outputs were changed');
  }

  try {
    for (const target of targets) {
      const candidate = checkedPath(candidateRoot, target);
      if (await sha256(candidate) !== approvedAssetHashes[target]) {
        fail(`candidate asset changed after approval: ${target}`);
      }
      await copy(candidate, checkedPath(cwd, target));
    }
  } catch (error) {
    const restored = [];
    for (const target of targets) {
      try {
        await copy(path.join(backup, target), checkedPath(cwd, target));
        restored.push(target);
      } catch {
        // Continue every restore attempt so the retained backup can recover the remainder.
      }
    }
    if (restored.length !== targets.length) {
      fail(`promotion failed; restoration is incomplete (${restored.length}/${targets.length}). Backup retained at ${backup}`);
    }
    try {
      await removeTemporaryDirectory(backup, { force: true, recursive: true });
    } catch {
      fail(`promotion failed and original outputs were restored (${restored.length}/${targets.length}). Backup retained at ${backup}`);
    }
    fail(`promotion failed and original outputs were restored (${restored.length}/${targets.length}): ${error.message}`);
  }

  try {
    await removeTemporaryDirectory(backup, { force: true, recursive: true });
    return { backupCleanup: 'removed' };
  } catch {
    return { backupCleanup: 'retained', backupPath: backup };
  }
}

function bundleMetadataPath(bundlePath) {
  return path.join(bundlePath, bundleMetadataName);
}

async function assertBundlePath(bundlePath) {
  const temporaryRoot = path.resolve(os.tmpdir());
  const resolved = path.resolve(bundlePath || '');
  if (!path.isAbsolute(bundlePath || '') || !resolved.startsWith(`${temporaryRoot}${path.sep}`)) {
    fail('bundle path is outside the restricted temporary directory');
  }
  const relative = path.relative(temporaryRoot, resolved);
  if (!relative || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    fail('bundle path is outside the restricted temporary directory');
  }
  let segment = temporaryRoot;
  for (const part of relative.split(path.sep)) {
    segment = path.join(segment, part);
    const segmentMetadata = await lstat(segment);
    if (segmentMetadata.isSymbolicLink() || !segmentMetadata.isDirectory()) fail('bundle path is unsafe');
  }
  let canonicalTemporaryRoot;
  let canonicalBundle;
  try {
    [canonicalTemporaryRoot, canonicalBundle] = await Promise.all([realpath(temporaryRoot), realpath(resolved)]);
  } catch {
    fail('bundle path is unavailable');
  }
  if (!canonicalBundle.startsWith(`${canonicalTemporaryRoot}${path.sep}`)) {
    fail('bundle path escapes the restricted temporary directory');
  }
  if (!path.basename(canonicalBundle).startsWith(bundlePrefix)) fail('bundle path has an unexpected name');
  let metadata;
  try {
    metadata = await lstat(canonicalBundle);
  } catch {
    fail('bundle path is unavailable');
  }
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) fail('bundle path is unsafe');
  if (typeof process.getuid === 'function') {
    if (metadata.uid !== process.getuid() || (metadata.mode & 0o777) !== 0o700) {
      fail('bundle path must be owned by the current user with mode 0700');
    }
  }
  return canonicalBundle;
}

async function writeBundleMetadata({ bundlePath, sourceCommit, siteHash }) {
  const metadata = {
    assetHashes: await assetHashes(path.join(bundlePath, 'candidate')),
    schemaVersion: 2,
    siteHash,
    sourceCommit,
    sourceTreeSha256: await computeReleaseSourceTreeDigest(path.join(bundlePath, 'source')),
    targets
  };
  await writeFile(bundleMetadataPath(bundlePath), `${JSON.stringify(metadata, null, 2)}\n`, { mode: 0o600 });
  return metadata;
}

function validateBundleMetadata(metadata) {
  if (metadata?.schemaVersion !== 2 || !fullCommitPattern.test(metadata.sourceCommit || '')) {
    fail('bundle metadata is invalid');
  }
  if (!/^[0-9a-f]{64}$/.test(metadata.siteHash || '')) fail('bundle metadata site hash is invalid');
  if (!/^[0-9a-f]{64}$/.test(metadata.sourceTreeSha256 || '')) fail('bundle metadata source tree hash is invalid');
  if (!Array.isArray(metadata.targets) || metadata.targets.length !== targets.length) fail('bundle metadata target set is invalid');
  if (metadata.targets.some((target, index) => target !== targets[index])) fail('bundle metadata target order is invalid');
  if (!metadata.assetHashes || typeof metadata.assetHashes !== 'object') fail('bundle metadata hashes are invalid');
  for (const target of targets) {
    if (!/^[0-9a-f]{64}$/.test(metadata.assetHashes[target] || '')) fail('bundle metadata hashes are invalid');
  }
  if (Object.keys(metadata.assetHashes).length !== targets.length) fail('bundle metadata hashes are invalid');
}

async function verifyBundleSourceAgainstArchive({ bundleSourceRoot, cwd, sourceCommit, sourceTreeSha256, operations }) {
  const runCommand = operations.command || command;
  const exactCommit = resolveCommit(cwd, sourceCommit, runCommand);
  if (exactCommit !== sourceCommit) fail('bundle source commit does not resolve exactly in the current repository');
  if (await computeReleaseSourceTreeDigest(bundleSourceRoot) !== sourceTreeSha256) {
    fail('bundle source tree no longer matches its metadata');
  }
  const temporary = await (operations.mkdtemp || mkdtemp)(path.join(os.tmpdir(), 'resume-release-assets-verify-'));
  try {
    await (operations.chmod || chmod)(temporary, 0o700);
    archiveCommit(cwd, exactCommit, temporary, runCommand);
    await assertNoSymlinks(temporary);
    if (await computeReleaseSourceTreeDigest(temporary) !== sourceTreeSha256) {
      fail('bundle source tree does not match a fresh archive of the source commit');
    }
  } finally {
    await (operations.rm || rm)(temporary, { force: true, recursive: true });
  }
}

export async function verifyReleaseAssetBundle({ bundlePath, cwd = root, operations = {} }) {
  const resolvedBundle = await assertBundlePath(bundlePath);
  await assertNoSymlinks(resolvedBundle);
  const metadataFile = bundleMetadataPath(resolvedBundle);
  await assertRegularFile(metadataFile);
  let metadata;
  try {
    metadata = JSON.parse(await readFile(metadataFile, 'utf8'));
  } catch {
    fail('bundle metadata is unreadable');
  }
  validateBundleMetadata(metadata);
  const sourceRoot = path.join(resolvedBundle, 'source');
  const candidateRoot = path.join(resolvedBundle, 'candidate');
  await verifyBundleSourceAgainstArchive({
    bundleSourceRoot: sourceRoot,
    cwd,
    operations,
    sourceCommit: metadata.sourceCommit,
    sourceTreeSha256: metadata.sourceTreeSha256
  });
  const checked = await (operations.verifyReleaseAssets || verifyReleaseAssets)({
    assetRoot: candidateRoot,
    sourceCommit: metadata.sourceCommit,
    sourceRoot
  });
  if (checked.siteHash !== metadata.siteHash) fail('bundle site hash no longer matches its metadata');
  const currentHashes = await assetHashes(candidateRoot);
  for (const target of targets) {
    if (currentHashes[target] !== metadata.assetHashes[target]) fail('bundle asset hash no longer matches its metadata');
  }
  return {
    ...checked,
    assetHashes: metadata.assetHashes,
    bundlePath: resolvedBundle,
    sourceCommit: metadata.sourceCommit
  };
}

export async function stageReleaseAssets({
  cwd = root,
  onCandidateReady,
  sourceSha,
  operations = {}
}) {
  const runCommand = operations.command || command;
  const sourceCommit = resolveCommit(cwd, sourceSha, runCommand);
  const bundlePath = await (operations.mkdtemp || mkdtemp)(path.join(os.tmpdir(), bundlePrefix));
  let keepBundle = false;
  try {
    await (operations.chmod || chmod)(bundlePath, 0o700);
    const sourceRoot = path.join(bundlePath, 'source');
    await mkdir(sourceRoot);
    archiveCommit(cwd, sourceCommit, sourceRoot, runCommand);
    await assertNoSymlinks(sourceRoot);
    const candidateRoot = path.join(bundlePath, 'candidate');
    await mkdir(candidateRoot);
    await (operations.generateReleaseAssets || generateReleaseAssets)({ outputRoot: candidateRoot, sourceCommit, sourceRoot });
    const checked = await (operations.verifyReleaseAssets || verifyReleaseAssets)({ assetRoot: candidateRoot, sourceCommit, sourceRoot });
    const metadata = await writeBundleMetadata({ bundlePath, sourceCommit, siteHash: checked.siteHash });
    const result = { ...checked, assetHashes: metadata.assetHashes, bundlePath, sourceCommit };
    keepBundle = true;
    if (onCandidateReady) await onCandidateReady(result);
    return result;
  } finally {
    if (!keepBundle) await (operations.rm || rm)(bundlePath, { force: true, recursive: true });
  }
}

export async function promoteReleaseAssetBundle({
  bundlePath,
  cwd = root,
  onCandidateReady,
  operations = {}
}) {
  const result = await verifyReleaseAssetBundle({ bundlePath, cwd, operations });
  if (onCandidateReady) await onCandidateReady(result);
  await assertPromotionPaths(cwd, operations.command || command);
  const promotion = await promoteReleaseAssets({
    candidateRoot: path.join(result.bundlePath, 'candidate'),
    cwd,
    operations: { ...operations, approvedAssetHashes: result.assetHashes }
  });
  try {
    await (operations.rm || rm)(result.bundlePath, { force: true, recursive: true });
    return { ...result, ...promotion, bundleCleanup: 'removed', promoted: true };
  } catch {
    return { ...result, ...promotion, bundleCleanup: 'retained', promoted: true };
  }
}

export function parseArguments(args) {
  const values = {};
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
    if (argument === '--bundle' && !values.bundlePath && args[index + 1] && !args[index + 1].startsWith('--')) {
      values.bundlePath = args[index + 1];
      index += 1;
      continue;
    }
    fail('invalid command arguments');
  }
  if (values.sourceSha && !values.bundlePath && !values.ownerApproval) return values;
  if (values.bundlePath && !values.sourceSha && values.ownerApproval) return values;
  fail('provide --source-sha to stage, or --bundle with --owner-approval to promote');
}

async function main() {
  const values = parseArguments(process.argv.slice(2));
  const printCandidate = (result) => {
    console.log(`Release assets staged from ${result.sourceCommit}.`);
    console.log(`Site hash: ${result.siteHash}`);
    console.log('Promotion targets and SHA-256:');
    for (const target of result.targets) console.log(`- ${target}: ${result.assetHashes[target]}`);
  };
  if (values.sourceSha) {
    const result = await stageReleaseAssets({ ...values, onCandidateReady: printCandidate });
    console.log(`Bundle retained for owner inspection: ${result.bundlePath}`);
    console.log('No tracked output was changed. Re-run with --bundle and --owner-approval only after owner review.');
    return;
  }
  const result = await promoteReleaseAssetBundle({ bundlePath: values.bundlePath, onCandidateReady: printCandidate });
  console.log('Owner-approved promotion completed.');
  if (result.backupCleanup === 'retained') {
    console.log(`Backup cleanup failed; backup retained at ${result.backupPath}.`);
  }
  if (result.bundleCleanup === 'retained') {
    console.log(`Bundle cleanup failed; bundle retained at ${result.bundlePath}.`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
