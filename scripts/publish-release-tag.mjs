import { execFileSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { OFFICIAL_REPOSITORY } from './prepare-pages-artifact.mjs';
import { isStableReleaseTag } from './validate-release-ref.mjs';

const DEFAULT_BRANCH = 'main';
const directGitHubTokenVariables = Object.freeze(['GH_TOKEN', 'GITHUB_TOKEN']);
const fullCommitPattern = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/;
const runIdPattern = /^[1-9]\d*$/;

function fail(message) {
  throw new Error(`Release tag publication failed: ${message}`);
}

function command(commandName, args, { cwd } = {}) {
  try {
    return execFileSync(commandName, args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
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

function peelCommit(runCommand, cwd, revision) {
  const commit = runCommand('git', ['rev-parse', '--verify', '--end-of-options', `${revision}^{commit}`], { cwd });
  if (!fullCommitPattern.test(commit)) fail(`Git returned an invalid commit id for ${revision}`);
  return commit;
}

function sourceAt(runCommand, cwd, releaseSha, file) {
  return runCommand('git', [
    'show', '--no-ext-diff', '--format=', '--no-textconv', '--end-of-options', `${releaseSha}:${file}`
  ], { cwd });
}

function parseRemoteTag(value, tag) {
  if (!value) return null;
  const exactRef = `refs/tags/${tag}`;
  const peeledRef = `${exactRef}^{}`;
  const lines = value.split('\n').filter(Boolean).map((line) => line.split('\t'));
  if (lines.some(([object, ref]) => !fullCommitPattern.test(object) || ![exactRef, peeledRef].includes(ref))) {
    fail('remote tag query returned an invalid ref');
  }
  const exact = lines.filter(([, ref]) => ref === exactRef);
  const peeled = lines.filter(([, ref]) => ref === peeledRef);
  if (exact.length !== 1 || peeled.length > 1) fail('remote tag query returned ambiguous refs');
  return peeled[0]?.[0] || exact[0][0];
}

function tupleOf(value) {
  return Object.freeze({
    packageVersion: value.packageVersion,
    releaseSha: value.releaseSha,
    releaseTag: value.releaseTag,
    repository: value.repository
  });
}

function sameTuple(left, right) {
  return Object.keys(left).every((key) => left[key] === right[key]);
}

function approvalPhrase(tuple) {
  return `publish ${tuple.repository} ${tuple.releaseTag} ${tuple.releaseSha} ${tuple.packageVersion}`;
}

export function hasDirectGitHubTokenVariable(environment = process.env) {
  return directGitHubTokenVariables.some((name) => Object.hasOwn(environment, name));
}

function assertNoDirectGitHubTokenVariable(environment = process.env) {
  if (hasDirectGitHubTokenVariable(environment)) {
    fail('release tag helper is deferred to an owner-approved trusted release host because a direct GitHub token variable is present');
  }
}

function parseGateRun(value, releaseTag, releaseSha) {
  let run;
  try {
    run = JSON.parse(value);
  } catch {
    fail('pre-tag artifact gate run metadata is invalid');
  }
  if (run?.conclusion !== 'success'
    || run.event !== 'workflow_dispatch'
    || run.headBranch !== DEFAULT_BRANCH
    || !fullCommitPattern.test(run.headSha || '')
    || run.workflowName !== 'Pre-tag artifact gate'
    || run.displayTitle !== `Pre-tag artifact gate: ${releaseTag} -> ${releaseSha}`
    || typeof run.url !== 'string') {
    fail('pre-tag artifact gate run is not a successful default-branch gate');
  }
  return { url: run.url };
}

async function readAccount({ repository, runCommand }) {
  runCommand('gh', ['auth', 'status', '--hostname', 'github.com']);
  const login = runCommand('gh', ['api', 'user', '--jq', '.login']);
  const permission = runCommand('gh', [
    'repo', 'view', repository, '--json', 'viewerPermission', '--jq', '.viewerPermission'
  ]);
  if (!/^[A-Za-z0-9-]+$/.test(login) || permission !== 'ADMIN') {
    fail('authenticated account does not have owner-level access to the official repository');
  }
  return Object.freeze({ login, permission });
}

async function verifyPreTagGate({ releaseSha, releaseTag, repository, runCommand, runId }) {
  if (!runIdPattern.test(runId || '')) fail('pre-tag artifact gate run id must be a decimal identifier');
  const details = parseGateRun(runCommand('gh', [
    'run', 'view', runId, '--repo', repository,
    '--json', 'conclusion,event,headBranch,headSha,url,workflowName,displayTitle'
  ]), releaseTag, releaseSha);
  return Object.freeze({ runId, url: details.url });
}

export async function validateTagPublication({
  cwd = process.cwd(),
  preTagGateRunId,
  releaseSha,
  releaseTag,
  repository = OFFICIAL_REPOSITORY,
  environment = process.env,
  operations = {}
}) {
  assertNoDirectGitHubTokenVariable(environment);
  const runCommand = operations.command || command;
  const runCommandStatus = operations.commandStatus || commandStatus;
  const getAccount = operations.readAccount || readAccount;
  const getGate = operations.verifyPreTagGate || verifyPreTagGate;
  if (repository !== OFFICIAL_REPOSITORY) fail('publication is restricted to the official repository');
  if (!isStableReleaseTag(releaseTag)) fail('release tag must be stable SemVer');
  if (!fullCommitPattern.test(releaseSha || '')) fail('release SHA must be a full lowercase commit id');

  const origin = operations.originUrl || runCommand('git', ['remote', 'get-url', 'origin'], { cwd });
  if (origin !== `https://github.com/${repository}.git`) fail('origin does not match the official repository');
  const account = await getAccount({ repository, runCommand });
  if (!account || !/^[A-Za-z0-9-]+$/.test(account.login) || account.permission !== 'ADMIN') {
    fail('authenticated account does not have owner-level access to the official repository');
  }
  if (runCommandStatus('git', [
    'fetch', '--no-tags', 'origin', `refs/heads/${DEFAULT_BRANCH}:refs/remotes/origin/${DEFAULT_BRANCH}`
  ], cwd) !== 0) fail(`unable to refresh origin/${DEFAULT_BRANCH}`);
  const defaultBranchSha = peelCommit(runCommand, cwd, `refs/remotes/origin/${DEFAULT_BRANCH}`);
  const exactReleaseSha = peelCommit(runCommand, cwd, releaseSha);
  if (exactReleaseSha !== releaseSha) fail('release SHA must name the exact merged commit');
  if (runCommandStatus('git', [
    'merge-base', '--is-ancestor', '--end-of-options', releaseSha, defaultBranchSha
  ], cwd) !== 0) fail(`release SHA is not on origin/${DEFAULT_BRANCH}`);

  let packageVersion;
  try {
    packageVersion = JSON.parse(sourceAt(runCommand, cwd, releaseSha, 'package.json')).version;
  } catch {
    fail('package.json is unreadable at the release SHA');
  }
  if (typeof packageVersion !== 'string' || releaseTag !== `v${packageVersion}`) {
    fail('release tag does not match package version');
  }
  const gate = await getGate({ runId: preTagGateRunId, releaseSha, releaseTag, repository, runCommand });

  const localStatus = runCommandStatus('git', ['show-ref', '--verify', '--quiet', `refs/tags/${releaseTag}`], cwd);
  if (![0, 1].includes(localStatus)) fail('local tag state is unreadable');
  const localSha = localStatus === 0 ? peelCommit(runCommand, cwd, `refs/tags/${releaseTag}`) : null;
  if (localSha && localSha !== releaseSha) fail('local tag resolves to a different commit');
  const remoteSha = parseRemoteTag(runCommand('git', [
    'ls-remote', '--tags', 'origin', `refs/tags/${releaseTag}`, `refs/tags/${releaseTag}^{}`
  ], { cwd }), releaseTag);
  if (remoteSha && remoteSha !== releaseSha) fail('remote tag resolves to a different commit');

  return Object.freeze({
    account,
    gate,
    localTag: localSha ? 'same' : 'absent',
    packageVersion,
    remoteTag: remoteSha ? 'same' : 'absent',
    releaseSha,
    releaseTag,
    repository
  });
}

function assertApprovedTuple(initial, refreshed) {
  if (!sameTuple(tupleOf(initial), tupleOf(refreshed))) {
    fail('approved repository/tag/SHA/version tuple changed; obtain new owner approval');
  }
}

export async function publishReleaseTag({
  confirm,
  cwd = process.cwd(),
  preTagGateRunId,
  releaseSha,
  releaseTag,
  repository = OFFICIAL_REPOSITORY,
  environment = process.env,
  operations = {}
}) {
  if (typeof confirm !== 'function') fail('explicit owner approval is required');
  assertNoDirectGitHubTokenVariable(environment);
  const initial = await validateTagPublication({
    cwd, environment, operations, preTagGateRunId, releaseSha, releaseTag, repository
  });
  const tuple = tupleOf(initial);
  if (!await confirm(Object.freeze({ ...tuple, approvalPhrase: approvalPhrase(tuple) }))) {
    fail('owner did not explicitly approve the displayed tuple');
  }

  let refreshed = await validateTagPublication({
    cwd, environment, operations, preTagGateRunId, releaseSha, releaseTag, repository
  });
  assertApprovedTuple(initial, refreshed);
  let localAction = 'resumed';
  if (refreshed.localTag === 'absent') {
    assertNoDirectGitHubTokenVariable(environment);
    runCommand(operations, 'git', [
      'tag', '--annotate', '--no-sign', releaseTag, releaseSha, '--message', `Resume Studio ${releaseTag}`
    ], { cwd });
    localAction = 'created';
  }

  refreshed = await validateTagPublication({
    cwd, environment, operations, preTagGateRunId, releaseSha, releaseTag, repository
  });
  assertApprovedTuple(initial, refreshed);
  if (refreshed.remoteTag === 'same') {
    return Object.freeze({ ...tuple, gateRunUrl: refreshed.gate.url, localAction, remoteAction: 'already-published' });
  }
  if (refreshed.localTag !== 'same') fail('local exact tag is unavailable for publication');
  assertNoDirectGitHubTokenVariable(environment);
  runCommand(operations, 'git', [
    'push', 'origin', `refs/tags/${releaseTag}:refs/tags/${releaseTag}`
  ], { cwd });
  return Object.freeze({ ...tuple, gateRunUrl: refreshed.gate.url, localAction, remoteAction: 'published' });
}

function runCommand(operations, commandName, args, options) {
  return (operations.command || command)(commandName, args, options);
}

export function parseArguments(args) {
  const values = {};
  for (let index = 0; index < args.length;) {
    const name = args[index];
    const value = args[index + 1];
    if (!name?.startsWith('--') || value === undefined || value.startsWith('--')) fail('invalid command arguments');
    const key = name.slice(2);
    if (!['pre-tag-gate-run', 'release-sha', 'release-tag'].includes(key) || key in values) fail('unknown or duplicate command argument');
    values[key] = value;
    index += 2;
  }
  if (!values['pre-tag-gate-run'] || !values['release-sha'] || !values['release-tag']) fail('release tag, SHA, and pre-tag gate run are required');
  return values;
}

async function promptForApproval(tuple) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) fail('owner approval requires an interactive terminal');
  console.log(`Repository: ${tuple.repository}`);
  console.log(`対象 tag: ${tuple.releaseTag}`);
  console.log(`完全 SHA: ${tuple.releaseSha}`);
  console.log(`Version: ${tuple.packageVersion}`);
  const readline = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const response = await readline.question(`Owner approval is required. 次を完全一致で入力してください: "${tuple.approvalPhrase}": `);
    return response === tuple.approvalPhrase;
  } finally {
    readline.close();
  }
}

async function main() {
  const values = parseArguments(process.argv.slice(2));
  const result = await publishReleaseTag({
    confirm: promptForApproval,
    preTagGateRunId: values['pre-tag-gate-run'],
    releaseSha: values['release-sha'],
    releaseTag: values['release-tag']
  });
  console.log(`Release tag ${result.remoteAction}: ${result.releaseTag} -> ${result.releaseSha}`);
  console.log(`Pre-tag artifact gate: ${result.gateRunUrl}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
