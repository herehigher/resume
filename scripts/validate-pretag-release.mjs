import { appendFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { OFFICIAL_REPOSITORY } from './prepare-pages-artifact.mjs';
import { isStableReleaseTag } from './validate-release-ref.mjs';

const fullCommitPattern = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/;

function isSafeDefaultBranch(value) {
  return typeof value === 'string'
    && /^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(value)
    && !value.includes('..')
    && !value.includes('//')
    && !value.includes('@{')
    && !value.endsWith('/')
    && !value.endsWith('.')
    && !value.endsWith('.lock');
}

function gitOutput(cwd, args) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  }).trim();
}

function peelCommit(cwd, revision) {
  const commit = gitOutput(cwd, ['rev-parse', '--verify', '--end-of-options', `${revision}^{commit}`]);
  if (!fullCommitPattern.test(commit)) throw new Error(`Git returned an invalid commit id for ${revision}`);
  return commit;
}

function readPackageVersion(cwd, releaseSha) {
  const source = gitOutput(cwd, [
    'show',
    '--no-ext-diff',
    '--format=',
    '--no-textconv',
    '--end-of-options',
    `${releaseSha}:package.json`
  ]);
  const packageJson = JSON.parse(source);
  if (typeof packageJson.version !== 'string') throw new Error('package.json version must be a string');
  return packageJson.version;
}

export function validatePreTagRelease({
  cwd = process.cwd(),
  defaultBranch,
  eventName,
  eventRef,
  eventSha,
  releaseSha,
  releaseTag,
  repository
}) {
  if (repository !== OFFICIAL_REPOSITORY) throw new Error('Pre-tag artifact gate is restricted to the official repository');
  if (eventName !== 'workflow_dispatch') throw new Error('Pre-tag artifact gate requires a manual workflow dispatch');
  if (!isSafeDefaultBranch(defaultBranch)) throw new Error('A safe repository default branch is required');
  if (eventRef !== `refs/heads/${defaultBranch}`) {
    throw new Error('Pre-tag artifact gate must be dispatched from the default branch');
  }
  if (!isStableReleaseTag(releaseTag)) {
    throw new Error('Release tag must be stable SemVer in the form vMAJOR.MINOR.PATCH');
  }
  if (!fullCommitPattern.test(releaseSha || '')) throw new Error('Release SHA must be a full lowercase commit id');
  if (!fullCommitPattern.test(eventSha || '')) throw new Error('Dispatch SHA must be a full lowercase commit id');

  const defaultBranchSha = peelCommit(cwd, `refs/remotes/origin/${defaultBranch}`);
  const dispatchedSha = peelCommit(cwd, eventSha);
  if (dispatchedSha !== defaultBranchSha) {
    throw new Error('Manual dispatch commit does not match the default branch');
  }
  const exactReleaseSha = peelCommit(cwd, releaseSha);
  if (exactReleaseSha !== releaseSha) throw new Error('Release SHA must name the exact merged commit');
  execFileSync('git', [
    'merge-base',
    '--is-ancestor',
    '--end-of-options',
    releaseSha,
    defaultBranchSha
  ], {
    cwd,
    stdio: ['ignore', 'ignore', 'pipe']
  });

  const packageVersion = readPackageVersion(cwd, releaseSha);
  if (releaseTag !== `v${packageVersion}`) {
    throw new Error(`Release tag ${releaseTag} does not match package version ${packageVersion}`);
  }
  return Object.freeze({ packageVersion, releaseSha, releaseTag });
}

function writeActionsOutput(outputPath, release) {
  appendFileSync(
    outputPath,
    `release_sha=${release.releaseSha}\nrelease_tag=${release.releaseTag}\npackage_version=${release.packageVersion}\n`
  );
}

function main() {
  const release = validatePreTagRelease({
    defaultBranch: process.env.RELEASE_DEFAULT_BRANCH,
    eventName: process.env.GITHUB_EVENT_NAME,
    eventRef: process.env.GITHUB_REF || '',
    eventSha: process.env.GITHUB_SHA || '',
    releaseSha: process.env.RELEASE_SHA_INPUT || '',
    releaseTag: process.env.RELEASE_TAG_INPUT || '',
    repository: process.env.GITHUB_REPOSITORY
  });
  if (!process.env.GITHUB_OUTPUT) throw new Error('GITHUB_OUTPUT is required');
  writeActionsOutput(process.env.GITHUB_OUTPUT, release);
  console.log(`Validated pre-tag artifact gate input: ${release.releaseTag} -> ${release.releaseSha}.`);
}

const isDirectRun = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) main();
