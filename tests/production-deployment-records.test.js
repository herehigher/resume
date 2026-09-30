import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HISTORICAL_ACCEPTED_RELEASES,
  PRODUCTION_RECORD_BOT,
  PRODUCTION_RECORD_TASK,
  acceptedBaselineRecords,
  appendProductionRecordDeployment,
  readProductionRecordHistory,
  verifyWorkflowRunCoverage,
  parseProductionRecordDeployment,
  resolveProductionRecordLedger,
  validateProductionRecord
} from '../scripts/production-deployment-records.mjs';

const DIGEST_1 = 'a'.repeat(64);
const UUID_3 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const UUID_4 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function record(fields) {
  const runId = String(fields.runId || '50000000000');
  const workflow = fields.workflow || 'release.yml';
  return {
    schemaVersion: 1,
    sequence: 3,
    event: 'release_started',
    workflow,
    runId,
    runAttempt: 1,
    recordedByRunId: runId,
    recordedByRunAttempt: 1,
    recordedByWorkflow: workflow,
    tag: 'v0.4.3',
    sourceSha: 'c'.repeat(40),
    artifactDigest: DIGEST_1,
    deploymentId: null,
    deploymentUrl: null,
    fromDeploymentId: HISTORICAL_ACCEPTED_RELEASES[1].deploymentId,
    currentDeploymentId: HISTORICAL_ACCEPTED_RELEASES[1].deploymentId,
    currentDeploymentUrl: HISTORICAL_ACCEPTED_RELEASES[1].deploymentUrl,
    runUrl: `https://github.com/herehigher/resume/actions/runs/${runId}`,
    ...fields
  };
}

function baselineRecords() {
  return structuredClone(acceptedBaselineRecords());
}

function rollbackRecords({ mismatchedCurrent = false } = {}) {
  const before = baselineRecords();
  before.push(record({
    sequence: 3,
    event: 'rollback_started',
    workflow: 'rollback-production.yml',
    runId: '50000000010',
    recordedByRunId: '50000000010',
    recordedByWorkflow: 'rollback-production.yml',
    tag: 'v0.4.1',
    sourceSha: HISTORICAL_ACCEPTED_RELEASES[0].sourceSha,
    artifactDigest: HISTORICAL_ACCEPTED_RELEASES[0].artifactDigest,
    deploymentId: HISTORICAL_ACCEPTED_RELEASES[0].deploymentId,
    deploymentUrl: HISTORICAL_ACCEPTED_RELEASES[0].deploymentUrl,
    fromDeploymentId: HISTORICAL_ACCEPTED_RELEASES[1].deploymentId,
    currentDeploymentId: HISTORICAL_ACCEPTED_RELEASES[1].deploymentId,
    currentDeploymentUrl: HISTORICAL_ACCEPTED_RELEASES[1].deploymentUrl
  }));
  before.push(record({
    sequence: 4,
    event: 'rollback_completed',
    workflow: 'rollback-production.yml',
    runId: '50000000010',
    recordedByRunId: '50000000010',
    recordedByWorkflow: 'rollback-production.yml',
    tag: 'v0.4.1',
    sourceSha: HISTORICAL_ACCEPTED_RELEASES[0].sourceSha,
    artifactDigest: HISTORICAL_ACCEPTED_RELEASES[0].artifactDigest,
    deploymentId: HISTORICAL_ACCEPTED_RELEASES[0].deploymentId,
    deploymentUrl: HISTORICAL_ACCEPTED_RELEASES[0].deploymentUrl,
    fromDeploymentId: HISTORICAL_ACCEPTED_RELEASES[1].deploymentId,
    currentDeploymentId: mismatchedCurrent ? UUID_3 : HISTORICAL_ACCEPTED_RELEASES[0].deploymentId,
    currentDeploymentUrl: mismatchedCurrent
      ? 'https://aaaaaaaa.herehigher-rs.pages.dev/'
      : HISTORICAL_ACCEPTED_RELEASES[0].deploymentUrl
  }));
  return before;
}

function verificationRecords() {
  const records = rollbackRecords();
  records[3] = { ...records[3], event: 'rollback_unverified' };
  records.push(record({
    sequence: 5,
    event: 'production_verification_started',
    workflow: 'reconcile-production.yml',
    runId: '50000000015',
    recordedByRunId: '50000000015',
    recordedByWorkflow: 'reconcile-production.yml',
    tag: HISTORICAL_ACCEPTED_RELEASES[0].tag,
    sourceSha: HISTORICAL_ACCEPTED_RELEASES[0].sourceSha,
    artifactDigest: HISTORICAL_ACCEPTED_RELEASES[0].artifactDigest,
    deploymentId: HISTORICAL_ACCEPTED_RELEASES[0].deploymentId,
    deploymentUrl: HISTORICAL_ACCEPTED_RELEASES[0].deploymentUrl,
    fromDeploymentId: HISTORICAL_ACCEPTED_RELEASES[0].deploymentId,
    currentDeploymentId: HISTORICAL_ACCEPTED_RELEASES[0].deploymentId,
    currentDeploymentUrl: HISTORICAL_ACCEPTED_RELEASES[0].deploymentUrl
  }));
  return records;
}

function verificationTerminal(fields = {}) {
  return record({
    sequence: 6,
    event: 'production_verified',
    workflow: 'reconcile-production.yml',
    runId: '50000000015',
    recordedByRunId: '50000000016',
    recordedByWorkflow: 'reconcile-production.yml',
    tag: HISTORICAL_ACCEPTED_RELEASES[0].tag,
    sourceSha: HISTORICAL_ACCEPTED_RELEASES[0].sourceSha,
    artifactDigest: HISTORICAL_ACCEPTED_RELEASES[0].artifactDigest,
    deploymentId: HISTORICAL_ACCEPTED_RELEASES[0].deploymentId,
    deploymentUrl: HISTORICAL_ACCEPTED_RELEASES[0].deploymentUrl,
    fromDeploymentId: HISTORICAL_ACCEPTED_RELEASES[0].deploymentId,
    currentDeploymentId: HISTORICAL_ACCEPTED_RELEASES[0].deploymentId,
    currentDeploymentUrl: HISTORICAL_ACCEPTED_RELEASES[0].deploymentUrl,
    ...fields
  });
}

test('release intent with no deployment yet is a valid durable record', () => {
  const intent = record({});
  assert.equal(validateProductionRecord(intent).deploymentId, null);
});

test('event names match the complete supported form', () => {
  assert.throws(() => validateProductionRecord(record({ event: 'release_started_extra' })), /event is invalid/);
});

test('GitHub deployment records require the Actions bot and exact source identity', () => {
  const payload = record({});
  const deployment = { id: 123, task: PRODUCTION_RECORD_TASK, environment: 'production',
    creator: { login: PRODUCTION_RECORD_BOT }, created_at: '2026-09-30T00:00:00Z',
    ref: payload.sourceSha, sha: payload.sourceSha, payload };
  assert.equal(parseProductionRecordDeployment(deployment).sequence, 3);
  assert.equal(parseProductionRecordDeployment({ ...deployment, payload: JSON.stringify(payload) }).sequence, 3);
  assert.throws(() => parseProductionRecordDeployment({ ...deployment, creator: { login: 'somebody' } }), /provenance/);
  assert.throws(() => parseProductionRecordDeployment({ ...deployment, sha: 'd'.repeat(40) }), /source/);
  assert.throws(() => parseProductionRecordDeployment({ ...deployment, payload: '{' }), /invalid JSON/);
  assert.equal(parseProductionRecordDeployment({ ...deployment, task: 'deploy' }), null);
});

test('record history uses GitHub Deployments and never reads or writes an issue', async () => {
  const intent = record({});
  const deployment = { id: 123, task: PRODUCTION_RECORD_TASK, environment: 'production',
    creator: { login: PRODUCTION_RECORD_BOT }, created_at: '2026-09-30T00:00:00Z',
    ref: intent.sourceSha, sha: intent.sourceSha, payload: intent };
  const requests = [];
  let created = false;
  const fetchImpl = async (input, options) => {
    const url = new URL(String(input));
    requests.push(`${options.method} ${url.pathname}`);
    assert.equal(url.pathname, '/repos/herehigher/resume/deployments');
    if (options.method === 'GET') return { ok: true, status: 200, json: async () => created ? [deployment] : [] };
    const body = JSON.parse(options.body);
    assert.equal(body.task, PRODUCTION_RECORD_TASK);
    assert.equal(body.environment, 'production');
    assert.equal(body.ref, intent.sourceSha);
    assert.deepEqual(body.payload, intent);
    created = true;
    return { ok: true, status: 201, json: async () => deployment };
  };
  const initial = await readProductionRecordHistory({ token: 'test-token', fetchImpl });
  assert.deepEqual(initial.map((item) => item.tag), ['v0.4.1', 'v0.4.2']);
  await appendProductionRecordDeployment({ record: intent, token: 'test-token', fetchImpl });
  const history = await readProductionRecordHistory({ token: 'test-token', fetchImpl });
  assert.equal(history[2].event, 'release_started');
  assert.deepEqual(requests, [
    'GET /repos/herehigher/resume/deployments',
    'GET /repos/herehigher/resume/deployments',
    'POST /repos/herehigher/resume/deployments',
    'GET /repos/herehigher/resume/deployments'
  ]);
});

test('baseline must include the fixed v0.4.1 then current v0.4.2 identities', () => {
  const ledger = resolveProductionRecordLedger(baselineRecords());
  assert.equal(ledger.active.tag, 'v0.4.2');
  assert.equal(ledger.active.deploymentId, HISTORICAL_ACCEPTED_RELEASES[1].deploymentId);
  const alteredBaseline = baselineRecords();
  alteredBaseline[0].sourceSha = 'd'.repeat(40);
  assert.throws(() => resolveProductionRecordLedger(alteredBaseline), /fixed baseline/);
  const duplicate = baselineRecords();
  duplicate[1].sequence = 1;
  assert.throws(() => resolveProductionRecordLedger(duplicate), /gap or duplicate/);
});

test('successful rollback must leave the accepted target deployment ID current', () => {
  const ledger = resolveProductionRecordLedger(rollbackRecords());
  assert.equal(ledger.active.tag, 'v0.4.1');
  assert.equal(ledger.active.deploymentId, HISTORICAL_ACCEPTED_RELEASES[0].deploymentId);
  assert.equal(ledger.active.acceptedDeploymentId, HISTORICAL_ACCEPTED_RELEASES[0].deploymentId);
  assert.equal(ledger.latestRollbackRunId, '50000000010');
});

test('a rollback that reaches matching source bytes under a different deployment ID is unverified and blocks release', () => {
  const records = rollbackRecords({ mismatchedCurrent: true });
  records[3] = { ...records[3], event: 'rollback_unverified' };
  const ledger = resolveProductionRecordLedger(records);
  assert.equal(ledger.active.status, 'unverified');
  assert.equal(ledger.active.deploymentId, UUID_3);
});

test('an old queued release cannot add an intent after a later rollback', () => {
  const records = rollbackRecords();
  records.push(record({
    sequence: 5,
    runId: '50000000009',
    fromDeploymentId: HISTORICAL_ACCEPTED_RELEASES[0].deploymentId,
    currentDeploymentId: HISTORICAL_ACCEPTED_RELEASES[0].deploymentId,
    currentDeploymentUrl: HISTORICAL_ACCEPTED_RELEASES[0].deploymentUrl
  }));
  assert.throws(() => resolveProductionRecordLedger(records), /before or during a later rollback/);
});

test('an unresolved intent blocks every subsequent production transition', () => {
  const records = baselineRecords();
  records.push(record({ sequence: 3 }));
  assert.throws(() => resolveProductionRecordLedger(records), /unresolved/);
  assert.equal(resolveProductionRecordLedger(records, { allowPending: true }).pending.operation, 'release');
});

test('the rollback target must be an accepted past release, not the current deployment', () => {
  const records = baselineRecords();
  records.push(record({
    sequence: 3,
    event: 'rollback_started',
    workflow: 'rollback-production.yml',
    runId: '50000000010',
    recordedByRunId: '50000000010',
    recordedByWorkflow: 'rollback-production.yml',
    tag: 'v9.9.9',
    sourceSha: 'd'.repeat(40),
    deploymentId: UUID_4,
    deploymentUrl: 'https://bbbbbbbb.herehigher-rs.pages.dev/',
    fromDeploymentId: HISTORICAL_ACCEPTED_RELEASES[1].deploymentId,
    currentDeploymentId: HISTORICAL_ACCEPTED_RELEASES[1].deploymentId,
    currentDeploymentUrl: HISTORICAL_ACCEPTED_RELEASES[1].deploymentUrl
  }));
  assert.throws(() => resolveProductionRecordLedger(records), /not a previously accepted/);
});

test('an unverified but exact accepted deployment can be retried until smoke passes', () => {
  const records = verificationRecords();
  const started = resolveProductionRecordLedger(records, { allowPending: true });
  assert.equal(started.active.status, 'unverified');
  assert.equal(started.pending.operation, 'verification');

  records.push(verificationTerminal({ event: 'production_verification_unverified' }));
  const retryable = resolveProductionRecordLedger(records);
  assert.equal(retryable.active.status, 'unverified');
  assert.equal(retryable.pending, null);

  const tag = HISTORICAL_ACCEPTED_RELEASES[0];
  records.push(record({
    sequence: 7,
    event: 'production_verification_started',
    workflow: 'reconcile-production.yml',
    runId: '50000000017',
    recordedByRunId: '50000000017',
    recordedByWorkflow: 'reconcile-production.yml',
    tag: tag.tag,
    sourceSha: tag.sourceSha,
    artifactDigest: tag.artifactDigest,
    deploymentId: tag.deploymentId,
    deploymentUrl: tag.deploymentUrl,
    fromDeploymentId: tag.deploymentId,
    currentDeploymentId: tag.deploymentId,
    currentDeploymentUrl: tag.deploymentUrl
  }));
  records.push(verificationTerminal({
    sequence: 8,
    runId: '50000000017',
    recordedByRunId: '50000000018'
  }));
  const verified = resolveProductionRecordLedger(records);
  assert.equal(verified.active.status, 'accepted');
  assert.equal(verified.active.deploymentId, tag.deploymentId);
  assert.equal(verified.active.tag, tag.tag);
  assert.equal(verified.pending, null);
});

test('reconciliation cannot accept a different deployment ID as the target', () => {
  const records = verificationRecords();
  records[4] = { ...records[4], deploymentId: UUID_4, deploymentUrl: 'https://bbbbbbbb.herehigher-rs.pages.dev/' };
  assert.throws(() => resolveProductionRecordLedger(records, { allowPending: true }), /does not match an unverified current deployment/);
});

test('workflow coverage checks every historical attempt so deleted records fail closed', async () => {
  const urls = [];
  const fetchImpl = async (input) => {
    const url = new URL(String(input));
    urls.push(url.pathname);
    let body;
    if (url.pathname.endsWith('/actions/workflows/release.yml/runs')) {
      body = { workflow_runs: [{ id: 50000000030, run_attempt: 2, actor: { login: 'herehigher' } }] };
    } else if (url.pathname.endsWith('/actions/workflows/rollback-production.yml/runs')) {
      body = { workflow_runs: [] };
    } else if (url.pathname.endsWith('/attempts/1/jobs')) {
      body = { jobs: [{ name: 'publish', steps: [{
        name: 'Verify durable production state and persist release intent', conclusion: 'success'
      }] }] };
    } else if (url.pathname.endsWith('/attempts/2/jobs')) {
      body = { jobs: [{ name: 'publish', steps: [{
        name: 'Verify durable production state and persist release intent', conclusion: 'failure'
      }] }] };
    } else {
      throw new Error(`Unexpected request path: ${url.pathname}`);
    }
    return { ok: true, status: 200, json: async () => body };
  };

  await assert.rejects(verifyWorkflowRunCoverage({
    records: [], token: 'test-token', minRunId: '50000000000', currentRunId: '50000000031',
    currentRunAttempt: 1, fetchImpl
  }), /attempt 1 has no intact production record/);
  assert.ok(urls.includes('/repos/herehigher/resume/actions/runs/50000000030/attempts/1/jobs'));

  urls.length = 0;
  await verifyWorkflowRunCoverage({
    records: [{ workflow: 'release.yml', runId: '50000000030', runAttempt: 1 }],
    token: 'test-token', minRunId: '50000000000', currentRunId: '50000000031',
    currentRunAttempt: 1, fetchImpl
  });
  assert.ok(urls.includes('/repos/herehigher/resume/actions/runs/50000000030/attempts/2/jobs'));
});
