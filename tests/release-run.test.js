import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { validateRunIdentity } from '../scripts/validate-release-run.mjs';

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
    [`${prefix}actions/workflows/456/runs?branch=main&event=push&status=success&head_sha=${sha}&per_page=100`]: { workflow_runs: [qualityRun] }
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
});
