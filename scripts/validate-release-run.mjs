import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repository = 'herehigher/resume';
const positiveId = /^[1-9][0-9]*$/;

function requireValue(condition, message) {
  if (!condition) throw new Error(`Release run validation failed: ${message}`);
}

function api(endpoint) {
  return JSON.parse(execFileSync('gh', ['api', `repos/${repository}/${endpoint}`], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 8 * 1024 * 1024
  }));
}

export function validateRunIdentity(run, workflow, { event, sha, runId }) {
  requireValue(String(run.id) === String(runId), 'run ID mismatch');
  requireValue(run.repository?.full_name === repository
    && run.head_repository?.full_name === repository
    && run.repository?.id === run.head_repository?.id, 'repository mismatch');
  requireValue(run.workflow_id === workflow.id && run.path === workflow.path, 'workflow identity mismatch');
  requireValue(run.head_branch === 'main' && run.event === event, 'run must use the trusted main entry');
  requireValue(run.status === 'completed' && run.conclusion === 'success', 'run is not successfully completed');
  requireValue(/^[0-9a-f]{40}$/.test(run.head_sha || ''), 'run SHA is invalid');
  if (sha) requireValue(run.head_sha === sha, 'source SHA mismatch');
}

function successfulJob(runId, name, requiredStep) {
  const pages = JSON.parse(execFileSync('gh', ['api', '--paginate', '--slurp',
    `repos/${repository}/actions/runs/${runId}/jobs?filter=latest&per_page=100`
  ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 8 * 1024 * 1024 }));
  const matching = pages.flatMap((page) => page.jobs).filter((job) => job.name === name);
  requireValue(matching.length === 1 && matching[0].conclusion === 'success', `${name} job did not succeed`);
  if (requiredStep) requireValue(matching[0].steps?.some((step) => (
    step.name === requiredStep && step.conclusion === 'success'
  )), 'full browser quality was not executed');
}

export function validateReleaseRun(mode, values, environment = process.env) {
  requireValue(environment.GITHUB_REPOSITORY === repository, 'only the official repository may publish');
  requireValue(mode === 'quality', 'unknown mode');
  const workflowFile = 'ci.yml';
  const workflow = api(`actions/workflows/${workflowFile}`);
  requireValue(workflow.path === `.github/workflows/${workflowFile}` && Number.isInteger(workflow.id),
    'workflow path mismatch');
  requireValue(Object.keys(values).every((key) => ['sha', 'run-id'].includes(key))
    && Object.keys(values).length >= 1 && Object.keys(values).length <= 2
    && /^[0-9a-f]{40}$/.test(values.sha || '')
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
  successfulJob(runId, 'quality', 'Browser and PDF acceptance tests');
  const result = { run_id: runId, run_url: `https://github.com/${repository}/actions/runs/${runId}` };
  return result;
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
