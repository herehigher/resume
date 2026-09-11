import { execFileSync } from 'node:child_process';
import { lstat, mkdtemp, mkdir, rm, copyFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveSourceCommit } from './generate-doc-assets.mjs';
import {
  promoteReleaseAssets,
  readReleaseAssetProvenance,
  releaseDocumentationAssetPaths
} from './release-doc-assets.mjs';
import { verifyDocumentationAssets } from './verify-doc-assets.mjs';

const repository = 'herehigher/resume';
const fullCommitPattern = /^[0-9a-f]{40}$/;
const positiveId = /^[1-9][0-9]*$/;

function fail(message) {
  throw new Error(`Pull request documentation asset promotion failed: ${message}`);
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
    fail(`git ${args[0]} could not complete`);
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
    fail(`GitHub API response is unavailable for ${endpoint}`);
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

export function resolvePromotionIdentity({ artifact, mergeSha, pullRequest, run, workflow }) {
  requireValue(workflow?.path === '.github/workflows/ci.yml' && Number.isInteger(workflow.id),
    'Quality workflow identity is invalid');
  requireValue(Number.isInteger(pullRequest?.number) && pullRequest.state === 'open'
    && officialRepository(pullRequest.base?.repo) && officialRepository(pullRequest.head?.repo)
    && fullCommitPattern.test(pullRequest.head?.sha || ''), 'pull request identity is invalid');
  requireValue(fullCommitPattern.test(mergeSha || ''), 'pull request merge SHA is invalid');
  requireValue(String(run?.id) && positiveId.test(String(run.id))
    && officialRepository(run.repository) && officialRepository(run.head_repository)
    && run.workflow_id === workflow.id && run.path === workflow.path
    && run.event === 'pull_request' && run.head_branch === pullRequest.head.ref
    && run.status === 'completed' && run.conclusion === 'success' && run.head_sha === mergeSha,
  'Quality run does not match the current pull request merge commit');
  exactPullRequest(run, pullRequest.number);

  const artifactName = `documentation-assets-${mergeSha}`;
  requireValue(artifact?.name === artifactName && artifact.expired === false
    && String(artifact.workflow_run?.id) === String(run.id)
    && artifact.workflow_run?.head_sha === mergeSha,
  'documentation artifact does not match the exact Quality run and merge commit');
  return {
    artifactName,
    candidateSha: pullRequest.head.sha,
    mergeSha,
    pullRequestNumber: String(pullRequest.number),
    qualityRunId: String(run.id)
  };
}

function assertOfficialOrigin(candidateRoot) {
  const origin = git(candidateRoot, ['remote', 'get-url', 'origin']);
  requireValue(/^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)(herehigher\/resume)(?:\.git)?\/?$/.test(origin),
    'candidate checkout origin is not the official repository');
}

function assertCleanAssetTargets(candidateRoot) {
  const status = git(candidateRoot, ['status', '--porcelain=v1', '--untracked-files=all', '--', ...releaseDocumentationAssetPaths]);
  requireValue(!status, 'candidate checkout already has uncommitted documentation asset changes');
}

export function assertCandidateSource(candidateRoot, candidateSha) {
  try {
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

export function selectExactArtifact(artifacts, runId, mergeSha) {
  const name = `documentation-assets-${mergeSha}`;
  const matches = artifacts.filter((artifact) => artifact.name === name);
  requireValue(matches.length === 1, 'expected exactly one documentation artifact for the Quality run');
  requireValue(matches[0].expired === false, 'documentation artifact has expired');
  requireValue(String(matches[0].workflow_run?.id) === String(runId)
    && matches[0].workflow_run?.head_sha === mergeSha,
  'documentation artifact does not match the exact Quality run and merge commit');
  return matches[0];
}

function exactArtifact(runId, mergeSha) {
  const pages = githubApi(`actions/runs/${runId}/artifacts?per_page=100`, true);
  return selectExactArtifact(pages.flatMap((page) => page.artifacts || []), runId, mergeSha);
}

function currentMergeSha(candidateRoot, pullRequestNumber) {
  git(candidateRoot, ['fetch', '--no-tags', 'origin', `refs/pull/${pullRequestNumber}/merge`]);
  const mergeSha = git(candidateRoot, ['rev-parse', 'FETCH_HEAD']);
  requireValue(fullCommitPattern.test(mergeSha), 'fetched pull request merge SHA is invalid');
  return mergeSha;
}

export function selectQualityRun(candidates, pullRequest, mergeSha) {
  const matches = candidates.filter((run) => (
    run.head_sha === mergeSha && run.event === 'pull_request'
      && run.status === 'completed' && run.conclusion === 'success'
      && Array.isArray(run.pull_requests) && run.pull_requests.length === 1
      && Number(run.pull_requests[0]?.number) === pullRequest.number
  ));
  requireValue(matches.length === 1, 'expected exactly one successful Quality run for the current pull request merge commit');
  return matches[0];
}

function findQualityRunForPullRequest(workflow, pullRequest, mergeSha) {
  const pages = githubApi(`actions/workflows/${workflow.id}/runs?event=pull_request&status=success&per_page=100`, true);
  const selected = selectQualityRun(pages.flatMap((page) => page.workflow_runs || []), pullRequest, mergeSha);
  return githubApi(`actions/runs/${selected.id}`);
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

export async function promotePullRequestDocumentationAssets({ candidateRoot = process.cwd(), values }) {
  const candidate = path.resolve(candidateRoot);
  assertOfficialOrigin(candidate);
  const workflow = githubApi('actions/workflows/ci.yml');
  let pullRequest;
  let mergeSha;
  let run;

  if (values.pr) {
    pullRequest = githubApi(`pulls/${values.pr}`);
    mergeSha = currentMergeSha(candidate, values.pr);
    run = findQualityRunForPullRequest(workflow, pullRequest, mergeSha);
  } else {
    run = githubApi(`actions/runs/${values['quality-run-id']}`);
    requireValue(Array.isArray(run.pull_requests) && run.pull_requests.length === 1
      && positiveId.test(String(run.pull_requests[0]?.number || '')), 'Quality run must identify exactly one pull request');
    pullRequest = githubApi(`pulls/${run.pull_requests[0].number}`);
    mergeSha = currentMergeSha(candidate, pullRequest.number);
  }

  const artifact = exactArtifact(run.id, mergeSha);
  const identity = resolvePromotionIdentity({ artifact, mergeSha, pullRequest, run, workflow });
  assertCandidateSource(candidate, identity.candidateSha);
  assertCleanAssetTargets(candidate);

  const temporary = await mkdtemp(path.join(os.tmpdir(), 'resume-pr-doc-assets-'));
  const sourceRoot = path.join(temporary, 'source');
  const artifactRoot = path.join(temporary, 'artifact');
  let worktreeCreated = false;
  let operationError;
  let result;
  try {
    git(candidate, ['worktree', 'add', '--detach', sourceRoot, identity.mergeSha]);
    worktreeCreated = true;
    git(sourceRoot, ['lfs', 'pull', '--include=docs/screenshots/*.png,output/pdf/*.pdf', '--exclude=']);
    try {
      resolveSourceCommit(sourceRoot, identity.mergeSha);
    } catch (error) {
      fail(error.message);
    }
    await mkdir(artifactRoot);
    downloadArtifact(identity.qualityRunId, identity.artifactName, artifactRoot);
    assertArtifactManifestProvenance(await readReleaseAssetProvenance(artifactRoot), identity);
    await promoteReleaseAssets({ assetRoot: artifactRoot, sourceRoot, sourceSha: identity.mergeSha });
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
        git(candidate, ['worktree', 'remove', '--force', sourceRoot]);
      } catch (error) {
        cleanupError = error;
      }
    }
    try {
      await rm(temporary, { force: true, recursive: true });
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
    const result = await promotePullRequestDocumentationAssets({ values: parseArguments(process.argv.slice(2)) });
    console.log(`Promoted only these ${result.files.length} files from Quality run ${result.qualityRunId}:\n${result.files.map((file) => `- ${file}`).join('\n')}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
