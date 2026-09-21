import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { readReleaseAssetProvenance } from './release-doc-assets.mjs';

const repository = 'herehigher/resume';
const workflowPath = '.github/workflows/release-candidate-assets.yml';
const workflowFile = 'release-candidate-assets.yml';
const fullCommitPattern = /^[0-9a-f]{40}$/;
const positiveId = /^[1-9][0-9]*$/;
const branchPattern = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;
const artifactDigestPattern = /^sha256:[0-9a-f]{64}$/;
const correlationPattern = /^[0-9a-f]{32}$/;

export class CandidateAssetsFailure extends Error {
  constructor(message) {
    super(`Candidate asset generation stopped: ${message}`);
  }
}

function fail(message) {
  throw new CandidateAssetsFailure(message);
}

function requireValue(condition, message) {
  if (!condition) fail(message);
}

function git(rootDirectory, args) {
  try {
    return execFileSync('git', ['-C', rootDirectory, ...args], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']
    }).trim();
  } catch {
    fail('local Git verification is unavailable');
  }
}

export function repositoryEndpoint(endpoint) {
  return endpoint ? `repos/${repository}/${endpoint}` : `repos/${repository}`;
}

function githubApi(endpoint, paginate = false) {
  try {
    const args = ['api'];
    if (paginate) args.push('--paginate', '--slurp');
    args.push(repositoryEndpoint(endpoint));
    return JSON.parse(execFileSync('gh', args, {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 8 * 1024 * 1024
    }));
  } catch {
    fail('GitHub verification is unavailable');
  }
}

function githubBinary(endpoint) {
  try {
    return execFileSync('gh', ['api', repositoryEndpoint(endpoint)], {
      encoding: 'buffer', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024
    });
  } catch {
    fail('candidate artifact download is unavailable');
  }
}

function officialRepository(value) {
  return value?.id && value.full_name === repository;
}

function apiRequest(api, endpoint, paginate = false) {
  try {
    return api(endpoint, paginate);
  } catch (error) {
    if (error instanceof CandidateAssetsFailure) throw error;
    fail('GitHub verification is unavailable');
  }
}

function assertOfficialOrigin(rootDirectory, gitCommand) {
  const origin = gitCommand(rootDirectory, ['remote', 'get-url', 'origin']);
  requireValue(/^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)(herehigher\/resume)(?:\.git)?\/?$/.test(origin),
    'checkout origin is not the official repository');
}

function assertCleanCheckout(rootDirectory, gitCommand) {
  requireValue(!gitCommand(rootDirectory, ['status', '--porcelain=v1', '--untracked-files=all']),
    'checkout is not clean');
}

function remoteBranchSha(rootDirectory, branch, gitCommand) {
  const output = gitCommand(rootDirectory, ['ls-remote', '--exit-code', '--refs', 'origin', `refs/heads/${branch}`]);
  const match = /^([0-9a-f]{40})\s+refs\/heads\/.+$/m.exec(output);
  requireValue(match, 'candidate branch is not pushed to origin');
  return match[1];
}

export function parseArguments(argumentsList) {
  if (argumentsList.length === 0) return { mode: 'start' };
  if (argumentsList.length !== 4) fail('provide no arguments, or both --run-id and --source-sha');
  const values = {};
  for (let index = 0; index < argumentsList.length; index += 2) {
    const name = argumentsList[index];
    const value = argumentsList[index + 1];
    if (!['--run-id', '--source-sha'].includes(name) || !value || value.startsWith('--') || name in values) {
      fail('arguments are invalid');
    }
    values[name] = value;
  }
  requireValue(positiveId.test(values['--run-id']) && fullCommitPattern.test(values['--source-sha']),
    'run ID or source SHA is invalid');
  return { mode: 'resume', runId: values['--run-id'], sourceSha: values['--source-sha'] };
}

export function candidateCheckoutIdentity({ gitCommand = git, rootDirectory = process.cwd() } = {}) {
  const root = path.resolve(rootDirectory);
  assertOfficialOrigin(root, gitCommand);
  assertCleanCheckout(root, gitCommand);
  const branch = gitCommand(root, ['branch', '--show-current']);
  requireValue(branchPattern.test(branch) && branch !== 'main', 'candidate branch is invalid');
  const sourceSha = gitCommand(root, ['rev-parse', 'HEAD']);
  requireValue(fullCommitPattern.test(sourceSha), 'candidate checkout SHA is invalid');
  const remoteSha = remoteBranchSha(root, branch, gitCommand);
  requireValue(remoteSha === sourceSha, 'candidate checkout HEAD does not match its remote branch');
  return { branch, root, sourceSha };
}

function controlSha(rootDirectory, gitCommand) {
  return remoteBranchSha(rootDirectory, 'main', gitCommand);
}

function assertGithubRepository(api) {
  requireValue(officialRepository(apiRequest(api, '')), 'official repository is inaccessible');
}

function assertWorkflow(workflow) {
  requireValue(Number.isInteger(workflow?.id) && workflow.path === workflowPath,
    'release candidate workflow identity is invalid');
}

function assertRunIdentity({ controlSha: expectedControlSha, run, workflow }) {
  requireValue(positiveId.test(String(run?.id || '')) && positiveId.test(String(run.run_attempt || '')),
    'workflow run identity is invalid');
  requireValue(officialRepository(run.repository) && (!run.head_repository || officialRepository(run.head_repository)),
    'workflow run repository is invalid');
  requireValue(run.workflow_id === workflow.id && run.path === workflow.path && run.event === 'workflow_dispatch'
    && run.head_branch === 'main' && run.head_sha === expectedControlSha,
  'workflow run does not match the trusted main control ref');
}

function runUrl(runId) {
  return `https://github.com/${repository}/actions/runs/${runId}`;
}

function artifactName(sourceSha, runAttempt) {
  return `release-candidate-documentation-assets-${sourceSha}-attempt-${runAttempt}`;
}

export function candidateRunTitle(correlationId) {
  requireValue(correlationPattern.test(correlationId || ''), 'dispatch correlation ID is invalid');
  return `Candidate asset evidence ${correlationId}`;
}

export function selectCorrelatedRun({ controlSha: expectedControlSha, correlationId, runs, workflow }) {
  const matches = runs.filter((run) => run?.display_title === candidateRunTitle(correlationId));
  requireValue(matches.length <= 1, 'workflow dispatch correlation is ambiguous');
  if (matches.length === 0) return null;
  assertRunIdentity({ controlSha: expectedControlSha, run: matches[0], workflow });
  return matches[0];
}

function workflowRuns(api, workflow) {
  const pages = apiRequest(api, `actions/workflows/${workflow.id}/runs?event=workflow_dispatch&per_page=100`, true);
  requireValue(Array.isArray(pages) && pages.every((page) => Array.isArray(page?.workflow_runs)),
    'workflow runs are unavailable');
  return pages.flatMap((page) => page.workflow_runs);
}

function dispatchWorkflow({ branch, correlationId, dispatch = defaultDispatch, sourceSha }) {
  dispatch(branch, sourceSha, correlationId);
}

function defaultDispatch(branch, sourceSha, correlationId) {
  try {
    execFileSync('gh', [
      'workflow', 'run', workflowFile, '--repo', repository, '--ref', 'main',
      '-f', `candidate_ref=${branch}`, '-f', `candidate_sha=${sourceSha}`, '-f', `correlation_id=${correlationId}`
    ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch {
    fail('candidate workflow could not be dispatched');
  }
}

async function defaultWait() {
  await new Promise((resolve) => setTimeout(resolve, 1_000));
}

function defaultCorrelationId() {
  return randomUUID().replaceAll('-', '');
}

export async function waitForCorrelatedRun({
  api, controlSha: expectedControlSha, correlationId, maxPolls = 60, wait = defaultWait, workflow
}) {
  requireValue(Number.isInteger(maxPolls) && maxPolls > 0, 'dispatch polling limit is invalid');
  for (let poll = 0; poll < maxPolls; poll += 1) {
    const selected = selectCorrelatedRun({
      controlSha: expectedControlSha, correlationId, runs: workflowRuns(api, workflow), workflow
    });
    if (selected) return selected;
    await wait();
  }
  fail('workflow dispatch correlation timed out');
}

export async function waitForCompletedRun({ api, controlSha: expectedControlSha, runId, wait = defaultWait, workflow }) {
  while (true) {
    const run = apiRequest(api, `actions/runs/${runId}`);
    assertRunIdentity({ controlSha: expectedControlSha, run, workflow });
    if (run.status === 'completed') {
      requireValue(run.conclusion === 'success', 'candidate workflow did not succeed');
      return run;
    }
    requireValue(['queued', 'in_progress', 'waiting', 'pending', 'requested'].includes(run.status),
      'candidate workflow has an unexpected status');
    await wait();
  }
}

function selectCandidateArtifact(artifacts, { run, sourceSha }) {
  const expectedName = artifactName(sourceSha, run.run_attempt);
  const matches = artifacts.filter((artifact) => artifact?.name === expectedName);
  requireValue(matches.length === 1, 'expected exactly one candidate documentation artifact');
  const [artifact] = matches;
  requireValue(artifact.expired === false && positiveId.test(String(artifact.id || ''))
    && artifactDigestPattern.test(artifact.digest || '')
    && String(artifact.workflow_run?.id) === String(run.id)
    && artifact.workflow_run?.head_sha === run.head_sha,
  'candidate artifact does not match the exact successful run');
  return artifact;
}

async function defaultReadArtifactProvenance(artifact) {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'resume-candidate-evidence-'));
  try {
    const archive = githubBinary(`actions/artifacts/${artifact.id}/zip`);
    const digest = `sha256:${createHash('sha256').update(archive).digest('hex')}`;
    requireValue(digest === artifact.digest, 'candidate artifact archive digest does not match GitHub identity');
    const archivePath = path.join(temporary, 'artifact.zip');
    await writeFile(archivePath, archive);
    try {
      execFileSync('unzip', ['-q', archivePath, '-d', temporary], { stdio: ['ignore', 'pipe', 'pipe'] });
    } catch {
      fail('candidate artifact archive is invalid');
    }
    return await readReleaseAssetProvenance(temporary);
  } finally {
    await rm(temporary, { force: true, recursive: true });
  }
}

function assertArtifactProvenance({ controlSha: expectedControlSha, provenance, run, sourceSha }) {
  requireValue(provenance?.checkoutCommit === sourceSha
    && provenance.artifactName === artifactName(sourceSha, run.run_attempt)
    && provenance.producer?.kind === 'release-candidate'
    && provenance.producer.workflow === workflowPath
    && provenance.producer.controlSha === expectedControlSha
    && String(provenance.producer.runId) === String(run.id)
    && String(provenance.producer.runAttempt) === String(run.run_attempt),
  'candidate artifact provenance does not match the selected run');
}

export function promotionCommand({ run, sourceSha }) {
  return `npm run promote:candidate-doc-assets -- --source-sha ${sourceSha} --run-id ${run.id} --run-attempt ${run.run_attempt}`;
}

export async function verifyCandidateRun({
  api = githubApi, controlSha: expectedControlSha, readArtifactProvenance = defaultReadArtifactProvenance,
  runId, sourceSha, workflow
}) {
  const run = apiRequest(api, `actions/runs/${runId}`);
  assertRunIdentity({ controlSha: expectedControlSha, run, workflow });
  requireValue(run.status === 'completed' && run.conclusion === 'success', 'candidate workflow did not succeed');
  const pages = apiRequest(api, `actions/runs/${run.id}/artifacts?per_page=100`, true);
  requireValue(Array.isArray(pages) && pages.every((page) => Array.isArray(page?.artifacts)),
    'candidate artifacts are unavailable');
  const artifact = selectCandidateArtifact(pages.flatMap((page) => page.artifacts), { run, sourceSha });
  const provenance = await readArtifactProvenance(artifact);
  assertArtifactProvenance({ controlSha: expectedControlSha, provenance, run, sourceSha });
  return { command: promotionCommand({ run, sourceSha }), run, url: runUrl(run.id) };
}

export async function runCandidateAssets({ rootDirectory = process.cwd(), dependencies = {}, values }) {
  const gitCommand = dependencies.git || git;
  const api = dependencies.api || githubApi;
  const checkout = candidateCheckoutIdentity({ gitCommand, rootDirectory });
  assertGithubRepository(api);
  const workflow = apiRequest(api, `actions/workflows/${workflowFile}`);
  assertWorkflow(workflow);
  requireValue(values.mode !== 'resume' || values.sourceSha === checkout.sourceSha,
    'explicit source SHA does not match the candidate checkout');

  let runId = values.runId;
  let expectedControlSha;
  if (values.mode === 'start') {
    expectedControlSha = (dependencies.controlSha || controlSha)(checkout.root, gitCommand);
    requireValue(fullCommitPattern.test(expectedControlSha), 'main control SHA is invalid');
    const correlationId = (dependencies.createCorrelationId || defaultCorrelationId)();
    requireValue(correlationPattern.test(correlationId || ''), 'dispatch correlation ID is invalid');
    dispatchWorkflow({
      branch: checkout.branch, correlationId, dispatch: dependencies.dispatch || defaultDispatch, sourceSha: checkout.sourceSha
    });
    runId = String((await waitForCorrelatedRun({
      api, controlSha: expectedControlSha, correlationId, maxPolls: dependencies.maxCorrelationPolls ?? 60,
      wait: dependencies.wait || defaultWait, workflow
    })).id);
  } else {
    const selectedRun = apiRequest(api, `actions/runs/${runId}`);
    assertRunIdentity({ controlSha: selectedRun?.head_sha, run: selectedRun, workflow });
    expectedControlSha = selectedRun.head_sha;
  }
  const completedRun = await waitForCompletedRun({
    api, controlSha: expectedControlSha, runId, wait: dependencies.wait || defaultWait, workflow
  });
  return verifyCandidateRun({
    api, controlSha: expectedControlSha, readArtifactProvenance: dependencies.readArtifactProvenance || defaultReadArtifactProvenance,
    runId: String(completedRun.id), sourceSha: checkout.sourceSha, workflow
  });
}

function isEntrypoint() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(path.resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isEntrypoint()) {
  try {
    const result = await runCandidateAssets({ values: parseArguments(process.argv.slice(2)) });
    console.log(result.url);
    console.log(result.command);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
