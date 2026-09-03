import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  OFFICIAL_REPOSITORY,
  prepareArtifact,
  validateReleaseSource,
  verifyArtifact
} from './prepare-pages-artifact.mjs';
import { isStableReleaseTag } from './validate-release-ref.mjs';
import { validateDeploymentArtifact } from './validate-pages-smoke.mjs';

const fullCommitPattern = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/;

function fail(message) {
  throw new Error(`Release preflight failed: ${message}`);
}

function command(commandName, args, { cwd, input } = {}) {
  try {
    return execFileSync(commandName, args, {
      cwd,
      encoding: 'utf8',
      input,
      stdio: ['pipe', 'pipe', 'pipe']
    }).trim();
  } catch {
    fail(`unable to complete required ${commandName} query`);
  }
}

function commandStatus(commandName, args, cwd) {
  try {
    execFileSync(commandName, args, { cwd, stdio: ['ignore', 'ignore', 'ignore'] });
    return 0;
  } catch (error) {
    return typeof error.status === 'number' ? error.status : -1;
  }
}

function sourceAt(runCommand, cwd, releaseSha, file) {
  return runCommand('git', [
    'show', '--no-ext-diff', '--format=', '--no-textconv', '--end-of-options', `${releaseSha}:${file}`
  ], { cwd });
}

function assertVersionContract({ changelog, config, packageVersion }) {
  const configVersion = new RegExp(`^export const APP_VERSION = '${packageVersion.replaceAll('.', '\\.')}';$`, 'm');
  if (!configVersion.test(config)) fail('APP_VERSION does not match package version');
  const heading = new RegExp(`^## \\[${packageVersion.replaceAll('.', '\\.')}\\] - \\d{4}-\\d{2}-\\d{2}$`, 'm');
  if (!heading.test(changelog)) fail('CHANGELOG release heading is missing or invalid');
}

export async function archiveRelease(cwd, releaseSha, target) {
  let archive;
  try {
    archive = execFileSync('git', ['archive', '--format=tar', '--end-of-options', releaseSha], {
      cwd,
      maxBuffer: 16 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe']
    });
  } catch {
    fail('unable to read the immutable release archive');
  }
  try {
    execFileSync('tar', ['-xf', '-', '-C', target], {
      input: archive,
      stdio: ['pipe', 'ignore', 'pipe']
    });
  } catch {
    fail('unable to extract the immutable release archive');
  }
}

export async function runReleasePreflight({
  cwd = process.cwd(),
  releaseSha,
  releaseTag,
  repository = OFFICIAL_REPOSITORY,
  readProviderToken,
  operations = {}
}) {
  const runCommand = operations.command || command;
  const runCommandStatus = operations.commandStatus || commandStatus;
  const createTemporaryDirectory = operations.mkdtemp || mkdtemp;
  const removeTemporaryDirectory = operations.rm || rm;
  const archive = operations.archiveRelease || archiveRelease;
  const validateSource = operations.validateReleaseSource || validateReleaseSource;
  const prepare = operations.prepareArtifact || prepareArtifact;
  const verify = operations.verifyArtifact || verifyArtifact;
  const validateSmoke = operations.validateDeploymentArtifact || validateDeploymentArtifact;
  if (repository !== OFFICIAL_REPOSITORY) fail('preflight is restricted to the official repository');
  if (!isStableReleaseTag(releaseTag)) fail('release tag must be stable SemVer');
  if (!fullCommitPattern.test(releaseSha || '')) fail('release SHA must be a full lowercase commit id');
  const origin = runCommand('git', ['remote', 'get-url', 'origin'], { cwd });
  if (origin !== `https://github.com/${repository}.git`) fail('origin does not match the official repository');
  if (runCommandStatus('git', ['show-ref', '--verify', '--quiet', `refs/tags/${releaseTag}`], cwd) !== 1) {
    fail('release tag already exists locally or local tag state is unreadable');
  }
  if (runCommandStatus('git', [
    'fetch', '--no-tags', 'origin', 'refs/heads/main:refs/remotes/origin/main'
  ], cwd) !== 0) {
    fail('unable to refresh remote main');
  }
  const remoteMainSha = runCommand('git', [
    'rev-parse', '--verify', '--end-of-options', 'refs/remotes/origin/main^{commit}'
  ], { cwd });
  if (!fullCommitPattern.test(remoteMainSha)) fail('remote main did not resolve to a full commit id');
  if (runCommandStatus('git', ['merge-base', '--is-ancestor', '--end-of-options', releaseSha, remoteMainSha], cwd) !== 0) {
    fail('release SHA is not on origin/main');
  }
  const remoteTag = runCommand('git', ['ls-remote', '--tags', 'origin', `refs/tags/${releaseTag}`], { cwd });
  if (remoteTag) fail('release tag already exists remotely');

  let packageJson;
  try {
    packageJson = JSON.parse(sourceAt(runCommand, cwd, releaseSha, 'package.json'));
  } catch {
    fail('package.json is unreadable at the release SHA');
  }
  const packageVersion = packageJson.version;
  if (typeof packageVersion !== 'string' || releaseTag !== `v${packageVersion}`) {
    fail('release tag does not match package version');
  }
  assertVersionContract({
    changelog: sourceAt(runCommand, cwd, releaseSha, 'CHANGELOG.md'),
    config: sourceAt(runCommand, cwd, releaseSha, 'site/assets/js/config.js'),
    packageVersion
  });

  const temporary = await createTemporaryDirectory(path.join(os.tmpdir(), 'resume-release-preflight-'));
  try {
    await archive(cwd, releaseSha, temporary);
    const sourceDirectory = path.join(temporary, 'site');
    const manifestPath = path.join(temporary, '.github/pages-release-manifest.json');
    const release = await validateSource({ manifestPath, sourceDirectory });
    let token = '';
    if (release.manifest.analyticsMode === 'enabled') {
      if (typeof readProviderToken !== 'function') fail('provider variable query is unavailable');
      try {
        token = await readProviderToken();
      } catch {
        fail('provider variable query failed');
      }
      if (!token) fail('provider variable is empty');
    }
    const artifactDirectory = path.join(temporary, 'artifact');
    const prepared = await prepare({
      manifestPath,
      outputDirectory: artifactDirectory,
      repository,
      sourceDirectory,
      token
    });
    token = '';
    const finalDigest = await verify({ directory: artifactDirectory, manifestPath });
    await validateSmoke({
      directory: artifactDirectory,
      analyticsMode: release.analytics_mode,
      analyticsProvider: release.analytics_provider,
      packageVersion,
      providerFingerprint: release.provider_fingerprint
    });
    return Object.freeze({
      adapterDigest: release.adapter_digest,
      finalDigest,
      providerFingerprint: release.provider_fingerprint,
      sourceDigest: prepared.sourceDigest,
      packageVersion,
      releaseSha,
      releaseTag
    });
  } finally {
    await removeTemporaryDirectory(temporary, { force: true, recursive: true });
  }
}

function parseArguments(args) {
  const values = {};
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index];
    const value = args[index + 1];
    if (!name?.startsWith('--') || value === undefined || value.startsWith('--')) fail('invalid command arguments');
    const key = name.slice(2);
    if (!['release-sha', 'release-tag'].includes(key) || key in values) fail('unknown or duplicate command argument');
    values[key] = value;
  }
  if (!values['release-sha'] || !values['release-tag'] || Object.keys(values).length !== 2) fail('release SHA and tag are required');
  return values;
}

async function main() {
  const values = parseArguments(process.argv.slice(2));
  const result = await runReleasePreflight({
    releaseSha: values['release-sha'],
    releaseTag: values['release-tag'],
    readProviderToken: () => command('gh', ['variable', 'get', 'CLOUDFLARE_WEB_ANALYTICS_TOKEN', '--repo', OFFICIAL_REPOSITORY])
  });
  console.log(`Release preflight passed: ${result.releaseTag} -> ${result.releaseSha}`);
  console.log(`Verified digests: source=${result.sourceDigest}, adapter=${result.adapterDigest}, artifact=${result.finalDigest}`);
  console.log(`Provider fingerprint: ${result.providerFingerprint}`);
}

const scriptPath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
