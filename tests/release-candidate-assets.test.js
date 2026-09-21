import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmod, copyFile, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  CandidateAssetsFailure,
  candidateRunTitle,
  candidateCheckoutIdentity,
  parseArguments,
  repositoryEndpoint,
  runCandidateAssets,
  selectCorrelatedRun,
  verifyCandidateRun
} from '../scripts/release-candidate-assets.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const repository = { id: 1, full_name: 'herehigher/resume' };
const sourceSha = 'a'.repeat(40);
const controlSha = 'c'.repeat(40);
const workflow = { id: 42, path: '.github/workflows/release-candidate-assets.yml' };
const correlationId = 'e'.repeat(32);

function run({
  conclusion = 'success', event = 'workflow_dispatch', headBranch = 'main', headSha = controlSha,
  displayTitle, id = 91, runAttempt = 2, status = 'completed'
} = {}) {
  return {
    conclusion, event, head_branch: headBranch, head_repository: repository, head_sha: headSha, id,
    path: workflow.path, repository, run_attempt: runAttempt, status, workflow_id: workflow.id,
    ...(displayTitle ? { display_title: displayTitle } : {})
  };
}

function artifact({ candidateSha = sourceSha, candidateRun = run(), expired = false, id = 1234, name, digest = `sha256:${'d'.repeat(64)}` } = {}) {
  return {
    digest, expired, id,
    name: name || `release-candidate-documentation-assets-${candidateSha}-attempt-${candidateRun.run_attempt}`,
    workflow_run: { head_sha: candidateRun.head_sha, id: candidateRun.id }
  };
}

function provenance({ candidateRun = run(), candidateSha = sourceSha, producerRunAttempt = String(candidateRun.run_attempt) } = {}) {
  return {
    artifactName: `release-candidate-documentation-assets-${candidateSha}-attempt-${candidateRun.run_attempt}`,
    checkoutCommit: candidateSha,
    producer: {
      controlSha, kind: 'release-candidate', runAttempt: producerRunAttempt,
      runId: String(candidateRun.id), workflow: workflow.path
    }
  };
}

function gitFixture({ branch = 'release-v0.4.0', head = sourceSha, remote = sourceSha, status = '' } = {}) {
  return (_root, args) => {
    if (args.join(' ') === 'remote get-url origin') return 'https://github.com/herehigher/resume.git';
    if (args[0] === 'status') return status;
    if (args.join(' ') === 'branch --show-current') return branch;
    if (args.join(' ') === 'rev-parse HEAD') return head;
    if (args[0] === 'ls-remote' && args.at(-1) === `refs/heads/${branch}`) return `${remote}\trefs/heads/${branch}`;
    if (args[0] === 'ls-remote' && args.at(-1) === 'refs/heads/main') return `${controlSha}\trefs/heads/main`;
    throw new Error(`unexpected git request: ${args.join(' ')}`);
  };
}

function apiFixture({ candidateRun = run(), listedRuns, runResponses = [candidateRun], artifacts = [artifact({ candidateRun })] } = {}) {
  let listCalls = 0;
  let runCalls = 0;
  return (endpoint, paginate) => {
    if (endpoint === '') return repository;
    if (endpoint === 'actions/workflows/release-candidate-assets.yml') return workflow;
    if (endpoint === `actions/workflows/${workflow.id}/runs?event=workflow_dispatch&per_page=100`) {
      assert.equal(paginate, true);
      const workflowRuns = listedRuns?.[listCalls++] || [];
      return [{ workflow_runs: workflowRuns }];
    }
    if (endpoint === `actions/runs/${candidateRun.id}`) return runResponses[Math.min(runCalls++, runResponses.length - 1)];
    if (endpoint === `actions/runs/${candidateRun.id}/artifacts?per_page=100`) {
      assert.equal(paginate, true);
      return [{ artifacts }];
    }
    throw new Error(`unexpected API request: ${endpoint}`);
  };
}

test('candidate CLI waits for its unique correlation and returns the verified promotion command', async () => {
  const candidateRun = run({ displayTitle: candidateRunTitle(correlationId), status: 'queued' });
  const completed = run({ displayTitle: candidateRunTitle(correlationId) });
  const dispatched = [];
  const result = await runCandidateAssets({
    dependencies: {
      api: apiFixture({
        candidateRun,
        listedRuns: [[run({ id: 90 })], [candidateRun]],
        runResponses: [candidateRun, completed], artifacts: [artifact({ candidateRun: completed })]
      }),
      createCorrelationId: () => correlationId,
      dispatch(branch, sha, correlation) { dispatched.push({ branch, correlation, sha }); },
      git: gitFixture(),
      readArtifactProvenance: async () => provenance({ candidateRun: completed }),
      wait: async () => {}
    },
    rootDirectory: '/fixture', values: parseArguments([])
  });
  assert.deepEqual(dispatched, [{ branch: 'release-v0.4.0', correlation: correlationId, sha: sourceSha }]);
  assert.equal(result.url, 'https://github.com/herehigher/resume/actions/runs/91');
  assert.equal(result.command, `npm run promote:candidate-doc-assets -- --source-sha ${sourceSha} --run-id 91 --run-attempt 2`);
});

test('candidate checkout requires a pushed clean official branch whose remote HEAD is exact', () => {
  assert.deepEqual(candidateCheckoutIdentity({ gitCommand: gitFixture(), rootDirectory: '/fixture' }), {
    branch: 'release-v0.4.0', root: '/fixture', sourceSha
  });
  assert.throws(() => candidateCheckoutIdentity({ gitCommand: gitFixture({ remote: 'b'.repeat(40) }) }), /does not match/);
  assert.throws(() => candidateCheckoutIdentity({ gitCommand: gitFixture({ remote: '' }) }), /not pushed/);
  assert.throws(() => candidateCheckoutIdentity({ gitCommand: gitFixture({ status: '?? local-only' }) }), /not clean/);
  assert.throws(() => candidateCheckoutIdentity({ gitCommand: gitFixture({ branch: 'main' }) }), /branch is invalid/);
});

test('candidate CLI stops on dispatch ambiguity, timeout, start failure, and untrusted run metadata', async () => {
  assert.throws(() => selectCorrelatedRun({
    controlSha, correlationId, runs: [
      run({ displayTitle: candidateRunTitle(correlationId), id: 91 }),
      run({ displayTitle: candidateRunTitle(correlationId), id: 92 })
    ], workflow
  }), /correlation is ambiguous/);
  await assert.rejects(runCandidateAssets({
    dependencies: {
      api: apiFixture({ listedRuns: [[]] }), dispatch() { throw new CandidateAssetsFailure('candidate workflow could not be dispatched'); },
      git: gitFixture()
    }, rootDirectory: '/fixture', values: parseArguments([])
  }), /could not be dispatched/);
  await assert.rejects(runCandidateAssets({
    dependencies: {
      api: apiFixture({ listedRuns: [[], []] }), createCorrelationId: () => correlationId,
      dispatch() {}, git: gitFixture(), maxCorrelationPolls: 2, wait: async () => {}
    }, rootDirectory: '/fixture', values: parseArguments([])
  }), /correlation timed out/);
  await assert.rejects(runCandidateAssets({
    dependencies: {
      api: apiFixture({ candidateRun: run({ event: 'push' }) }), git: gitFixture(),
      readArtifactProvenance: async () => provenance()
    }, rootDirectory: '/fixture', values: parseArguments(['--run-id', '91', '--source-sha', sourceSha])
  }), /trusted main control ref/);
  for (const candidateRun of [
    run({ headBranch: 'release-v0.4.0' }),
    { ...run(), repository: { id: 2, full_name: 'elsewhere/resume' } },
    { ...run(), path: '.github/workflows/ci.yml' }, { ...run(), run_attempt: 0 }
  ]) {
    await assert.rejects(runCandidateAssets({
      dependencies: { api: apiFixture({ candidateRun }), git: gitFixture() }, rootDirectory: '/fixture',
      values: parseArguments(['--run-id', '91', '--source-sha', sourceSha])
    }), /workflow run (does not match|repository|identity)/);
  }
  await assert.rejects(runCandidateAssets({
    dependencies: { api: apiFixture({ candidateRun: run({ conclusion: 'failure' }) }), git: gitFixture() },
    rootDirectory: '/fixture', values: parseArguments(['--run-id', '91', '--source-sha', sourceSha])
  }), /did not succeed/);
});

test('candidate verification stops for wrong source, attempt, duplicate, expired, and malformed artifacts', async () => {
  const candidateRun = run();
  const cases = [
    { artifacts: [artifact({ candidateSha: 'b'.repeat(40), candidateRun })], expected: /exactly one/ },
    { artifacts: [artifact({ candidateRun }), artifact({ candidateRun })], expected: /exactly one/ },
    { artifacts: [artifact({ candidateRun, expired: true })], expected: /does not match/ },
    { artifacts: [artifact({ candidateRun, digest: 'sha256:bad' })], expected: /does not match/ }
  ];
  for (const { artifacts, expected } of cases) {
    await assert.rejects(verifyCandidateRun({
      api: apiFixture({ candidateRun, artifacts }), controlSha,
      readArtifactProvenance: async () => provenance({ candidateRun }), runId: '91', sourceSha, workflow
    }), expected);
  }
  await assert.rejects(verifyCandidateRun({
    api: apiFixture({ candidateRun }), controlSha,
    readArtifactProvenance: async () => provenance({ candidateRun, producerRunAttempt: '1' }), runId: '91', sourceSha, workflow
  }), /provenance/);
});

test('an interrupted wait makes no state, and explicit run ID plus source SHA resumes the same verification', async () => {
  const queued = run({ status: 'in_progress' });
  await assert.rejects(runCandidateAssets({
    dependencies: {
      api: apiFixture({ candidateRun: queued, runResponses: [queued, queued] }), git: gitFixture(),
      wait: async () => { throw new Error('interrupted'); }
    }, rootDirectory: '/fixture', values: parseArguments(['--run-id', '91', '--source-sha', sourceSha])
  }), /interrupted/);
  const completed = run();
  const resumed = await runCandidateAssets({
    dependencies: {
      api: apiFixture({ candidateRun: completed }), git: gitFixture(),
      readArtifactProvenance: async () => provenance({ candidateRun: completed })
    }, rootDirectory: '/fixture', values: parseArguments(['--run-id', '91', '--source-sha', sourceSha])
  });
  assert.equal(resumed.url, 'https://github.com/herehigher/resume/actions/runs/91');
  assert.throws(() => parseArguments(['--run-id', '91']), /provide no arguments/);
  assert.throws(() => parseArguments(['--run-id', '91', '--source-sha', 'short']), /invalid/);
});

test('resume binds historical control SHA from the explicit run after main has advanced', async () => {
  const historicalControlSha = 'd'.repeat(40);
  const historicalRun = run({ headSha: historicalControlSha });
  const result = await runCandidateAssets({
    dependencies: {
      api: apiFixture({ candidateRun: historicalRun }), git: gitFixture(),
      readArtifactProvenance: async () => ({ ...provenance({ candidateRun: historicalRun }), producer: {
        ...provenance({ candidateRun: historicalRun }).producer, controlSha: historicalControlSha
      } })
    }, rootDirectory: '/fixture', values: parseArguments(['--run-id', '91', '--source-sha', sourceSha])
  });
  assert.equal(result.run.head_sha, historicalControlSha);
});

test('repository root API omits a trailing slash and the CLI entrypoint works from a path with spaces', async (t) => {
  assert.equal(repositoryEndpoint(''), 'repos/herehigher/resume');
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'resume candidate cli '));
  t.after(() => rm(temporary, { force: true, recursive: true }));
  const spacedRoot = path.join(temporary, 'checkout with spaces');
  const scriptsDirectory = path.join(spacedRoot, 'scripts');
  const bin = path.join(temporary, 'bin');
  await mkdir(scriptsDirectory, { recursive: true });
  await mkdir(bin);
  await copyFile(path.join(root, 'scripts/release-candidate-assets.mjs'), path.join(scriptsDirectory, 'release-candidate-assets.mjs'));
  await copyFile(path.join(root, 'scripts/release-doc-assets.mjs'), path.join(scriptsDirectory, 'release-doc-assets.mjs'));
  const requests = path.join(temporary, 'gh-requests');
  const fakeGit = path.join(bin, 'git');
  const fakeGh = path.join(bin, 'gh');
await writeFile(fakeGit, `#!/bin/sh
printf '%s\\n' "$*" >> "$FAKE_GIT_REQUESTS"
shift 2
case "$1" in
  remote) printf '%s\\n' https://github.com/herehigher/resume.git ;;
  status) ;;
  branch) printf '%s\\n' release-v0.4.0 ;;
  rev-parse) printf '%s\\n' ${sourceSha} ;;
  ls-remote)
    case "$5" in
      refs/heads/release-v0.4.0) printf '%s\\t%s\\n' ${sourceSha} refs/heads/release-v0.4.0 ;;
      refs/heads/main) printf '%s\\t%s\\n' ${controlSha} refs/heads/main ;;
      *) exit 64 ;;
    esac ;;
  *) exit 64 ;;
esac
`);
  await writeFile(fakeGh, `#!/bin/sh
printf '%s\\n' "$*" >> "$FAKE_GH_REQUESTS"
if [ "$1" = api ] && [ "$2" = repos/herehigher/resume ]; then
  printf '%s\\n' '{"id":1,"full_name":"herehigher/resume"}'
  exit 0
fi
exit 64
`);
  await chmod(fakeGit, 0o755);
  await chmod(fakeGh, 0o755);
  const executed = spawnSync(process.execPath, [path.join(scriptsDirectory, 'release-candidate-assets.mjs')], {
    cwd: spacedRoot, encoding: 'utf8', env: {
      ...process.env, FAKE_GH_REQUESTS: requests, FAKE_GIT_REQUESTS: `${requests}-git`, PATH: `${bin}${path.delimiter}${process.env.PATH}`
    }
  });
  assert.equal(executed.status, 1);
  assert.match(executed.stderr, /GitHub verification is unavailable/, await readFile(`${requests}-git`, 'utf8'));
  assert.match(await readFile(requests, 'utf8'), /^api repos\/herehigher\/resume$/m);
});
