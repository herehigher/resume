import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { lstat, mkdtemp, mkdir, rm, copyFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  promoteReleaseAssets,
  readReleaseAssetProvenance,
  releaseDocumentationAssetPaths
} from './release-doc-assets.mjs';

const repository = 'herehigher/resume';
const fullCommitPattern = /^[0-9a-f]{40}$/;
const positiveId = /^[1-9][0-9]*$/;
export const evidenceFailureCategories = Object.freeze({
  identityMismatch: 'current-evidence-identity-mismatch',
  toolingBootstrapFailure: 'current-evidence-local-tooling-bootstrap-failure',
  unavailable: 'current-evidence-github-api-or-artifact-unavailable'
});

class EvidenceFailure extends Error {
  constructor(message, category = evidenceFailureCategories.identityMismatch) {
    super(`Pull request documentation asset promotion failed: ${message}`);
    this.category = category;
  }
}

function fail(message, category) {
  throw new EvidenceFailure(message, category);
}

function requireValue(condition, message) {
  if (!condition) fail(message);
}

function git(cwd, args) {
  try {
    return execFileSync('git', ['-C', cwd, ...args], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']
    }).trim();
  } catch {
    fail(`git ${args[0]} could not complete`, evidenceFailureCategories.toolingBootstrapFailure);
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
    fail(`GitHub API response is unavailable for ${endpoint}`, evidenceFailureCategories.unavailable);
  }
}

export function classifyEvidenceFailure(error) {
  return Object.values(evidenceFailureCategories).includes(error?.category)
    ? error.category
    : evidenceFailureCategories.toolingBootstrapFailure;
}

function apiRequest(api, endpoint, paginate = false) {
  try {
    return api(endpoint, paginate);
  } catch (error) {
    if (error instanceof EvidenceFailure) throw error;
    fail('GitHub API response is unavailable', evidenceFailureCategories.unavailable);
  }
}

function officialRepository(value) {
  return value?.id && value.full_name === repository;
}

function exactPullRequest(run, pullRequestNumber) {
  const pullRequests = run.pull_requests;
  requireValue(Array.isArray(pullRequests) && pullRequests.length === 1,
    'Quality run must identify exactly one pull request');
  requireValue(Number(pullRequests[0]?.number) === Number(pullRequestNumber),
    'Quality run pull request does not match the requested pull request');
}

export function parseArguments(args) {
  const values = {};
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index];
    const value = args[index + 1];
    if (!name?.startsWith('--') || !value || value.startsWith('--')) fail('arguments are invalid');
    const key = name.slice(2);
    if (!['pr', 'quality-run-id'].includes(key) || key in values) fail('arguments are invalid');
    values[key] = value;
  }
  requireValue(Object.keys(values).length === 1, 'provide exactly one of --pr or --quality-run-id');
  if (values.pr) requireValue(positiveId.test(values.pr), 'pull request number is invalid');
  if (values['quality-run-id']) requireValue(positiveId.test(values['quality-run-id']), 'Quality run ID is invalid');
  return values;
}

export function resolvePromotionIdentity({ artifact, mergeSha, pullRequest, qualityJob, run, workflow }) {
  requireValue(workflow?.path === '.github/workflows/ci.yml' && Number.isInteger(workflow.id),
    'Quality workflow identity is invalid');
  requireValue(Number.isInteger(pullRequest?.number) && pullRequest.state === 'open'
    && officialRepository(pullRequest.base?.repo) && officialRepository(pullRequest.head?.repo)
    && fullCommitPattern.test(pullRequest.head?.sha || ''), 'pull request identity is invalid');
  requireValue(fullCommitPattern.test(mergeSha || ''), 'pull request merge SHA is invalid');
  requireValue(String(run?.id) && positiveId.test(String(run.id)), 'Quality run ID is invalid');
  requireValue(officialRepository(run.repository), 'Quality run repository is invalid');
  requireValue(!run.head_repository || officialRepository(run.head_repository),
    'Quality run head repository is invalid');
  requireValue(run.workflow_id === workflow.id && run.path === workflow.path,
    'Quality run workflow identity is invalid');
  requireValue(run.event === 'pull_request' && run.head_branch === pullRequest.head.ref,
    'Quality run pull request ref is invalid');
  requireValue(['in_progress', 'completed'].includes(run.status),
    'Quality run is not active or completed');
  requireValue(run.head_sha === pullRequest.head.sha, 'Quality run does not match the current pull request head');
  exactPullRequest(run, pullRequest.number);
  requireValue(qualityJob?.name === 'quality' && qualityJob.status === 'completed'
    && qualityJob.conclusion === 'success' && String(qualityJob.run_id) === String(run.id)
    && qualityJob.head_sha === pullRequest.head.sha,
  'Quality job does not match the successful current pull request run');

  const artifactName = `documentation-assets-${mergeSha}`;
  requireValue(artifact?.name === artifactName && artifact.expired === false
    && String(artifact.workflow_run?.id) === String(run.id)
    && artifact.workflow_run?.head_sha === pullRequest.head.sha,
  'documentation artifact does not match the exact Quality run and merge commit');
  return {
    artifactName,
    candidateSha: pullRequest.head.sha,
    mergeSha,
    pullRequestNumber: String(pullRequest.number),
    qualityRunId: String(run.id)
  };
}

function assertOfficialOrigin(candidateRoot, gitCommand = git) {
  const origin = gitCommand(candidateRoot, ['remote', 'get-url', 'origin']);
  requireValue(/^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)(herehigher\/resume)(?:\.git)?\/?$/.test(origin),
    'candidate checkout origin is not the official repository');
}

function assertCleanAssetTargets(candidateRoot) {
  const status = git(candidateRoot, ['status', '--porcelain=v1', '--untracked-files=all', '--', ...releaseDocumentationAssetPaths]);
  requireValue(!status, 'candidate checkout already has uncommitted documentation asset changes');
}

export async function assertCandidateSource(candidateRoot, candidateSha) {
  try {
    const { resolveSourceCommit } = await import('./generate-doc-assets.mjs');
    return resolveSourceCommit(candidateRoot, candidateSha);
  } catch (error) {
    fail(error.message);
  }
}

export function assertArtifactManifestProvenance(provenance, identity) {
  requireValue(provenance?.artifactName === identity.artifactName
    && provenance.checkoutCommit === identity.mergeSha && provenance.qualityRunId === identity.qualityRunId,
  'artifact manifest provenance does not match the selected Quality run');
}

async function copyPromotedFiles({ candidateRoot, sourceRoot }) {
  for (const relativePath of releaseDocumentationAssetPaths) {
    const source = path.resolve(sourceRoot, relativePath);
    const target = path.resolve(candidateRoot, relativePath);
    requireValue(source.startsWith(`${path.resolve(sourceRoot)}${path.sep}`)
      && target.startsWith(`${path.resolve(candidateRoot)}${path.sep}`), 'documentation asset path escapes its root');
    const sourceMetadata = await lstat(source);
    requireValue(sourceMetadata.isFile() && !sourceMetadata.isSymbolicLink(),
      `promoted source is not a regular file: ${relativePath}`);
    try {
      const targetMetadata = await lstat(target);
      requireValue(targetMetadata.isFile() && !targetMetadata.isSymbolicLink(),
        `candidate target is not a regular file: ${relativePath}`);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(source, target);
  }
}

export function selectExactArtifact(artifacts, runId, mergeSha, candidateSha) {
  const name = `documentation-assets-${mergeSha}`;
  const matches = artifacts.filter((artifact) => artifact.name === name);
  if (matches.length === 0) {
    fail('documentation artifact is unavailable for the Quality run', evidenceFailureCategories.unavailable);
  }
  requireValue(matches.length === 1, 'expected exactly one documentation artifact for the Quality run');
  if (matches[0].expired !== false) {
    fail('documentation artifact has expired', evidenceFailureCategories.unavailable);
  }
  requireValue(String(matches[0].workflow_run?.id) === String(runId)
    && matches[0].workflow_run?.head_sha === candidateSha,
  'documentation artifact does not match the exact Quality run and merge commit');
  return matches[0];
}

function exactArtifact(runId, mergeSha, candidateSha, api = githubApi) {
  const pages = apiRequest(api, `actions/runs/${runId}/artifacts?per_page=100`, true);
  return selectExactArtifact(pages.flatMap((page) => page.artifacts || []), runId, mergeSha, candidateSha);
}

export function selectExactQualityJob(jobs, runId, candidateSha) {
  const matches = jobs.filter((job) => job.name === 'quality');
  requireValue(matches.length === 1, 'expected exactly one Quality job for the current workflow attempt');
  requireValue(matches[0].status === 'completed' && matches[0].conclusion === 'success'
    && String(matches[0].run_id) === String(runId) && matches[0].head_sha === candidateSha,
  'Quality job does not match the successful current pull request run');
  return matches[0];
}

function exactQualityJob(runId, candidateSha, api = githubApi) {
  const pages = apiRequest(api, `actions/runs/${runId}/jobs?filter=latest&per_page=100`, true);
  return selectExactQualityJob(pages.flatMap((page) => page.jobs || []), runId, candidateSha);
}

function currentMergeSha(candidateRoot, pullRequestNumber) {
  git(candidateRoot, ['fetch', '--no-tags', 'origin', `refs/pull/${pullRequestNumber}/merge`]);
  const mergeSha = git(candidateRoot, ['rev-parse', 'FETCH_HEAD']);
  requireValue(fullCommitPattern.test(mergeSha), 'fetched pull request merge SHA is invalid');
  return mergeSha;
}

export function resolvePullRequestQualityEvidence({
  candidateRoot = process.cwd(), dependencies = {}, pullRequestNumber, qualityRunId, sourceMergeSha
}) {
  requireValue(positiveId.test(String(pullRequestNumber || '')), 'pull request number is invalid');
  requireValue(positiveId.test(String(qualityRunId || '')), 'Quality run ID is invalid');
  requireValue(fullCommitPattern.test(sourceMergeSha || ''), 'source merge SHA is invalid');
  const candidate = path.resolve(candidateRoot);
  const api = dependencies.api || githubApi;
  const currentMerge = dependencies.currentMergeSha || currentMergeSha;
  const gitCommand = dependencies.git || git;
  assertOfficialOrigin(candidate, gitCommand);
  const workflow = apiRequest(api, 'actions/workflows/ci.yml');
  const pullRequest = apiRequest(api, `pulls/${pullRequestNumber}`);
  const mergeSha = currentMerge(candidate, pullRequestNumber);
  const run = apiRequest(api, `actions/runs/${qualityRunId}`);
  const qualityJob = exactQualityJob(run.id, pullRequest.head.sha, api);
  const artifact = exactArtifact(run.id, mergeSha, pullRequest.head.sha, api);
  const identity = resolvePromotionIdentity({ artifact, mergeSha, pullRequest, qualityJob, run, workflow });
  requireValue(identity.mergeSha === sourceMergeSha, 'Quality evidence does not match this pull request merge SHA');
  return identity;
}

export function selectQualityRun(candidates, pullRequest) {
  const matches = candidates.filter((run) => (
    run.head_sha === pullRequest.head.sha && run.event === 'pull_request'
      && run.status === 'completed'
      && Array.isArray(run.pull_requests) && run.pull_requests.length === 1
      && Number(run.pull_requests[0]?.number) === pullRequest.number
  ));
  requireValue(matches.length === 1, 'expected exactly one completed workflow run for the current pull request head');
  return matches[0];
}

function findQualityRunForPullRequest(workflow, pullRequest, api = githubApi) {
  const pages = apiRequest(api, `actions/workflows/${workflow.id}/runs?event=pull_request&status=completed&per_page=100`, true);
  const selected = selectQualityRun(pages.flatMap((page) => page.workflow_runs || []), pullRequest);
  return apiRequest(api, `actions/runs/${selected.id}`);
}

function downloadArtifact(runId, artifactName, destination) {
  try {
    execFileSync('gh', ['run', 'download', runId, '--repo', repository, '--name', artifactName, '--dir', destination], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 8 * 1024 * 1024
    });
  } catch {
    fail('documentation artifact could not be downloaded');
  }
}

export async function promotePullRequestDocumentationAssets({ candidateRoot = process.cwd(), dependencies = {}, values }) {
  const api = dependencies.api || githubApi;
  const currentMerge = dependencies.currentMergeSha || currentMergeSha;
  const download = dependencies.downloadArtifact || downloadArtifact;
  const gitCommand = dependencies.git || git;
  const createTemporaryDirectory = dependencies.createTemporaryDirectory
    || (() => mkdtemp(path.join(os.tmpdir(), 'resume-pr-doc-assets-')));
  const removeTemporaryDirectory = dependencies.removeTemporaryDirectory
    || ((directory) => rm(directory, { force: true, recursive: true }));
  const candidate = path.resolve(candidateRoot);
  assertOfficialOrigin(candidate, gitCommand);
  const workflow = api('actions/workflows/ci.yml');
  let pullRequest;
  let mergeSha;
  let run;

  if (values.pr) {
    pullRequest = api(`pulls/${values.pr}`);
    mergeSha = currentMerge(candidate, values.pr);
    run = findQualityRunForPullRequest(workflow, pullRequest, api);
  } else {
    run = api(`actions/runs/${values['quality-run-id']}`);
    requireValue(Array.isArray(run.pull_requests) && run.pull_requests.length === 1
      && positiveId.test(String(run.pull_requests[0]?.number || '')), 'Quality run must identify exactly one pull request');
    pullRequest = api(`pulls/${run.pull_requests[0].number}`);
    mergeSha = currentMerge(candidate, pullRequest.number);
  }

  const qualityJob = exactQualityJob(run.id, pullRequest.head.sha, api);
  const artifact = exactArtifact(run.id, mergeSha, pullRequest.head.sha, api);
  const identity = resolvePromotionIdentity({ artifact, mergeSha, pullRequest, qualityJob, run, workflow });
  await assertCandidateSource(candidate, identity.candidateSha);
  assertCleanAssetTargets(candidate);

  const temporary = await createTemporaryDirectory();
  const sourceRoot = path.join(temporary, 'source');
  const artifactRoot = path.join(temporary, 'artifact');
  let worktreeCreated = false;
  let operationError;
  let result;
  try {
    gitCommand(candidate, ['worktree', 'add', '--detach', sourceRoot, identity.mergeSha]);
    worktreeCreated = true;
    gitCommand(sourceRoot, ['lfs', 'pull', '--include=docs/screenshots/*.png,output/pdf/*.pdf', '--exclude=']);
    await assertCandidateSource(sourceRoot, identity.mergeSha);
    await mkdir(artifactRoot);
    await download(identity.qualityRunId, identity.artifactName, artifactRoot);
    assertArtifactManifestProvenance(await readReleaseAssetProvenance(artifactRoot), identity);
    await promoteReleaseAssets({ assetRoot: artifactRoot, sourceRoot, sourceSha: identity.mergeSha });
    const { verifyDocumentationAssets } = await import('./verify-doc-assets.mjs');
    await verifyDocumentationAssets({
      assetRoot: sourceRoot, requireExactSource: false, sourceRoot: candidate, sourceSha: identity.candidateSha
    });
    await copyPromotedFiles({ candidateRoot: candidate, sourceRoot });
    result = { files: [...releaseDocumentationAssetPaths], ...identity };
  } catch (error) {
    operationError = error;
  } finally {
    let cleanupError;
    if (worktreeCreated) {
      try {
        gitCommand(candidate, ['worktree', 'remove', '--force', sourceRoot]);
      } catch (error) {
        cleanupError = error;
      }
    }
    try {
      await removeTemporaryDirectory(temporary);
    } catch (error) {
      cleanupError ||= error;
    }
    if (!operationError && cleanupError) operationError = cleanupError;
  }
  if (operationError) throw operationError;
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [command, ...args] = process.argv.slice(2);
    if (command === 'evidence') {
      const values = {};
      for (let index = 0; index < args.length; index += 2) {
        const name = args[index];
        const value = args[index + 1];
        if (!name?.startsWith('--') || !value || value.startsWith('--') || !(name.slice(2) in { pr: true, 'quality-run-id': true, 'source-merge-sha': true })
          || name.slice(2) in values) fail('evidence arguments are invalid');
        values[name.slice(2)] = value;
      }
      requireValue(Object.keys(values).length === 3, 'evidence requires --pr, --quality-run-id, and --source-merge-sha');
      const result = resolvePullRequestQualityEvidence({
        pullRequestNumber: values.pr, qualityRunId: values['quality-run-id'], sourceMergeSha: values['source-merge-sha']
      });
      if (process.env.GITHUB_OUTPUT) {
        for (const [key, value] of Object.entries({
          artifact_name: result.artifactName,
          pull_request_number: result.pullRequestNumber,
          quality_run_id: result.qualityRunId,
          source_merge_sha: result.mergeSha
        })) appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
      }
      console.log(`Resolved exact documentation evidence from Quality run ${result.qualityRunId}.`);
    } else {
      const result = await promotePullRequestDocumentationAssets({ values: parseArguments([command, ...args]) });
      console.log(`Promoted only these ${result.files.length} files from Quality run ${result.qualityRunId}:\n${result.files.map((file) => `- ${file}`).join('\n')}`);
    }
  } catch (error) {
    if (process.argv[2] === 'evidence') {
      const category = classifyEvidenceFailure(error);
      if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `evidence_failure_category=${category}\n`);
      console.error('Current Quality evidence could not be resolved.');
    } else {
      console.error(error.message);
    }
    process.exitCode = 1;
  }
}
