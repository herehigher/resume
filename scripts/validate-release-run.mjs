import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repository = 'herehigher/resume';
const fullCommit = /^[0-9a-f]{40}$/;
const positiveId = /^[1-9][0-9]*$/;
const version = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

function requireValue(condition, message) {
  if (!condition) throw new Error(`Release run validation failed: ${message}`);
}

function githubApi(endpoint, paginate = false) {
  const args = ['api'];
  if (paginate) args.push('--paginate', '--slurp');
  args.push(`repos/${repository}/${endpoint}`);
  return JSON.parse(execFileSync('gh', args, {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 8 * 1024 * 1024
  }));
}

function workflowIdentity(api) {
  const workflow = api('actions/workflows/ci.yml');
  requireValue(workflow.path === '.github/workflows/ci.yml' && Number.isInteger(workflow.id),
    'workflow path mismatch');
  return workflow;
}

export function validateRunIdentity(run, workflow, { event, sha, runId }) {
  requireValue(String(run.id) === String(runId), 'run ID mismatch');
  requireValue(run.repository?.full_name === repository
    && run.head_repository?.full_name === repository
    && run.repository?.id === run.head_repository?.id, 'repository mismatch');
  requireValue(run.workflow_id === workflow.id && run.path === workflow.path, 'workflow identity mismatch');
  requireValue(run.head_branch === 'main' && run.event === event, 'run must use the trusted main entry');
  requireValue(run.status === 'completed' && run.conclusion === 'success', 'run is not successfully completed');
  requireValue(fullCommit.test(run.head_sha || ''), 'run SHA is invalid');
  if (sha) requireValue(run.head_sha === sha, 'source SHA mismatch');
}

function successfulJob(api, runId, name, requiredStep) {
  const pages = api(`actions/runs/${runId}/jobs?filter=latest&per_page=100`, true);
  requireValue(Array.isArray(pages), 'job lookup is invalid');
  const matching = pages.flatMap((page) => page.jobs || []).filter((job) => job.name === name);
  requireValue(matching.length === 1 && matching[0].conclusion === 'success', `${name} job did not succeed`);
  if (requiredStep) requireValue(matching[0].steps?.some((step) => (
    step.name === requiredStep && step.conclusion === 'success'
  )), 'full browser quality was not executed');
}

function parsePackageVersion(contents, label) {
  try {
    const packageVersion = JSON.parse(contents).version;
    requireValue(version.test(packageVersion || ''), `${label} package version is invalid`);
    return packageVersion;
  } catch (error) {
    if (error.message?.startsWith('Release run validation failed:')) throw error;
    throw new Error(`Release run validation failed: ${label} package metadata is invalid`);
  }
}

function packageVersionAt(api, ref, label) {
  requireValue(fullCommit.test(ref) || ref === 'main', `${label} package ref is invalid`);
  const file = api(`contents/package.json?ref=${encodeURIComponent(ref)}`);
  requireValue(file?.encoding === 'base64' && typeof file.content === 'string', `${label} package lookup is invalid`);
  return parsePackageVersion(Buffer.from(file.content.replaceAll('\n', ''), 'base64').toString('utf8'), label);
}

function exactMergedPullRequest(pullRequests, run) {
  requireValue(Array.isArray(pullRequests), 'merged pull request lookup is invalid');
  const matches = pullRequests.filter((pullRequest) => (
    pullRequest.state === 'closed'
    && typeof pullRequest.merged_at === 'string'
    && pullRequest.base?.ref === 'main'
    && pullRequest.base?.repo?.full_name === repository
    && pullRequest.base?.repo?.id === run.repository.id
    && pullRequest.merge_commit_sha === run.head_sha
  ));
  requireValue(matches.length <= 1, 'more than one merged pull request matches this Quality SHA');
  const mainMerge = pullRequests.some((pullRequest) => (
    pullRequest.state === 'closed'
    && typeof pullRequest.merged_at === 'string'
    && pullRequest.base?.ref === 'main'
  ));
  requireValue(matches.length === 1 || !mainMerge, 'merged pull request identity does not match the Quality SHA');
  return matches[0] || null;
}

function resolveQualityRun(api, workflow, values) {
  requireValue(Object.keys(values).every((key) => ['sha', 'run-id'].includes(key))
    && Object.keys(values).length >= 1 && Object.keys(values).length <= 2
    && fullCommit.test(values.sha || '')
    && (!values['run-id'] || positiveId.test(values['run-id'])), 'full source SHA and optional run ID required');
  let runId = values['run-id'];
  if (!runId) {
    const runs = api(`actions/workflows/${workflow.id}/runs?branch=main&event=push&status=success&head_sha=${values.sha}&per_page=100`);
    const run = runs.workflow_runs?.find((item) => item.head_sha === values.sha && item.head_branch === 'main'
      && item.event === 'push' && item.conclusion === 'success');
    requireValue(run, 'no successful main Quality exists for this SHA; wait for or rerun that Quality run');
    runId = String(run.id);
  }
  const run = api(`actions/runs/${runId}`);
  validateRunIdentity(run, workflow, { event: 'push', sha: values.sha, runId });
  successfulJob(api, runId, 'quality', 'Browser and PDF acceptance tests');
  return { run, runId };
}

export function authorizeReleaseEligibility({ api = githubApi, environment = process.env, values }) {
  requireValue(environment.GITHUB_REPOSITORY === repository, 'only the official repository may publish');
  requireValue(Object.keys(values).every((key) => ['sha', 'run-id'].includes(key))
    && Object.keys(values).length >= 1 && Object.keys(values).length <= 2
    && positiveId.test(values['run-id'] || '')
    && (!values.sha || fullCommit.test(values.sha)), 'Quality run ID and optional full source SHA required');
  const workflow = workflowIdentity(api);
  const run = api(`actions/runs/${values['run-id']}`);
  validateRunIdentity(run, workflow, { event: 'push', sha: values.sha, runId: values['run-id'] });
  successfulJob(api, values['run-id'], 'quality', 'Browser and PDF acceptance tests');
  const pullRequest = exactMergedPullRequest(api(`commits/${run.head_sha}/pulls`), run);
  const result = {
    quality_run_id: String(run.id), release_required: 'false', release_sha: run.head_sha,
    release_tag: '', reason: 'no-merged-pull-request',
    run_url: `https://github.com/${repository}/actions/runs/${run.id}`
  };
  if (!pullRequest) return result;
  requireValue(fullCommit.test(pullRequest.base?.sha || ''), 'merged pull request base SHA is invalid');
  requireValue(positiveId.test(String(pullRequest.number || '')), 'merged pull request number is invalid');
  const [baseVersion, releaseVersion, currentVersion] = [
    packageVersionAt(api, pullRequest.base.sha, 'base'),
    packageVersionAt(api, run.head_sha, 'release'),
    packageVersionAt(api, 'main', 'current main')
  ];
  if (baseVersion === releaseVersion) return { ...result, reason: 'version-unchanged' };
  if (releaseVersion !== currentVersion) return { ...result, reason: 'stale-version' };
  return {
    ...result, pull_request_number: String(pullRequest.number), reason: 'eligible',
    release_required: 'true', release_tag: `v${releaseVersion}`
  };
}

export function validateReleaseRun(mode, values, environment = process.env, dependencies = {}) {
  requireValue(environment.GITHUB_REPOSITORY === repository, 'only the official repository may publish');
  const api = dependencies.api || githubApi;
  if (mode === 'eligibility') return authorizeReleaseEligibility({ api, environment, values });
  requireValue(mode === 'quality', 'unknown mode');
  const workflow = workflowIdentity(api);
  const { runId } = resolveQualityRun(api, workflow, values);
  return { run_id: runId, run_url: `https://github.com/${repository}/actions/runs/${runId}` };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [mode, ...args] = process.argv.slice(2);
    const values = {};
    for (let index = 0; index < args.length; index += 2) {
      const name = args[index];
      requireValue(name?.startsWith('--') && args[index + 1] && !args[index + 1].startsWith('--')
        && !(name.slice(2) in values), 'invalid arguments');
      values[name.slice(2)] = args[index + 1];
    }
    const result = validateReleaseRun(mode, values);
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT,
      Object.entries(result).map(([key, value]) => `${key}=${value}\n`).join(''));
    console.log(`Verified ${mode} run: ${result.run_url}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
