import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { authorizeReleaseEligibility, validateRunIdentity } from '../scripts/validate-release-run.mjs';

const sha = 'a'.repeat(40);
const repository = { id: 123, full_name: 'herehigher/resume' };
const workflow = { id: 456, path: '.github/workflows/ci.yml' };
const run = { id: 789, repository, head_repository: repository, workflow_id: workflow.id,
  path: workflow.path, head_branch: 'main', event: 'push', status: 'completed',
  conclusion: 'success', head_sha: sha };

test('publication rejects wrong workflow, branch, repository, SHA, and incomplete runs', () => {
  const expected = { event: 'push', sha, runId: 789 };
  validateRunIdentity(run, workflow, expected);
  for (const changes of [
    { id: 900 }, { head_repository: { id: 999, full_name: 'fork/resume' } },
    { workflow_id: 900 }, { path: '.github/workflows/untrusted.yml' }, { head_branch: 'feature' },
    { event: 'workflow_dispatch' }, { status: 'in_progress' }, { conclusion: 'failure' }, { head_sha: 'c'.repeat(40) }
  ]) assert.throws(() => validateRunIdentity({ ...run, ...changes }, workflow, expected), /validation failed/);
});

test('release eligibility only accepts one merged version pull request at the current main version', () => {
  const baseSha = 'b'.repeat(40);
  const packageResponse = (packageVersion) => ({
    content: Buffer.from(JSON.stringify({ version: packageVersion })).toString('base64'), encoding: 'base64'
  });
  const pullRequest = {
    base: { ref: 'main', repo: repository, sha: baseSha }, merge_commit_sha: sha,
    merged_at: '2026-09-13T00:00:00Z', number: 198, state: 'closed'
  };
  const jobs = [{ jobs: [{ name: 'quality', conclusion: 'success', steps: [
    { name: 'Browser and PDF acceptance tests', conclusion: 'success' }
  ] }] }];
  const responses = new Map([
    ['actions/workflows/ci.yml', workflow], ['actions/runs/789', run],
    ['actions/runs/789/jobs?filter=latest&per_page=100', jobs],
    [`commits/${sha}/pulls`, [pullRequest]],
    [`contents/package.json?ref=${baseSha}`, packageResponse('0.3.0')],
    [`contents/package.json?ref=${sha}`, packageResponse('0.3.1')],
    ['contents/package.json?ref=main', packageResponse('0.3.1')]
  ]);
  const api = (endpoint) => {
    if (!responses.has(endpoint)) throw new Error(`unexpected endpoint: ${endpoint}`);
    return responses.get(endpoint);
  };
  const values = { 'run-id': '789', sha };
  assert.deepEqual(authorizeReleaseEligibility({ api, environment: { GITHUB_REPOSITORY: 'herehigher/resume' }, values }), {
    pull_request_number: '198', quality_run_id: '789', reason: 'eligible', release_required: 'true',
    release_sha: sha, release_tag: 'v0.3.1', run_url: 'https://github.com/herehigher/resume/actions/runs/789'
  });

  responses.set(`commits/${sha}/pulls`, []);
  assert.equal(authorizeReleaseEligibility({ api, environment: { GITHUB_REPOSITORY: 'herehigher/resume' }, values }).reason,
    'no-merged-pull-request');

  responses.set(`commits/${sha}/pulls`, [pullRequest, { ...pullRequest, number: 199 }]);
  assert.throws(() => authorizeReleaseEligibility({ api, environment: { GITHUB_REPOSITORY: 'herehigher/resume' }, values }),
    /more than one merged pull request/);

  responses.set(`commits/${sha}/pulls`, [{ ...pullRequest, merge_commit_sha: 'c'.repeat(40) }]);
  assert.throws(() => authorizeReleaseEligibility({ api, environment: { GITHUB_REPOSITORY: 'herehigher/resume' }, values }),
    /merged pull request identity/);

  responses.set(`commits/${sha}/pulls`, [pullRequest]);
  responses.set('contents/package.json?ref=main', packageResponse('0.3.2'));
  assert.equal(authorizeReleaseEligibility({ api, environment: { GITHUB_REPOSITORY: 'herehigher/resume' }, values }).reason,
    'stale-version');
  responses.set('contents/package.json?ref=main', packageResponse('0.3.1'));
  responses.set(`contents/package.json?ref=${baseSha}`, packageResponse('0.3.1'));
  assert.equal(authorizeReleaseEligibility({ api, environment: { GITHUB_REPOSITORY: 'herehigher/resume' }, values }).reason,
    'version-unchanged');
});

test('the actual CLI binds an exact Quality run and refuses skipped full quality', (t) => {
  const temporary = mkdtempSync(path.join(os.tmpdir(), 'resume-release-run-'));
  t.after(() => rmSync(temporary, { recursive: true, force: true }));
  const fakeGh = path.join(temporary, 'gh');
  writeFileSync(fakeGh, `#!/usr/bin/env node
const fs = require('node:fs');
const fixtures = JSON.parse(fs.readFileSync(process.env.RELEASE_TEST_RESPONSES, 'utf8'));
const response = fixtures[process.argv.at(-1)];
if (!response) process.exit(1);
process.stdout.write(JSON.stringify(response));
`);
  chmodSync(fakeGh, 0o755);
  const fixturesPath = path.join(temporary, 'responses.json');
  const output = path.join(temporary, 'output');
  const prefix = 'repos/herehigher/resume/';
  const qualityWorkflow = workflow;
  const qualityRun = run;
  const qualityJob = { name: 'quality', conclusion: 'success', steps: [{ name: 'Browser and PDF acceptance tests', conclusion: 'success' }] };
  const fixtures = {
    [`${prefix}actions/workflows/ci.yml`]: qualityWorkflow,
    [`${prefix}actions/runs/789`]: qualityRun,
    [`${prefix}actions/runs/789/jobs?filter=latest&per_page=100`]: [{ jobs: [qualityJob] }],
    [`${prefix}actions/workflows/456/runs?branch=main&event=push&status=success&head_sha=${sha}&per_page=100`]: { workflow_runs: [qualityRun] },
    [`${prefix}commits/${sha}/pulls`]: [{ base: { ref: 'main', repo: repository, sha: 'b'.repeat(40) }, merge_commit_sha: sha,
      merged_at: '2026-09-13T00:00:00Z', number: 198, state: 'closed' }],
    [`${prefix}contents/package.json?ref=${'b'.repeat(40)}`]: { content: Buffer.from('{"version":"0.3.0"}').toString('base64'), encoding: 'base64' },
    [`${prefix}contents/package.json?ref=${sha}`]: { content: Buffer.from('{"version":"0.3.1"}').toString('base64'), encoding: 'base64' },
    [`${prefix}contents/package.json?ref=main`]: { content: Buffer.from('{"version":"0.3.1"}').toString('base64'), encoding: 'base64' }
  };
  const execute = (args) => {
    writeFileSync(fixturesPath, JSON.stringify(fixtures));
    return spawnSync(process.execPath, [fileURLToPath(new URL('../scripts/validate-release-run.mjs', import.meta.url)), ...args], {
      encoding: 'utf8', env: { ...process.env, PATH: `${temporary}${path.delimiter}${process.env.PATH}`,
        GITHUB_REPOSITORY: 'herehigher/resume', GITHUB_OUTPUT: output, RELEASE_TEST_RESPONSES: fixturesPath }
    });
  };
  let result = execute(['quality', '--sha', sha, '--run-id', '789']);
  assert.equal(result.status, 0, result.stderr);
  assert.ok(readFileSync(output, 'utf8').includes('run_id=789\n'));
  result = execute(['quality', '--sha', sha]);
  assert.equal(result.status, 0, result.stderr);
  qualityJob.steps[0].conclusion = 'skipped';
  result = execute(['quality', '--sha', sha]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /full browser quality was not executed/);
  qualityJob.steps[0].conclusion = 'success';
  result = execute(['eligibility', '--run-id', '789', '--sha', sha]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(readFileSync(output, 'utf8'), /release_required=true/);
});
