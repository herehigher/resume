import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repository = 'herehigher/resume';
const stableSemVerPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const fullCommitPattern = /^[0-9a-f]{40}$/;

class PreflightFailure extends Error {
  constructor({ baseSha, check, currentVersion, reason, status, targetVersion, untrackedCount }) {
    super(`Release preflight ${status}: ${check} (${reason})`);
    this.baseSha = baseSha;
    this.check = check;
    this.currentVersion = currentVersion;
    this.reason = reason;
    this.status = status;
    this.targetVersion = targetVersion;
    this.untrackedCount = untrackedCount;
  }
}

function fail(details) {
  throw new PreflightFailure(details);
}

function git(rootDirectory, args) {
  try {
    return execFileSync('git', ['-C', rootDirectory, ...args], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']
    }).trim();
  } catch {
    fail({ check: 'git', reason: 'unavailable', status: 'blocked' });
  }
}

function gitBuffer(rootDirectory, args) {
  try {
    return execFileSync('git', ['-C', rootDirectory, ...args], {
      encoding: 'buffer', stdio: ['ignore', 'pipe', 'pipe']
    });
  } catch {
    fail({ check: 'git', reason: 'unavailable', status: 'blocked' });
  }
}

function githubApi(endpoint, paginate = false) {
  try {
    const args = ['api'];
    if (paginate) args.push('--paginate', '--slurp');
    args.push(`repos/${repository}/${endpoint}`);
    return JSON.parse(execFileSync('gh', args, {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 8 * 1024 * 1024
    }));
  } catch {
    fail({ check: 'github-session', reason: 'unavailable', status: 'blocked' });
  }
}

function remoteTagExists(rootDirectory, tagName) {
  const result = spawnSync('git', ['-C', rootDirectory, 'ls-remote', '--exit-code', '--refs', 'origin', `refs/tags/${tagName}`], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']
  });
  if (result.status === 0) return true;
  if (result.status === 2) return false;
  fail({ check: 'tag', reason: 'remote-unavailable', status: 'blocked' });
}

function compareNumericComponents(left, right) {
  if (left.length !== right.length) return left.length - right.length;
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

export function compareStableSemVer(left, right) {
  if (!stableSemVerPattern.test(left || '') || !stableSemVerPattern.test(right || '')) {
    throw new Error('stable SemVer is required');
  }
  const leftParts = left.split('.');
  const rightParts = right.split('.');
  for (let index = 0; index < leftParts.length; index += 1) {
    const comparison = compareNumericComponents(leftParts[index], rightParts[index]);
    if (comparison) return comparison;
  }
  return 0;
}

function normalizeAllowlistedPath(value) {
  if (!value || path.isAbsolute(value)) {
    throw new Error('allowlisted untracked paths must be exact relative paths');
  }
  const normalized = value.replaceAll('\\', '/');
  if (normalized.startsWith('/') || normalized.split('/').some((segment) => !segment || segment === '.' || segment === '..')) {
    throw new Error('allowlisted untracked paths must be exact relative paths');
  }
  return normalized;
}

export function parseArguments(argumentsList) {
  const values = { allowUntracked: [] };
  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (argument === '--target' || argument === '--allow-untracked') {
      const value = argumentsList[index + 1];
      if (!value || value.startsWith('--')) throw new Error('arguments are invalid');
      index += 1;
      if (argument === '--target') {
        if (values.targetVersion) throw new Error('arguments are invalid');
        values.targetVersion = value;
      } else {
        values.allowUntracked.push(normalizeAllowlistedPath(value));
      }
    } else {
      throw new Error('arguments are invalid');
    }
  }
  if (!stableSemVerPattern.test(values.targetVersion || '')) {
    throw new Error('target must be a stable SemVer value');
  }
  values.allowUntracked = [...new Set(values.allowUntracked)];
  return values;
}

function readCurrentVersion(rootDirectory) {
  try {
    const value = JSON.parse(readFileSync(path.join(rootDirectory, 'package.json'), 'utf8')).version;
    if (!stableSemVerPattern.test(value || '')) throw new Error('invalid');
    return value;
  } catch {
    fail({ check: 'current-version', reason: 'invalid', status: 'deferred' });
  }
}

function assertOfficialOrigin(rootDirectory, gitCommand) {
  const origin = gitCommand(rootDirectory, ['remote', 'get-url', 'origin']);
  const official = /^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)(herehigher\/resume)(?:\.git)?\/?$/;
  if (!official.test(origin)) fail({ check: 'origin', reason: 'not-official', status: 'deferred' });
}

function fetchLatestMain(rootDirectory, gitCommand) {
  try {
    gitCommand(rootDirectory, ['fetch', '--no-tags', 'origin', 'main:refs/remotes/origin/main']);
    const baseSha = gitCommand(rootDirectory, ['rev-parse', 'refs/remotes/origin/main']);
    if (!fullCommitPattern.test(baseSha)) throw new Error('invalid SHA');
    return baseSha;
  } catch (error) {
    if (error instanceof PreflightFailure) throw error;
    fail({ check: 'origin-main', reason: 'unavailable', status: 'blocked' });
  }
}

function assertCurrentMain(rootDirectory, baseSha, gitCommand) {
  const checkoutSha = gitCommand(rootDirectory, ['rev-parse', 'HEAD']);
  const branch = gitCommand(rootDirectory, ['branch', '--show-current']);
  if (branch !== 'main' || checkoutSha !== baseSha) {
    fail({ baseSha, check: 'origin-main', reason: 'checkout-not-current', status: 'deferred' });
  }
}

function assertGithubSession(api) {
  let response;
  try {
    response = api('');
  } catch {
    fail({ check: 'github-session', reason: 'unavailable', status: 'blocked' });
  }
  if (!response?.id || response.full_name !== repository) {
    fail({ check: 'github-session', reason: 'repository-inaccessible', status: 'blocked' });
  }
}

function openPullRequests(api) {
  let pages;
  try {
    pages = api('pulls?state=open&per_page=100', true);
  } catch {
    fail({ check: 'open-pull-request', reason: 'unavailable', status: 'blocked' });
  }
  if (!Array.isArray(pages)) fail({ check: 'open-pull-request', reason: 'unavailable', status: 'blocked' });
  const pullRequests = pages.flatMap((page) => (Array.isArray(page) ? page : []));
  if (!pullRequests.every((pullRequest) => Number.isInteger(pullRequest?.number))) {
    fail({ check: 'open-pull-request', reason: 'unavailable', status: 'blocked' });
  }
  return pullRequests;
}

function hasDuplicateReleasePullRequest(pullRequests, targetVersion) {
  const releaseBranch = `release-v${targetVersion}`;
  const escapedVersion = targetVersion.replaceAll('.', '\\.');
  const targetInTitle = new RegExp(`(?:^|[^0-9A-Za-z.-])v?${escapedVersion}(?:$|[^0-9A-Za-z.-])`);
  return pullRequests.some((pullRequest) => (
    pullRequest.head?.ref === releaseBranch
      || pullRequest.head?.ref?.endsWith(`/${releaseBranch}`)
      || targetInTitle.test(pullRequest.title || '')
  ));
}

function assertCleanWorktree(rootDirectory, allowUntracked, gitCommand, gitBufferCommand) {
  const trackedStatus = gitCommand(rootDirectory, ['status', '--porcelain=v1', '--untracked-files=no']);
  if (trackedStatus) fail({ check: 'tracked-worktree', reason: 'not-clean', status: 'deferred' });
  const untracked = gitBufferCommand(rootDirectory, ['ls-files', '--others', '--exclude-standard', '-z'])
    .toString('utf8').split('\0').filter(Boolean);
  const unexpected = untracked.filter((entry) => !allowUntracked.includes(entry));
  if (unexpected.length) {
    fail({ check: 'untracked-worktree', reason: 'not-allowlisted', status: 'deferred', untrackedCount: unexpected.length });
  }
}

export function formatPreflightSummary({ baseSha, check, currentVersion, reason, status, targetVersion, untrackedCount }) {
  const summary = { command: 'release-preflight', status };
  if (targetVersion) summary.target = targetVersion;
  if (currentVersion) summary.current = currentVersion;
  if (baseSha) summary.originMain = baseSha;
  if (check) summary.check = check;
  if (reason) summary.reason = reason;
  if (untrackedCount) summary.untrackedCount = untrackedCount;
  return JSON.stringify(summary);
}

export function runReleasePreflight({
  allowUntracked = [], dependencies = {}, rootDirectory = process.cwd(), targetVersion
} = {}) {
  const candidate = path.resolve(rootDirectory);
  const gitCommand = dependencies.git || git;
  const gitBufferCommand = dependencies.gitBuffer || gitBuffer;
  const api = dependencies.api || githubApi;
  const tagExists = dependencies.remoteTagExists || remoteTagExists;
  let currentVersion;
  let baseSha;
  try {
    if (!stableSemVerPattern.test(targetVersion || '')) {
      fail({ check: 'target-version', reason: 'invalid', status: 'deferred', targetVersion });
    }
    let normalizedAllowlist;
    try {
      normalizedAllowlist = [...new Set(allowUntracked.map(normalizeAllowlistedPath))];
    } catch {
      fail({ check: 'untracked-worktree', reason: 'invalid-allowlist', status: 'deferred', targetVersion });
    }
    currentVersion = readCurrentVersion(candidate);
    if (compareStableSemVer(targetVersion, currentVersion) <= 0) {
      fail({ check: 'target-version', currentVersion, reason: 'not-greater', status: 'deferred', targetVersion });
    }
    assertOfficialOrigin(candidate, gitCommand);
    baseSha = fetchLatestMain(candidate, gitCommand);
    assertCurrentMain(candidate, baseSha, gitCommand);
    assertGithubSession(api);
    if (tagExists(candidate, `v${targetVersion}`)) {
      fail({ baseSha, check: 'tag', currentVersion, reason: 'already-exists', status: 'deferred', targetVersion });
    }
    if (hasDuplicateReleasePullRequest(openPullRequests(api), targetVersion)) {
      fail({ baseSha, check: 'open-pull-request', currentVersion, reason: 'already-exists', status: 'deferred', targetVersion });
    }
    assertCleanWorktree(candidate, normalizedAllowlist, gitCommand, gitBufferCommand);
    return {
      baseSha, currentVersion, status: 'pass', targetVersion
    };
  } catch (error) {
    if (error instanceof PreflightFailure) {
      throw new PreflightFailure({
        ...error,
        baseSha: error.baseSha || baseSha,
        currentVersion: error.currentVersion || currentVersion,
        targetVersion: error.targetVersion || targetVersion
      });
    }
    fail({ baseSha, check: 'preflight', currentVersion, reason: 'unavailable', status: 'blocked', targetVersion });
  }
}

function main() {
  let values;
  try {
    values = parseArguments(process.argv.slice(2));
    const result = runReleasePreflight({
      allowUntracked: values.allowUntracked, rootDirectory: process.cwd(), targetVersion: values.targetVersion
    });
    console.log(formatPreflightSummary(result));
  } catch (error) {
    const details = error instanceof PreflightFailure
      ? error
      : { check: 'arguments', reason: 'invalid', status: 'deferred' };
    console.log(formatPreflightSummary(details));
    process.exitCode = 1;
  }
}

const scriptPath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) main();
