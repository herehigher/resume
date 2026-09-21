import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CandidateAssetsFailure,
  candidateCheckoutIdentity,
  parseArguments,
  runCandidateAssets,
  selectDispatchedRun,
  verifyCandidateRun
} from '../scripts/release-candidate-assets.mjs';

const repository = { id: 1, full_name: 'herehigher/resume' };
const sourceSha = 'a'.repeat(40);
const controlSha = 'c'.repeat(40);
const workflow = { id: 42, path: '.github/workflows/release-candidate-assets.yml' };

function run({
  conclusion = 'success', event = 'workflow_dispatch', headBranch = 'main', headSha = controlSha,
  id = 91, runAttempt = 2, status = 'completed'
} = {}) {
  return {
    conclusion, event, head_branch: headBranch, head_repository: repository, head_sha: headSha, id,
    path: workflow.path, repository, run_attempt: runAttempt, status, workflow_id: workflow.id
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

test('candidate CLI dispatches once, keeps the exact new run ID, and returns the verified promotion command', async () => {
  const candidateRun = run({ status: 'queued' });
  const completed = run();
  const dispatched = [];
  const result = await runCandidateAssets({
    dependencies: {
      api: apiFixture({
        candidateRun,
        listedRuns: [[run({ id: 90 })], [run({ id: 90 }), candidateRun]],
        runResponses: [candidateRun, completed], artifacts: [artifact({ candidateRun: completed })]
      }),
      dispatch(branch, sha) { dispatched.push({ branch, sha }); },
      git: gitFixture(),
      readArtifactProvenance: async () => provenance({ candidateRun: completed }),
      wait: async () => {}
    },
    rootDirectory: '/fixture', values: parseArguments([])
  });
  assert.deepEqual(dispatched, [{ branch: 'release-v0.4.0', sha: sourceSha }]);
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

test('candidate CLI stops on dispatch ambiguity, start failure, and untrusted run metadata', async () => {
  assert.throws(() => selectDispatchedRun({
    after: [run({ id: 91 }), run({ id: 92 })], before: [], controlSha, workflow
  }), /exactly one/);
  await assert.rejects(runCandidateAssets({
    dependencies: {
      api: apiFixture({ listedRuns: [[]] }), dispatch() { throw new CandidateAssetsFailure('candidate workflow could not be dispatched'); },
      git: gitFixture()
    }, rootDirectory: '/fixture', values: parseArguments([])
  }), /could not be dispatched/);
  await assert.rejects(runCandidateAssets({
    dependencies: {
      api: apiFixture({ candidateRun: run({ event: 'push' }) }), git: gitFixture(),
      readArtifactProvenance: async () => provenance()
    }, rootDirectory: '/fixture', values: parseArguments(['--run-id', '91', '--source-sha', sourceSha])
  }), /trusted main control ref/);
  for (const candidateRun of [
    run({ headBranch: 'release-v0.4.0' }), run({ headSha: 'b'.repeat(40) }),
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
      api: apiFixture({ candidateRun: queued, runResponses: [queued] }), git: gitFixture(),
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
