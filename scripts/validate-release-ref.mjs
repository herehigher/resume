import { appendFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const stableReleaseTagPattern = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const fullCommitPattern = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/;

export function isStableReleaseTag(value) {
  return typeof value === 'string' && stableReleaseTagPattern.test(value);
}

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

export function validateReleaseRef({
  cwd = process.cwd(),
  defaultBranch,
  eventName,
  eventRef,
  eventSha,
  manualTag = ''
}) {
  if (!isSafeDefaultBranch(defaultBranch)) throw new Error('A safe repository default branch is required');

  let releaseTag;
  if (eventName === 'push') {
    if (!eventRef.startsWith('refs/tags/')) throw new Error('Push releases require an exact tag ref');
    releaseTag = eventRef.slice('refs/tags/'.length);
  } else if (eventName === 'workflow_dispatch') {
    if (eventRef !== `refs/heads/${defaultBranch}`) {
      throw new Error('Manual releases must be dispatched from the default branch');
    }
    releaseTag = manualTag;
  } else {
    throw new Error(`Unsupported release event: ${eventName}`);
  }

  if (!isStableReleaseTag(releaseTag)) {
    throw new Error('Release tag must be stable SemVer in the form vMAJOR.MINOR.PATCH');
  }

  const tagRef = `refs/tags/${releaseTag}`;
  const releaseSha = peelCommit(cwd, tagRef);
  if (eventName === 'push') {
    const eventCommit = peelCommit(cwd, eventSha);
    if (eventCommit !== releaseSha) throw new Error('The pushed object and exact tag ref resolve to different commits');
  }

  const packageVersion = readPackageVersion(cwd, releaseSha);
  if (releaseTag !== `v${packageVersion}`) {
    throw new Error(`Release tag ${releaseTag} does not match package version ${packageVersion}`);
  }

  const defaultBranchSha = peelCommit(cwd, `refs/remotes/origin/${defaultBranch}`);
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

  return { packageVersion, releaseSha, releaseTag };
}

function writeActionsOutput(outputPath, release) {
  appendFileSync(
    outputPath,
    `release_sha=${release.releaseSha}\nrelease_tag=${release.releaseTag}\npackage_version=${release.packageVersion}\n`
  );
}

function main() {
  const release = validateReleaseRef({
    defaultBranch: process.env.RELEASE_DEFAULT_BRANCH,
    eventName: process.env.RELEASE_EVENT_NAME,
    eventRef: process.env.RELEASE_EVENT_REF || '',
    eventSha: process.env.RELEASE_EVENT_SHA || '',
    manualTag: process.env.RELEASE_TAG_INPUT || ''
  });
  if (!process.env.GITHUB_OUTPUT) throw new Error('GITHUB_OUTPUT is required');
  writeActionsOutput(process.env.GITHUB_OUTPUT, release);
  console.log(`Validated ${release.releaseTag} at ${release.releaseSha}.`);
}

const isDirectRun = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) main();
