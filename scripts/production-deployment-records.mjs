export const PRODUCTION_RECORD_REPOSITORY = 'herehigher/resume';
export const PRODUCTION_RECORD_BOT = 'github-actions[bot]';
export const PRODUCTION_RECORD_TASK = 'production-record';
export const BASELINE_ACCEPTANCE_RUN_ID = '36651727138';

export const HISTORICAL_ACCEPTED_RELEASES = Object.freeze([
  Object.freeze({
    tag: 'v0.4.1',
    sourceSha: '33c3ab39c7a08346615bc1b4fd0f413d074aad98',
    tagObjectSha: '477d66db5edb758e78f039d4b93152865aaa4a2c',
    releaseRunId: '35951587964',
    artifactId: '10788856459',
    artifactArchiveDigest: 'sha256:b5b450a685cb3272764cf1b208bdcf1f4a35c0fd4eb222aea6b2c21930c65517',
    artifactDigest: 'ca0c1b0293b9e28c03dfbf588eb00a7f81e7644b54fd12395c07869db78008c8',
    deploymentId: '6968466e-88e8-4156-94e7-39d81a45add8',
    deploymentUrl: 'https://6968466e.herehigher-rs.pages.dev/',
    // The exact creation timestamp is intentionally not stored; the baseline workflow reads it from the API.
  }),
  Object.freeze({
    tag: 'v0.4.2',
    sourceSha: 'bb2a6bde50b9c9634531f73164a915ec6f5cd9bd',
    tagObjectSha: 'fd58b1992900e67b82fdc6feed79b944e8522c3a',
    releaseRunId: '35979958986',
    artifactId: '10799566904',
    artifactArchiveDigest: 'sha256:69228ee195d1e3316bc015298a0f1a8485bf1b21281eafea93ae4a32d25d6d2c',
    artifactDigest: '74890035a61cb5c48b59d682dc9dac4146af02db04775f74d96ee2fe4611f57a',
    deploymentId: '571384f3-3869-46d3-9af3-80c364bc1ef2',
    deploymentUrl: 'https://571384f3.herehigher-rs.pages.dev/',
    // The exact creation timestamp is intentionally not stored; the baseline workflow reads it from the API.
  })
]);

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA_PATTERN = /^[0-9a-f]{40}$/;
const DIGEST_PATTERN = /^[0-9a-f]{64}$/;
const TAG_PATTERN = /^v\d+\.\d+\.\d+$/;
const RUN_ID_PATTERN = /^[1-9]\d*$/;
const EVENT_PATTERN = /^(?:(?:release|rollback)_(?:started|accepted|completed|unverified|failed_before_deploy|failed_before_switch|rejected_before_switch)|production_(?:verification_started|verified|verification_unverified))$/;

function fail(message) {
  throw new Error(`Production deployment record: ${message}`);
}

function isPagesDevRoot(value, projectName = 'herehigher-rs') {
  if (typeof value !== 'string' || value !== value.trim()) return false;
  let url;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return url.protocol === 'https:' && !url.username && !url.password && !url.port && url.pathname === '/'
    && !url.search && !url.hash && url.hostname.endsWith(`.${projectName}.pages.dev`)
    && url.hostname !== `${projectName}.pages.dev` && `${url.origin}/` === value;
}

export function validateProductionRecord(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) fail('record must be an object');
  if (record.schemaVersion !== 1 || !Number.isSafeInteger(record.sequence) || record.sequence < 1) {
    fail('record schema or sequence is invalid');
  }
  if (!EVENT_PATTERN.test(record.event || '')) fail('record event is invalid');
  if (!['release.yml', 'rollback-production.yml', 'accept-production-baseline.yml', 'reconcile-production.yml'].includes(record.workflow)) {
    fail('record workflow is invalid');
  }
  if (!RUN_ID_PATTERN.test(record.runId || '') || !Number.isSafeInteger(record.runAttempt) || record.runAttempt < 1) {
    fail('record run identity is invalid');
  }
  if (!RUN_ID_PATTERN.test(record.recordedByRunId || '') || !Number.isSafeInteger(record.recordedByRunAttempt)
    || record.recordedByRunAttempt < 1 || !['release.yml', 'rollback-production.yml', 'accept-production-baseline.yml', 'reconcile-production.yml'].includes(record.recordedByWorkflow)) {
    fail('record authorizing workflow identity is invalid');
  }
  if (!TAG_PATTERN.test(record.tag || '') || !SHA_PATTERN.test(record.sourceSha || '')
    || !DIGEST_PATTERN.test(record.artifactDigest || '')
    || (record.deploymentId !== null && !UUID_PATTERN.test(record.deploymentId || ''))
    || (record.deploymentUrl !== null && !isPagesDevRoot(record.deploymentUrl))) {
    fail('recorded release identity is invalid');
  }
  if (record.deploymentId === null !== (record.deploymentUrl === null)) fail('record deployment ID and URL must be present together');
  if (record.fromDeploymentId !== null && !UUID_PATTERN.test(record.fromDeploymentId || '')) {
    fail('record source deployment identity is invalid');
  }
  if (record.currentDeploymentId !== null && !UUID_PATTERN.test(record.currentDeploymentId || '')) {
    fail('record current deployment identity is invalid');
  }
  if (record.currentDeploymentUrl !== null && !isPagesDevRoot(record.currentDeploymentUrl)) {
    fail('record current deployment URL is invalid');
  }
  if (record.currentDeploymentId === null !== (record.currentDeploymentUrl === null)) {
    fail('record current deployment ID and URL must be present together');
  }
  if (record.artifactArchiveDigest !== undefined
    && !/^sha256:[0-9a-f]{64}$/.test(record.artifactArchiveDigest)) {
    fail('record artifact archive digest is invalid');
  }
  if (record.runUrl !== `https://github.com/${PRODUCTION_RECORD_REPOSITORY}/actions/runs/${record.runId}`) {
    fail('record workflow run URL is invalid');
  }
  return Object.freeze({
    ...record,
    deploymentId: record.deploymentId?.toLowerCase() ?? null,
    fromDeploymentId: record.fromDeploymentId?.toLowerCase() ?? null,
    currentDeploymentId: record.currentDeploymentId?.toLowerCase() ?? null
  });
}

export function acceptedBaselineRecords() {
  return Object.freeze(HISTORICAL_ACCEPTED_RELEASES.map((release, index) => validateProductionRecord({
    schemaVersion: 1,
    sequence: index + 1,
    event: 'release_accepted',
    workflow: 'release.yml',
    runId: release.releaseRunId,
    runAttempt: 1,
    recordedByRunId: BASELINE_ACCEPTANCE_RUN_ID,
    recordedByRunAttempt: 1,
    recordedByWorkflow: 'accept-production-baseline.yml',
    tag: release.tag,
    sourceSha: release.sourceSha,
    artifactDigest: release.artifactDigest,
    artifactArchiveDigest: release.artifactArchiveDigest,
    deploymentId: release.deploymentId,
    deploymentUrl: release.deploymentUrl,
    fromDeploymentId: null,
    currentDeploymentId: release.deploymentId,
    currentDeploymentUrl: release.deploymentUrl,
    runUrl: `https://github.com/${PRODUCTION_RECORD_REPOSITORY}/actions/runs/${release.releaseRunId}`
  })));
}

export function parseProductionRecordDeployment(deployment) {
  if (deployment?.task !== PRODUCTION_RECORD_TASK) return null;
  if (deployment.environment !== 'production' || deployment.creator?.login !== PRODUCTION_RECORD_BOT
    || !Number.isSafeInteger(deployment.id) || deployment.id < 1
    || !Number.isFinite(Date.parse(deployment.created_at))) {
    fail('production record deployment provenance is invalid');
  }
  let payload = deployment.payload;
  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload);
    } catch {
      fail('production record deployment payload is invalid JSON');
    }
  }
  const record = validateProductionRecord(payload);
  if (deployment.sha !== record.sourceSha || deployment.ref !== record.sourceSha) {
    fail('production record deployment source does not match its payload');
  }
  return record;
}

function sameReleaseIdentity(record, expected) {
  return record.tag === expected.tag && record.sourceSha === expected.sourceSha
    && record.artifactDigest === expected.artifactDigest && record.deploymentId === expected.deploymentId
    && record.deploymentUrl === expected.deploymentUrl;
}

function validateHistoricalBaseline(records, historical = HISTORICAL_ACCEPTED_RELEASES) {
  if (records.length < historical.length) fail('accepted production baseline records are incomplete');
  for (const [index, expected] of historical.entries()) {
    const record = records[index];
    if (record.sequence !== index + 1 || record.event !== 'release_accepted' || record.workflow !== 'release.yml'
      || record.runId !== expected.releaseRunId || record.tag !== expected.tag || record.sourceSha !== expected.sourceSha
      || record.artifactDigest !== expected.artifactDigest || record.artifactArchiveDigest !== expected.artifactArchiveDigest
      || record.deploymentId !== expected.deploymentId || record.deploymentUrl !== expected.deploymentUrl
      || record.recordedByWorkflow !== 'accept-production-baseline.yml') {
      fail(`historical accepted release ${expected.tag} does not match the fixed baseline`);
    }
  }
}

export function resolveProductionRecordLedger(inputRecords, { historical = HISTORICAL_ACCEPTED_RELEASES, allowPending = false } = {}) {
  const records = inputRecords.map(validateProductionRecord).sort((left, right) => left.sequence - right.sequence);
  for (let index = 0; index < records.length; index += 1) {
    if (records[index].sequence !== index + 1) fail('record sequence has a gap or duplicate');
  }
  validateHistoricalBaseline(records, historical);

  const accepted = [];
  let active = null;
  let pending = null;
  let latestRollbackRunId = null;

  for (const record of records) {
    if (record.sequence <= historical.length) {
      const expected = historical[record.sequence - 1];
      if (!sameReleaseIdentity(record, expected) || record.currentDeploymentId !== expected.deploymentId
        || record.currentDeploymentUrl !== expected.deploymentUrl) {
        fail('historical accepted release identity is incomplete');
      }
      active = { tag: expected.tag, sourceSha: expected.sourceSha, deploymentId: expected.deploymentId,
        deploymentUrl: expected.deploymentUrl, artifactDigest: expected.artifactDigest, status: 'accepted' };
      accepted.push(active);
      continue;
    }

    if (record.event.endsWith('_started')) {
      if (pending) fail('an earlier production operation has no terminal record');
      if (!active || record.fromDeploymentId !== active.deploymentId
        || record.currentDeploymentId !== active.deploymentId
        || record.currentDeploymentUrl !== active.deploymentUrl) {
        fail('operation source is not the recorded current deployment');
      }
      if (record.event === 'production_verification_started') {
        if (record.workflow !== 'reconcile-production.yml' || record.recordedByWorkflow !== 'reconcile-production.yml'
          || active.status !== 'unverified' || record.deploymentId !== active.deploymentId
          || record.deploymentUrl !== active.deploymentUrl) {
          fail('production verification intent does not match an unverified current deployment');
        }
        pending = { operation: 'verification', record };
      } else if (record.event === 'release_started') {
        if (record.workflow !== 'release.yml' || record.recordedByWorkflow !== 'release.yml') fail('release operation workflow identity is invalid');
        if (latestRollbackRunId && BigInt(record.runId) <= BigInt(latestRollbackRunId)) {
          fail('release run started before or during a later rollback and cannot overwrite it');
        }
        pending = { operation: 'release', record };
      } else if (record.event === 'rollback_started') {
        if (record.workflow !== 'rollback-production.yml' || record.recordedByWorkflow !== 'rollback-production.yml') fail('rollback operation workflow identity is invalid');
        const target = accepted.find((item) => item.tag === record.tag && item.sourceSha === record.sourceSha
          && item.deploymentId === record.deploymentId && item.deploymentUrl === record.deploymentUrl);
        if (!target || target.deploymentId === active.deploymentId) fail('rollback target is not a previously accepted production deployment');
        pending = { operation: 'rollback', record, target };
      } else {
        fail('operation start event is invalid');
      }
      continue;
    }

    const terminalOperation = record.event.startsWith('production_') ? 'verification' : record.event.split('_')[0];
    if (!pending || pending.operation !== terminalOperation
      || pending.record.runId !== record.runId || pending.record.runAttempt !== record.runAttempt
      || pending.record.tag !== record.tag || pending.record.sourceSha !== record.sourceSha
      || (pending.record.deploymentId !== null && pending.record.deploymentId !== record.deploymentId)
      || pending.record.fromDeploymentId !== record.fromDeploymentId) {
      fail('terminal record does not match its operation start');
    }

    if (record.event === 'production_verified') {
      if (record.workflow !== 'reconcile-production.yml' || record.currentDeploymentId !== record.deploymentId
        || record.currentDeploymentUrl !== record.deploymentUrl) {
        fail('production verification did not confirm the same current deployment identity');
      }
      let verified = accepted.find((item) => item.tag === record.tag && item.sourceSha === record.sourceSha
        && item.artifactDigest === record.artifactDigest && item.deploymentId === record.deploymentId
        && item.deploymentUrl === record.deploymentUrl);
      if (!verified) {
        verified = { tag: record.tag, sourceSha: record.sourceSha, deploymentId: record.deploymentId,
          deploymentUrl: record.deploymentUrl, artifactDigest: record.artifactDigest, status: 'accepted' };
        accepted.push(verified);
      }
      active = { ...verified, status: 'accepted' };
    } else if (record.event === 'production_verification_unverified') {
      if (record.workflow !== 'reconcile-production.yml' || record.currentDeploymentId !== active.deploymentId
        || record.currentDeploymentUrl !== active.deploymentUrl) {
        fail('unverified production check does not preserve the current deployment identity');
      }
      active = { ...active, status: 'unverified' };
    } else if (record.event === 'release_accepted') {
      if (record.workflow !== 'release.yml' || record.currentDeploymentId !== record.deploymentId
        || record.currentDeploymentUrl !== record.deploymentUrl
        || record.tag === active.tag || accepted.some((item) => item.tag === record.tag)) {
        fail('accepted release transition is invalid');
      }
      active = { tag: record.tag, sourceSha: record.sourceSha, deploymentId: record.deploymentId,
        deploymentUrl: record.deploymentUrl, artifactDigest: record.artifactDigest, status: 'accepted' };
      accepted.push(active);
    } else if (record.event === 'release_failed_before_deploy') {
      if (record.workflow !== 'release.yml' || record.currentDeploymentId !== active.deploymentId
        || record.currentDeploymentUrl !== active.deploymentUrl) {
        fail('failed release record does not preserve the previous production deployment');
      }
    } else if (record.event === 'release_unverified') {
      if (record.workflow !== 'release.yml' || !record.currentDeploymentId || !record.currentDeploymentUrl) {
        fail('unverified release record does not identify the switched production deployment');
      }
      active = { tag: record.tag, sourceSha: record.sourceSha, deploymentId: record.currentDeploymentId,
        deploymentUrl: record.currentDeploymentUrl, acceptedDeploymentId: record.deploymentId,
        artifactDigest: record.artifactDigest, status: 'unverified' };
    } else if (record.event === 'rollback_completed') {
      if (record.workflow !== 'rollback-production.yml' || record.currentDeploymentId !== record.deploymentId
        || record.currentDeploymentUrl !== record.deploymentUrl) {
        fail('rollback completion does not match the accepted target deployment ID and URL');
      }
      active = { ...pending.target, deploymentId: record.currentDeploymentId,
        deploymentUrl: record.currentDeploymentUrl, acceptedDeploymentId: pending.target.deploymentId,
        status: 'rollback_completed' };
      latestRollbackRunId = record.runId;
    } else if (record.event === 'rollback_unverified') {
      if (record.workflow !== 'rollback-production.yml' || !record.currentDeploymentId || !record.currentDeploymentUrl) {
        fail('unverified rollback record does not identify the switched production deployment');
      }
      active = { ...pending.target, deploymentId: record.currentDeploymentId,
        deploymentUrl: record.currentDeploymentUrl, acceptedDeploymentId: pending.target.deploymentId,
        status: 'unverified' };
      latestRollbackRunId = record.runId;
    } else if (record.event === 'rollback_failed_before_switch' || record.event === 'rollback_rejected_before_switch') {
      if (record.workflow !== 'rollback-production.yml' || record.currentDeploymentId !== active.deploymentId
        || record.currentDeploymentUrl !== active.deploymentUrl) {
        fail('failed rollback record does not preserve the previous production deployment');
      }
    } else {
      fail('terminal operation event is invalid');
    }
    pending = null;
  }

  if (pending && !allowPending) fail('last production operation is unresolved');
  if (!active) fail('accepted production state is unavailable');
  return Object.freeze({ active: Object.freeze(active), accepted: Object.freeze(accepted), latestRollbackRunId,
    pending: pending ? Object.freeze(pending) : null, records: Object.freeze(records) });
}

async function githubRequest(path, { token, fetchImpl, method = 'GET', body } = {}) {
  if (typeof token !== 'string' || token.trim() === '') fail('GitHub token is unavailable');
  const response = await fetchImpl(`https://api.github.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json'
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  if (!response.ok) fail(`GitHub record request failed (HTTP ${response.status})`);
  return response.json();
}

export async function requestGitHub(path, options = {}) {
  return githubRequest(path, options);
}

export async function readProductionLedger({ token, fetchImpl = fetch } = {}) {
  const records = await readProductionRecordHistory({ token, fetchImpl });
  return resolveProductionRecordLedger(records);
}

export async function readProductionRecordHistory({ token, fetchImpl = fetch } = {}) {
  const records = [...acceptedBaselineRecords()];
  for (let page = 1; page <= 100; page += 1) {
    const batch = await githubRequest(
      `/repos/${PRODUCTION_RECORD_REPOSITORY}/deployments?environment=production&per_page=100&page=${page}`,
      { token, fetchImpl }
    );
    if (!Array.isArray(batch)) fail('GitHub deployment response is invalid');
    records.push(...batch.map(parseProductionRecordDeployment).filter(Boolean));
    if (batch.length < 100) break;
    if (page === 100) fail('GitHub deployment history exceeds the supported limit');
  }
  return Object.freeze(records.sort((left, right) => left.sequence - right.sequence));
}

export async function getWorkflowRun({ runId, attempt, token, fetchImpl = fetch } = {}) {
  if (!RUN_ID_PATTERN.test(runId || '')) fail('workflow run ID is invalid');
  const path = attempt === undefined
    ? `/repos/${PRODUCTION_RECORD_REPOSITORY}/actions/runs/${runId}`
    : `/repos/${PRODUCTION_RECORD_REPOSITORY}/actions/runs/${runId}/attempts/${attempt}`;
  const run = await githubRequest(path, { token, fetchImpl });
  if (run.repository?.full_name !== PRODUCTION_RECORD_REPOSITORY || run.run_attempt < 1
    || !Number.isSafeInteger(run.run_attempt)) fail('workflow run identity is invalid');
  return run;
}

export async function verifyRecordRunAuthenticity(records, { token, fetchImpl = fetch } = {}) {
  const runs = new Map();
  for (const record of records) {
    for (const [id, attempt, workflow, expectedSha] of [
      [record.runId, record.runAttempt, record.workflow, record.workflow === 'release.yml' ? record.sourceSha : null],
      [record.recordedByRunId, record.recordedByRunAttempt, record.recordedByWorkflow, null]
    ]) {
      const key = `${id}:${attempt}:${workflow}`;
      if (runs.has(key)) continue;
      const run = await getWorkflowRun({ runId: id, attempt, token, fetchImpl });
      const path = typeof run.path === 'string' ? run.path.split('@')[0] : '';
      if (String(run.run_attempt) !== String(attempt) || path !== `.github/workflows/${workflow}`
        || run.head_branch !== 'main' || (expectedSha && run.head_sha !== expectedSha)
        || (id === BASELINE_ACCEPTANCE_RUN_ID && run.conclusion !== 'success')) {
        fail('record run does not match its workflow identity');
      }
      runs.set(key, run);
    }
  }
  return true;
}

export async function appendProductionRecordDeployment({ record, token, fetchImpl = fetch } = {}) {
  const valid = validateProductionRecord(record);
  const history = await readProductionRecordHistory({ token, fetchImpl });
  resolveProductionRecordLedger(history, { allowPending: true });
  if (valid.sequence <= history.length) {
    const existing = history[valid.sequence - 1];
    if (JSON.stringify(existing) === JSON.stringify(valid)) return Object.freeze({ alreadyPresent: true, record: existing });
    fail('record sequence is already occupied by a different deployment');
  }
  if (valid.sequence !== history.length + 1) fail('record sequence is not the next available sequence');
  const deployment = await githubRequest(`/repos/${PRODUCTION_RECORD_REPOSITORY}/deployments`, {
    token, fetchImpl, method: 'POST', body: {
      ref: valid.sourceSha,
      task: PRODUCTION_RECORD_TASK,
      environment: 'production',
      description: `Production record ${valid.sequence}: ${valid.event} ${valid.tag}`,
      payload: valid,
      auto_merge: false,
      required_contexts: [],
      production_environment: true
    }
  });
  const created = parseProductionRecordDeployment(deployment);
  if (JSON.stringify(created) !== JSON.stringify(valid)) {
    fail('created record deployment could not be verified');
  }
  return deployment;
}

export async function listProductionWorkflowRuns({ workflowFile, minRunId, token, fetchImpl = fetch } = {}) {
  if (!['release.yml', 'rollback-production.yml', 'accept-production-baseline.yml', 'reconcile-production.yml'].includes(workflowFile)) {
    fail('workflow file is invalid');
  }
  const minId = BigInt(minRunId);
  const runs = [];
  for (let page = 1; page <= 100; page += 1) {
    const response = await githubRequest(
      `/repos/${PRODUCTION_RECORD_REPOSITORY}/actions/workflows/${workflowFile}/runs?per_page=100&page=${page}`,
      { token, fetchImpl }
    );
    if (!Array.isArray(response.workflow_runs)) fail('GitHub workflow run response is invalid');
    const older = response.workflow_runs.some((run) => BigInt(run.id) < minId);
    runs.push(...response.workflow_runs.filter((run) => BigInt(run.id) >= minId));
    if (response.workflow_runs.length < 100 || older) break;
    if (page === 100) fail('GitHub workflow run history exceeds the supported limit');
  }
  return Object.freeze(runs);
}

export async function listWorkflowRunJobs({ runId, attempt, token, fetchImpl = fetch } = {}) {
  if (!RUN_ID_PATTERN.test(runId || '')) fail('workflow run ID is invalid');
  if (attempt !== undefined && (!Number.isSafeInteger(attempt) || attempt < 1)) fail('workflow run attempt is invalid');
  const endpoint = attempt === undefined
    ? `/repos/${PRODUCTION_RECORD_REPOSITORY}/actions/runs/${runId}/jobs?per_page=100`
    : `/repos/${PRODUCTION_RECORD_REPOSITORY}/actions/runs/${runId}/attempts/${attempt}/jobs?per_page=100`;
  const response = await githubRequest(
    endpoint,
    { token, fetchImpl }
  );
  if (!Array.isArray(response.jobs)) fail('GitHub workflow job response is invalid');
  return Object.freeze(response.jobs);
}

export async function verifyWorkflowRunCoverage({ records, token, minRunId, currentRunId, currentRunAttempt, fetchImpl = fetch } = {}) {
  const recordedRunKeys = new Set(records.map((record) => `${record.workflow}:${record.runId}:${record.runAttempt}`));
  for (const workflowFile of ['release.yml', 'rollback-production.yml']) {
    const runs = await listProductionWorkflowRuns({ workflowFile, minRunId, token, fetchImpl });
    for (const run of runs) {
      if (!RUN_ID_PATTERN.test(String(run.id)) || !Number.isSafeInteger(run.run_attempt) || run.run_attempt < 1) {
        fail('GitHub workflow run history contains an invalid run identity');
      }
      if (workflowFile === 'rollback-production.yml' && run.actor?.login !== 'herehigher') continue;
      for (let attempt = 1; attempt <= run.run_attempt; attempt += 1) {
        if (String(run.id) === String(currentRunId) && attempt === currentRunAttempt) continue;
        const runKey = `${workflowFile}:${run.id}:${attempt}`;
        const isRecorded = recordedRunKeys.has(runKey);
        const jobs = await listWorkflowRunJobs({ runId: String(run.id), attempt, token, fetchImpl });
        const publishJob = jobs.find((job) => job.name === 'publish');
        const intentSucceeded = workflowFile === 'release.yml'
          ? publishJob?.steps?.some((step) => step.name === 'Verify durable production state and persist release intent'
            && step.conclusion === 'success')
          : jobs.some((job) => job.steps?.some((step) => step.name === 'Validate accepted target and persist rollback intent'
            && step.conclusion === 'success'));
        const productionUploadSucceeded = workflowFile === 'release.yml'
          && publishJob?.steps?.some((step) => step.name === 'Deploy the verified artifact to the Cloudflare production environment'
            && step.conclusion === 'success');
        if ((intentSucceeded || productionUploadSucceeded) && !isRecorded) {
          fail(`${workflowFile} run ${run.id} attempt ${attempt} has no intact production record`);
        }
      }
    }
  }
  return true;
}
