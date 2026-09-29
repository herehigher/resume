import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import {
  HISTORICAL_ACCEPTED_RELEASES,
  appendProductionRecordComment,
  readProductionRecordHistory,
  resolveProductionRecordLedger,
  verifyRecordRunAuthenticity,
  verifyWorkflowRunCoverage
} from './production-deployment-records.mjs';
import { validateOwnerProductionDispatch } from './production-dispatch-auth.mjs';
import {
  createCloudflarePagesClient,
  validateAcceptedDeployment,
  validateCurrentProductionDeployment
} from './cloudflare-pages-api.mjs';

const REPOSITORY = 'herehigher/resume';
const PROJECT_NAME = 'herehigher-rs';
const PRODUCTION_BRANCH = 'main';

function fail(message) {
  throw new Error(`Production state: ${message}`);
}

function required(name) {
  const value = process.env[name];
  if (typeof value !== 'string' || value.trim() === '') fail(`${name} is unavailable`);
  return value;
}

function workflowContext(workflow) {
  const runId = required('GITHUB_RUN_ID');
  const runAttempt = Number(required('GITHUB_RUN_ATTEMPT'));
  if (!/^\d+$/.test(runId) || !Number.isSafeInteger(runAttempt) || runAttempt < 1) fail('GitHub run identity is invalid');
  return {
    workflow,
    runId,
    runAttempt,
    recordedByWorkflow: workflow,
    recordedByRunId: runId,
    recordedByRunAttempt: runAttempt,
    runUrl: `https://github.com/${REPOSITORY}/actions/runs/${runId}`
  };
}

function cloudflareClient() {
  return createCloudflarePagesClient({
    accountId: required('CLOUDFLARE_ACCOUNT_ID'),
    projectName: process.env.CLOUDFLARE_PAGES_PROJECT || PROJECT_NAME,
    apiToken: required('CLOUDFLARE_API_TOKEN')
  });
}

function githubToken() {
  return process.env.GH_TOKEN || process.env.GITHUB_TOKEN || fail('GitHub token is unavailable');
}

function assertOwnerDispatch() {
  try {
    validateOwnerProductionDispatch({
      repository: process.env.GITHUB_REPOSITORY,
      ref: process.env.GITHUB_REF,
      actor: process.env.GITHUB_ACTOR,
      triggeringActor: process.env.TRIGGERING_ACTOR
    });
  } catch {
    fail('production baseline and rollback require the repository owner as both actor and triggering actor on main');
  }
}

async function githubRequest(path) {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: {
      Authorization: `Bearer ${githubToken()}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    }
  });
  if (!response.ok) fail(`GitHub verification failed (HTTP ${response.status})`);
  return response.json();
}

function recordBase({ sequence, event, workflow, runId, runAttempt, tag, sourceSha, artifactDigest,
  artifactArchiveDigest, deploymentId, deploymentUrl, fromDeploymentId, currentDeploymentId,
  currentDeploymentUrl, recordedByRunId, recordedByRunAttempt, recordedByWorkflow }) {
  return Object.freeze({
    schemaVersion: 1,
    sequence,
    event,
    workflow,
    runId: String(runId),
    runAttempt,
    recordedByRunId: String(recordedByRunId),
    recordedByRunAttempt,
    recordedByWorkflow,
    tag,
    sourceSha,
    artifactDigest,
    ...(artifactArchiveDigest ? { artifactArchiveDigest } : {}),
    deploymentId,
    deploymentUrl,
    fromDeploymentId,
    currentDeploymentId,
    currentDeploymentUrl,
    runUrl: `https://github.com/${REPOSITORY}/actions/runs/${runId}`
  });
}

function versionForTag(tag) {
  if (!/^v\d+\.\d+\.\d+$/.test(tag)) fail('release tag is invalid');
  return tag.slice(1);
}

function deploymentUrl(deployment) {
  let parsed;
  try {
    parsed = new URL(deployment?.url);
  } catch {
    fail('Cloudflare deployment URL is invalid');
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port
    || parsed.pathname !== '/' || parsed.search || parsed.hash
    || parsed.hostname === `${PROJECT_NAME}.pages.dev` || !parsed.hostname.endsWith(`.${PROJECT_NAME}.pages.dev`)) {
    fail('Cloudflare deployment URL is not a deployment-specific Pages.dev root');
  }
  return `${parsed.origin}/`;
}

async function deploymentIdentity(client, deploymentId, expected) {
  const detail = await client.getDeployment(deploymentId);
  const url = deploymentUrl(detail);
  const valid = validateAcceptedDeployment(detail, {
    deploymentId,
    projectName: process.env.CLOUDFLARE_PAGES_PROJECT || PROJECT_NAME,
    productionBranch: PRODUCTION_BRANCH,
    commitSha: expected.sourceSha,
    deploymentUrl: expected.deploymentUrl || url
  });
  if (expected.tag && detail.package_version && detail.package_version !== versionForTag(expected.tag)) {
    fail(`Cloudflare deployment version does not match ${expected.tag}`);
  }
  return Object.freeze({ ...valid, url });
}

async function currentIdentity(client, active) {
  const project = await client.getProject();
  validateCurrentProductionDeployment(project, active.deploymentId);
  const current = await deploymentIdentity(client, active.deploymentId, active);
  if (current.url !== active.deploymentUrl) fail('Cloudflare current URL does not match the production record');
  return Object.freeze({ project, current });
}

async function historyAndLedger({ allowPending = false } = {}) {
  const records = await readProductionRecordHistory({ token: githubToken() });
  const ledger = records.length
    ? resolveProductionRecordLedger(records, { allowPending })
    : null;
  return { records, ledger };
}

async function verifyLedgerTrust(records) {
  await verifyRecordRunAuthenticity(records, { token: githubToken() });
  await verifyWorkflowRunCoverage({
    records,
    token: githubToken(),
    minRunId: HISTORICAL_ACCEPTED_RELEASES[0].releaseRunId,
    currentRunId: required('GITHUB_RUN_ID'),
    currentRunAttempt: Number(required('GITHUB_RUN_ATTEMPT'))
  });
}

async function acceptBaseline() {
  assertOwnerDispatch();
  const records = await readProductionRecordHistory({ token: githubToken() });
  if (records.length > HISTORICAL_ACCEPTED_RELEASES.length) {
    fail('baseline record history is partial or contains later production records');
  }
  const context = workflowContext('accept-production-baseline.yml');
  const client = cloudflareClient();
  const identities = [];

  for (const [index, expected] of HISTORICAL_ACCEPTED_RELEASES.entries()) {
    const run = await githubRequest(`/repos/${REPOSITORY}/actions/runs/${expected.releaseRunId}`);
    if (run.path?.split('@')[0] !== '.github/workflows/release.yml' || run.status !== 'completed'
      || run.conclusion !== 'success' || run.head_sha !== expected.sourceSha || run.event !== 'workflow_dispatch'
      || !Number.isSafeInteger(run.run_attempt) || run.run_attempt < 1) {
      fail(`historical Release run for ${expected.tag} does not match its fixed identity`);
    }
    const artifact = await githubRequest(`/repos/${REPOSITORY}/actions/artifacts/${expected.artifactId}`);
    if (String(artifact.id) !== expected.artifactId || String(artifact.workflow_run?.id) !== expected.releaseRunId
      || artifact.expired === true || artifact.digest !== expected.artifactArchiveDigest) {
      fail(`historical GitHub artifact for ${expected.tag} does not match its fixed identity`);
    }
    const tagObject = execFileSync('git', ['rev-parse', `refs/tags/${expected.tag}`], { encoding: 'utf8' }).trim();
    const tagCommit = execFileSync('git', ['rev-parse', `${expected.tag}^{commit}`], { encoding: 'utf8' }).trim();
    if (tagObject !== expected.tagObjectSha || tagCommit !== expected.sourceSha) fail(`annotated tag ${expected.tag} is invalid`);
    const evidencePath = required(index === 0 ? 'BASELINE_V041_EVIDENCE' : 'BASELINE_V042_EVIDENCE');
    const evidence = JSON.parse(await readFile(evidencePath, 'utf8'));
    if (evidence.packageVersion !== versionForTag(expected.tag) || evidence.sourceSha !== expected.sourceSha
      || evidence.artifactDigest !== expected.artifactDigest || evidence.sourceDigest !== expected.artifactDigest) {
      fail(`site artifact evidence for ${expected.tag} does not match its fixed identity`);
    }
    identities.push({ expected, runAttempt: run.run_attempt });
  }

  const actual = [];
  for (const { expected } of identities) actual.push(await deploymentIdentity(client, expected.deploymentId, expected));
  if (Date.parse(actual[0].createdOn) >= Date.parse(actual[1].createdOn)) fail('v0.4.1 deployment is not older than v0.4.2');
  const project = await client.getProject();
  validateCurrentProductionDeployment(project, HISTORICAL_ACCEPTED_RELEASES[1].deploymentId);
  for (const [index, record] of records.entries()) {
    const expected = HISTORICAL_ACCEPTED_RELEASES[index];
    const { runAttempt } = identities[index];
    if (!expected || record.sequence !== index + 1 || record.event !== 'release_accepted'
      || record.workflow !== 'release.yml' || record.recordedByWorkflow !== 'accept-production-baseline.yml'
      || record.runId !== expected.releaseRunId || record.runAttempt !== runAttempt
      || record.tag !== expected.tag || record.sourceSha !== expected.sourceSha
      || record.artifactDigest !== expected.artifactDigest || record.artifactArchiveDigest !== expected.artifactArchiveDigest
      || record.deploymentId !== expected.deploymentId || record.deploymentUrl !== expected.deploymentUrl
      || record.currentDeploymentId !== expected.deploymentId || record.currentDeploymentUrl !== expected.deploymentUrl) {
      fail('existing baseline record prefix does not match the fixed production identities');
    }
  }
  if (records.length === HISTORICAL_ACCEPTED_RELEASES.length) {
    const ledger = resolveProductionRecordLedger(records);
    if (ledger.active.deploymentId !== HISTORICAL_ACCEPTED_RELEASES[1].deploymentId) fail('existing baseline ledger is not current at v0.4.2');
    return;
  }

  for (const [index, { expected, runAttempt }] of identities.entries()) {
    if (index < records.length) continue;
    const record = recordBase({
      sequence: index + 1,
      event: 'release_accepted',
      workflow: 'release.yml',
      runId: expected.releaseRunId,
      runAttempt,
      tag: expected.tag,
      sourceSha: expected.sourceSha,
      artifactDigest: expected.artifactDigest,
      artifactArchiveDigest: expected.artifactArchiveDigest,
      deploymentId: expected.deploymentId,
      deploymentUrl: expected.deploymentUrl,
      fromDeploymentId: null,
      currentDeploymentId: expected.deploymentId,
      currentDeploymentUrl: expected.deploymentUrl,
      recordedByRunId: context.runId,
      recordedByRunAttempt: context.runAttempt,
      recordedByWorkflow: context.workflow
    });
    await appendProductionRecordComment({ record, token: githubToken() });
  }
}

async function startRelease() {
  const workflow = 'release.yml';
  const context = workflowContext(workflow);
  const { records, ledger } = await historyAndLedger();
  if (!ledger || ledger.active.status === 'unverified') fail('production ledger is unavailable or unverified');
  await verifyLedgerTrust(records);
  const client = cloudflareClient();
  await currentIdentity(client, ledger.active);
  if (ledger.latestRollbackRunId && BigInt(context.runId) <= BigInt(ledger.latestRollbackRunId)) {
    fail('release run was queued before or during a later production rollback');
  }
  const tag = required('RELEASE_TAG');
  if (ledger.accepted.some((entry) => entry.tag === tag)) fail('this release tag was already accepted and cannot be replayed');
  const sourceSha = required('RELEASE_SHA');
  const artifactDigest = required('ARTIFACT_DIGEST');
  const sequence = records.length + 1;
  const record = recordBase({
    sequence,
    event: 'release_started',
    workflow,
    runId: context.runId,
    runAttempt: context.runAttempt,
    tag,
    sourceSha,
    artifactDigest,
    deploymentId: null,
    deploymentUrl: null,
    fromDeploymentId: ledger.active.deploymentId,
    currentDeploymentId: ledger.active.deploymentId,
    currentDeploymentUrl: ledger.active.deploymentUrl,
    recordedByRunId: context.runId,
    recordedByRunAttempt: context.runAttempt,
    recordedByWorkflow: workflow
  });
  await appendProductionRecordComment({ record, token: githubToken() });
}

async function finishRelease() {
  const workflow = 'release.yml';
  const context = workflowContext(workflow);
  const { records, ledger } = await historyAndLedger({ allowPending: true });
  const pending = ledger?.pending;
  if (pending?.operation !== 'release' || pending.record.runId !== context.runId
    || pending.record.runAttempt !== context.runAttempt) fail('this run has no matching release intent');
  const client = cloudflareClient();
  const project = await client.getProject();
  const currentId = project.latest_deployment?.id?.toLowerCase();
  if (!currentId || !/^[0-9a-f-]{36}$/.test(currentId)) fail('Cloudflare current deployment ID is unavailable');
  const detail = await client.getDeployment(currentId);
  const runMatches = process.env.RELEASE_PUBLICATION_SUCCESS === 'true';
  const sourceMatches = detail.deployment_trigger?.metadata?.commit_hash === pending.record.sourceSha
    && detail.deployment_trigger?.metadata?.branch === PRODUCTION_BRANCH
    && detail.environment === 'production' && detail.latest_stage?.status === 'success'
    && detail.is_skipped === false && detail.project_name === PROJECT_NAME;

  if (currentId === pending.record.fromDeploymentId) {
    if (deploymentUrl(detail) !== ledger.active.deploymentUrl
      || detail.deployment_trigger?.metadata?.commit_hash !== ledger.active.sourceSha) {
      fail('production no longer matches the pre-release deployment');
    }
    const record = recordBase({
      ...pending.record,
      sequence: records.length + 1,
      event: 'release_failed_before_deploy',
      workflow,
      runId: pending.record.runId,
      runAttempt: pending.record.runAttempt,
      tag: pending.record.tag,
      sourceSha: pending.record.sourceSha,
      artifactDigest: pending.record.artifactDigest,
      deploymentId: null,
      deploymentUrl: null,
      fromDeploymentId: pending.record.fromDeploymentId,
      currentDeploymentId: currentId,
      currentDeploymentUrl: ledger.active.deploymentUrl,
      recordedByRunId: context.runId,
      recordedByRunAttempt: context.runAttempt,
      recordedByWorkflow: workflow
    });
    await appendProductionRecordComment({ record, token: githubToken() });
    const { appendFile } = await import('node:fs/promises');
    await appendFile(required('GITHUB_OUTPUT'), `current_id=${currentId}\n`);
    return;
  }
  if (!sourceMatches) fail('Cloudflare changed production to an unrecognized deployment; intent remains unresolved');
  const url = deploymentUrl(detail);
  const identity = validateAcceptedDeployment(detail, {
    deploymentId: currentId,
    projectName: PROJECT_NAME,
    productionBranch: PRODUCTION_BRANCH,
    commitSha: pending.record.sourceSha,
    deploymentUrl: url
  });
  const success = runMatches && process.env.PRODUCTION_IDENTITY_OUTCOME === 'success'
    && process.env.PRODUCTION_SMOKE_OUTCOME === 'success';
  const record = recordBase({
    sequence: records.length + 1,
    event: success ? 'release_accepted' : 'release_unverified',
    workflow,
    runId: pending.record.runId,
    runAttempt: pending.record.runAttempt,
    tag: pending.record.tag,
    sourceSha: pending.record.sourceSha,
    artifactDigest: pending.record.artifactDigest,
    deploymentId: currentId,
    deploymentUrl: identity.url,
    fromDeploymentId: pending.record.fromDeploymentId,
    currentDeploymentId: currentId,
    currentDeploymentUrl: identity.url,
    recordedByRunId: context.runId,
    recordedByRunAttempt: context.runAttempt,
    recordedByWorkflow: workflow
  });
  await appendProductionRecordComment({ record, token: githubToken() });
  const { appendFile } = await import('node:fs/promises');
  await appendFile(required('GITHUB_OUTPUT'), `current_id=${currentId}\n`);
}

async function startRollback() {
  assertOwnerDispatch();
  const workflow = 'rollback-production.yml';
  const context = workflowContext(workflow);
  const { records, ledger } = await historyAndLedger();
  if (!ledger || ledger.active.status === 'unverified') fail('production ledger is unavailable or unverified');
  await verifyLedgerTrust(records);
  const targetTag = required('TARGET_TAG');
  const target = ledger.accepted.find((entry) => entry.tag === targetTag);
  if (!target || target.deploymentId === ledger.active.deploymentId) fail('target is not a different accepted production deployment');
  const client = cloudflareClient();
  await currentIdentity(client, ledger.active);
  const original = HISTORICAL_ACCEPTED_RELEASES.find((entry) => entry.tag === targetTag);
  const exact = original || target;
  await deploymentIdentity(client, exact.deploymentId, exact);
  const record = recordBase({
    sequence: records.length + 1,
    event: 'rollback_started',
    workflow,
    runId: context.runId,
    runAttempt: context.runAttempt,
    tag: target.tag,
    sourceSha: target.sourceSha,
    artifactDigest: target.artifactDigest,
    deploymentId: exact.deploymentId,
    deploymentUrl: exact.deploymentUrl,
    fromDeploymentId: ledger.active.deploymentId,
    currentDeploymentId: ledger.active.deploymentId,
    currentDeploymentUrl: ledger.active.deploymentUrl,
    recordedByRunId: context.runId,
    recordedByRunAttempt: context.runAttempt,
    recordedByWorkflow: workflow
  });
  await appendProductionRecordComment({ record, token: githubToken() });
  const output = required('GITHUB_OUTPUT');
  const lines = [
    `target_tag=${target.tag}`,
    `target_sha=${target.sourceSha}`,
    `target_digest=${target.artifactDigest}`,
    `target_url=${exact.deploymentUrl}`,
    `from_id=${ledger.active.deploymentId}`,
    `from_tag=${ledger.active.tag}`
  ];
  await import('node:fs/promises').then(({ appendFile }) => appendFile(output, `${lines.join('\n')}\n`));
}

async function executeRollback() {
  const history = await readProductionRecordHistory({ token: githubToken() });
  const ledger = resolveProductionRecordLedger(history, { allowPending: true });
  const pending = ledger.pending;
  if (pending?.operation !== 'rollback' || pending.record.runId !== required('GITHUB_RUN_ID')
    || pending.record.runAttempt !== Number(required('GITHUB_RUN_ATTEMPT'))) fail('this run has no matching rollback intent');
  const client = cloudflareClient();
  const rollbackResult = await client.rollback(pending.record.deploymentId);
  if (rollbackResult?.id !== pending.record.deploymentId) {
    fail('Cloudflare native rollback response did not confirm the accepted target deployment ID');
  }
  let match = null;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const project = await client.getProject();
    const currentId = project.latest_deployment?.id?.toLowerCase();
    if (currentId && currentId !== pending.record.fromDeploymentId) {
      const detail = await client.getDeployment(currentId);
      if (currentId === pending.record.deploymentId && detail.environment === 'production' && detail.latest_stage?.status === 'success'
        && detail.project_name === PROJECT_NAME && detail.deployment_trigger?.metadata?.branch === PRODUCTION_BRANCH
        && detail.deployment_trigger?.metadata?.commit_hash === pending.record.sourceSha) {
        const url = deploymentUrl(detail);
        const identity = validateAcceptedDeployment(detail, {
          deploymentId: currentId,
          projectName: PROJECT_NAME,
          productionBranch: PRODUCTION_BRANCH,
          commitSha: pending.record.sourceSha,
          deploymentUrl: url
        });
        match = { id: currentId, url: identity.url };
        break;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  if (!match) fail('Cloudflare did not expose the accepted rollback content as current production');
  const output = required('GITHUB_OUTPUT');
  const { appendFile } = await import('node:fs/promises');
  await appendFile(output, `current_id=${match.id}\ncurrent_url=${match.url}\n`);
}

async function finishRollback() {
  const workflow = 'rollback-production.yml';
  const context = workflowContext(workflow);
  const { records, ledger } = await historyAndLedger({ allowPending: true });
  const pending = ledger?.pending;
  if (pending?.operation !== 'rollback' || pending.record.runId !== context.runId
    || pending.record.runAttempt !== context.runAttempt) fail('this run has no matching rollback intent');
  const client = cloudflareClient();
  const project = await client.getProject();
  const currentId = project.latest_deployment?.id?.toLowerCase();
  if (!currentId || !/^[0-9a-f-]{36}$/.test(currentId)) fail('Cloudflare current deployment ID is unavailable');
  const detail = await client.getDeployment(currentId);
  const contentMatches = detail.environment === 'production' && detail.latest_stage?.status === 'success'
    && detail.project_name === PROJECT_NAME && detail.deployment_trigger?.metadata?.branch === PRODUCTION_BRANCH
    && detail.deployment_trigger?.metadata?.commit_hash === pending.record.sourceSha;
  if (!contentMatches && currentId === pending.record.fromDeploymentId) {
    const record = recordBase({
      sequence: records.length + 1,
      event: 'rollback_failed_before_switch',
      workflow,
      runId: context.runId,
      runAttempt: context.runAttempt,
      tag: pending.record.tag,
      sourceSha: pending.record.sourceSha,
      artifactDigest: pending.record.artifactDigest,
      deploymentId: pending.record.deploymentId,
      deploymentUrl: pending.record.deploymentUrl,
      fromDeploymentId: pending.record.fromDeploymentId,
      currentDeploymentId: currentId,
      currentDeploymentUrl: ledger.active.deploymentUrl,
      recordedByRunId: context.runId,
      recordedByRunAttempt: context.runAttempt,
      recordedByWorkflow: workflow
    });
    await appendProductionRecordComment({ record, token: githubToken() });
    return;
  }
  if (!contentMatches) fail('Cloudflare current production identity does not match the accepted rollback content; intent remains unresolved');
  const url = deploymentUrl(detail);
  const identity = validateAcceptedDeployment(detail, {
    deploymentId: currentId,
    projectName: PROJECT_NAME,
    productionBranch: PRODUCTION_BRANCH,
    commitSha: pending.record.sourceSha,
    deploymentUrl: url
  });
  const verified = process.env.ROLLBACK_SWITCH_OUTCOME === 'success'
    && currentId === pending.record.deploymentId
    && process.env.ROLLBACK_PAGES_APPLICATION_SMOKE === 'passed'
    && process.env.ROLLBACK_PAGES_EDITOR_SMOKE === 'passed'
    && process.env.ROLLBACK_CUSTOM_APPLICATION_SMOKE === 'passed'
    && process.env.ROLLBACK_CUSTOM_EDITOR_SMOKE === 'passed';
  const record = recordBase({
    sequence: records.length + 1,
    event: verified ? 'rollback_completed' : 'rollback_unverified',
    workflow,
    runId: context.runId,
    runAttempt: context.runAttempt,
    tag: pending.record.tag,
    sourceSha: pending.record.sourceSha,
    artifactDigest: pending.record.artifactDigest,
    deploymentId: pending.record.deploymentId,
    deploymentUrl: pending.record.deploymentUrl,
    fromDeploymentId: pending.record.fromDeploymentId,
    currentDeploymentId: currentId,
    currentDeploymentUrl: identity.url,
    recordedByRunId: context.runId,
    recordedByRunAttempt: context.runAttempt,
    recordedByWorkflow: workflow
  });
  await appendProductionRecordComment({ record, token: githubToken() });
  await import('node:fs/promises').then(({ appendFile }) => appendFile(required('GITHUB_STEP_SUMMARY'), [
    '',
    '## Cloudflare rollback record',
    '',
    `- From: ${ledger.active.tag} (\`${pending.record.fromDeploymentId}\`)`,
    `- To: ${pending.record.tag} (\`${pending.record.deploymentId}\`)`,
    `- Current production deployment: \`${currentId}\` ${identity.url}`,
    `- Verification: ${verified ? 'Pages.dev/custom domain application and editor smoke passed.' : '切替済み・確認未完了。Production remains blocked until verification is repaired.'}`,
    `- Run: https://github.com/${REPOSITORY}/actions/runs/${context.runId}`,
    ''
  ].join('\n')));
  if (!verified) process.exitCode = 1;
}

async function inspectRecovery() {
  assertOwnerDispatch();
  const { records, ledger } = await historyAndLedger({ allowPending: true });
  if (!ledger) fail('production ledger is unavailable');
  await verifyLedgerTrust(records);
  const client = cloudflareClient();
  const project = await client.getProject();
  const currentId = project.latest_deployment?.id?.toLowerCase();
  if (!currentId) fail('Cloudflare current deployment ID is unavailable');
  const detail = await client.getDeployment(currentId);
  let pending = ledger.pending?.record;
  let operation = ledger.pending?.operation;
  let resolution;
  let smokeUrl = '';
  if (!pending) {
    if (ledger.active.status !== 'unverified') fail('there is no unresolved or unverified production state to reconcile');
    if (ledger.active.acceptedDeploymentId && ledger.active.acceptedDeploymentId !== ledger.active.deploymentId) {
      fail('unverified rollback deployment ID differs from the accepted target; manual owner review is required');
    }
    const identity = await deploymentIdentity(client, currentId, ledger.active);
    const context = workflowContext('reconcile-production.yml');
    const intent = recordBase({
      sequence: records.length + 1,
      event: 'production_verification_started',
      workflow: 'reconcile-production.yml',
      runId: context.runId,
      runAttempt: context.runAttempt,
      tag: ledger.active.tag,
      sourceSha: ledger.active.sourceSha,
      artifactDigest: ledger.active.artifactDigest,
      deploymentId: currentId,
      deploymentUrl: identity.url,
      fromDeploymentId: currentId,
      currentDeploymentId: currentId,
      currentDeploymentUrl: identity.url,
      recordedByRunId: context.runId,
      recordedByRunAttempt: context.runAttempt,
      recordedByWorkflow: context.workflow
    });
    await appendProductionRecordComment({ record: intent, token: githubToken() });
    pending = intent;
    operation = 'verification';
    resolution = 'switched';
    smokeUrl = identity.url;
  }
  if (operation === 'verification') {
    if (ledger.active.status !== 'unverified' || currentId !== pending.deploymentId
      || ledger.active.deploymentId !== currentId
      || ledger.active.acceptedDeploymentId !== currentId) {
      fail('unverified deployment is not the accepted production identity');
    }
    const identity = validateAcceptedDeployment(detail, {
      deploymentId: currentId,
      projectName: PROJECT_NAME,
      productionBranch: PRODUCTION_BRANCH,
      commitSha: pending.sourceSha,
      deploymentUrl: pending.deploymentUrl
    });
    resolution = 'switched';
    smokeUrl = identity.url;
  } else if (operation === 'release') {
    if (currentId === pending.fromDeploymentId) {
      if (deploymentUrl(detail) !== ledger.active.deploymentUrl
        || detail.deployment_trigger?.metadata?.commit_hash !== ledger.active.sourceSha) {
        fail('current production changed while a release intent was pending');
      }
      resolution = 'before_switch';
    } else if (detail.environment === 'production' && detail.latest_stage?.status === 'success'
      && detail.project_name === PROJECT_NAME && detail.is_skipped === false
      && detail.deployment_trigger?.metadata?.branch === PRODUCTION_BRANCH
      && detail.deployment_trigger?.metadata?.commit_hash === pending.sourceSha) {
      smokeUrl = deploymentUrl(detail);
      resolution = 'switched';
    } else {
      fail('current deployment does not match the pending release intent');
    }
  } else if (operation === 'rollback') {
    if (currentId === pending.fromDeploymentId) {
      if (deploymentUrl(detail) !== ledger.active.deploymentUrl
        || detail.deployment_trigger?.metadata?.commit_hash !== ledger.active.sourceSha) {
        fail('current production changed while a rollback intent was pending');
      }
      resolution = 'before_switch';
    } else if (detail.environment === 'production' && detail.latest_stage?.status === 'success'
      && detail.project_name === PROJECT_NAME && detail.is_skipped === false
      && detail.deployment_trigger?.metadata?.branch === PRODUCTION_BRANCH
      && detail.deployment_trigger?.metadata?.commit_hash === pending.sourceSha) {
      smokeUrl = deploymentUrl(detail);
      resolution = 'switched';
    } else {
      fail('current deployment does not match the pending rollback target');
    }
  }
  const { appendFile } = await import('node:fs/promises');
  await appendFile(required('GITHUB_OUTPUT'), `${[
    `operation=${operation}`,
    `resolution=${resolution}`,
    `needs_smoke=${resolution === 'switched'}`,
    `current_id=${currentId}`,
    `current_url=${smokeUrl}`,
    `target_sha=${pending.sourceSha}`,
    `target_tag=${pending.tag}`
  ].join('\n')}\n`);
}

async function finishRecovery() {
  assertOwnerDispatch();
  const recorder = workflowContext('reconcile-production.yml');
  const { records, ledger } = await historyAndLedger({ allowPending: true });
  const pending = ledger?.pending;
  if (!pending) fail('there is no unresolved production intent to reconcile');
  const client = cloudflareClient();
  const project = await client.getProject();
  const currentId = project.latest_deployment?.id?.toLowerCase();
  if (!currentId) fail('Cloudflare current deployment ID is unavailable');
  const detail = await client.getDeployment(currentId);
  if (pending.operation === 'verification') {
    if (ledger.active.status !== 'unverified' || currentId !== pending.record.deploymentId
      || currentId !== ledger.active.deploymentId || currentId !== ledger.active.acceptedDeploymentId) {
      fail('current deployment no longer matches the unverified accepted identity');
    }
    const identity = validateAcceptedDeployment(detail, {
      deploymentId: currentId,
      projectName: PROJECT_NAME,
      productionBranch: PRODUCTION_BRANCH,
      commitSha: pending.record.sourceSha,
      deploymentUrl: pending.record.deploymentUrl
    });
    const verified = process.env.RECOVERY_PAGES_APPLICATION_SMOKE === 'passed'
      && process.env.RECOVERY_PAGES_EDITOR_SMOKE === 'passed'
      && process.env.RECOVERY_CUSTOM_APPLICATION_SMOKE === 'passed'
      && process.env.RECOVERY_CUSTOM_EDITOR_SMOKE === 'passed';
    const event = verified ? 'production_verified' : 'production_verification_unverified';
    const record = recordBase({
      sequence: records.length + 1,
      event,
      workflow: 'reconcile-production.yml',
      runId: pending.record.runId,
      runAttempt: pending.record.runAttempt,
      tag: pending.record.tag,
      sourceSha: pending.record.sourceSha,
      artifactDigest: pending.record.artifactDigest,
      deploymentId: currentId,
      deploymentUrl: identity.url,
      fromDeploymentId: currentId,
      currentDeploymentId: currentId,
      currentDeploymentUrl: identity.url,
      recordedByRunId: recorder.runId,
      recordedByRunAttempt: recorder.runAttempt,
      recordedByWorkflow: recorder.workflow
    });
    await appendProductionRecordComment({ record, token: githubToken() });
    await import('node:fs/promises').then(({ appendFile }) => appendFile(required('GITHUB_STEP_SUMMARY'), [
      '',
      '## Production verification',
      '',
      `- Deployment: \`${currentId}\` ${identity.url}`,
      `- Verification: ${verified ? 'application and online editor smoke passed on both URLs.' : '切替済み・確認未完了。Production remains blocked.'}`,
      `- Run: https://github.com/${REPOSITORY}/actions/runs/${recorder.runId}`,
      ''
    ].join('\n')));
    if (!verified) process.exitCode = 1;
    return;
  }
  const beforeSwitch = currentId === pending.record.fromDeploymentId;
  let event;
  let deploymentId = pending.record.deploymentId;
  let url = pending.record.deploymentUrl;
  let currentUrl = deploymentUrl(detail);
  if (pending.operation === 'release') {
    const contentMatches = detail.environment === 'production' && detail.latest_stage?.status === 'success'
      && detail.project_name === PROJECT_NAME && detail.is_skipped === false
      && detail.deployment_trigger?.metadata?.branch === PRODUCTION_BRANCH
      && detail.deployment_trigger?.metadata?.commit_hash === pending.record.sourceSha;
    if (beforeSwitch) {
      if (!contentMatches && detail.deployment_trigger?.metadata?.commit_hash !== ledger.active.sourceSha) {
        fail('current production identity changed before the release switched');
      }
      event = 'release_failed_before_deploy';
      deploymentId = null;
      url = null;
      currentUrl = ledger.active.deploymentUrl;
    } else {
      if (!contentMatches) fail('Cloudflare production does not match the pending release source');
      event = process.env.RECOVERY_PAGES_APPLICATION_SMOKE === 'passed'
        && process.env.RECOVERY_PAGES_EDITOR_SMOKE === 'passed'
        && process.env.RECOVERY_CUSTOM_APPLICATION_SMOKE === 'passed'
        && process.env.RECOVERY_CUSTOM_EDITOR_SMOKE === 'passed'
        ? 'release_accepted' : 'release_unverified';
      const identity = validateAcceptedDeployment(detail, {
        deploymentId: currentId,
        projectName: PROJECT_NAME,
        productionBranch: PRODUCTION_BRANCH,
        commitSha: pending.record.sourceSha,
        deploymentUrl: currentUrl
      });
      deploymentId = currentId;
      url = identity.url;
      currentUrl = identity.url;
    }
  } else {
    const contentMatches = detail.environment === 'production' && detail.latest_stage?.status === 'success'
      && detail.project_name === PROJECT_NAME && detail.is_skipped === false
      && detail.deployment_trigger?.metadata?.branch === PRODUCTION_BRANCH
      && detail.deployment_trigger?.metadata?.commit_hash === pending.record.sourceSha;
    if (beforeSwitch) {
      if (detail.deployment_trigger?.metadata?.commit_hash !== ledger.active.sourceSha) {
        fail('current production identity changed before the rollback switched');
      }
      event = 'rollback_failed_before_switch';
      currentUrl = ledger.active.deploymentUrl;
    } else {
      if (!contentMatches) fail('Cloudflare production does not match the pending rollback target');
      const verified = currentId === pending.record.deploymentId
        && process.env.RECOVERY_PAGES_APPLICATION_SMOKE === 'passed'
        && process.env.RECOVERY_PAGES_EDITOR_SMOKE === 'passed'
        && process.env.RECOVERY_CUSTOM_APPLICATION_SMOKE === 'passed'
        && process.env.RECOVERY_CUSTOM_EDITOR_SMOKE === 'passed';
      event = verified ? 'rollback_completed' : 'rollback_unverified';
      const identity = validateAcceptedDeployment(detail, {
        deploymentId: currentId,
        projectName: PROJECT_NAME,
        productionBranch: PRODUCTION_BRANCH,
        commitSha: pending.record.sourceSha,
        deploymentUrl: currentUrl
      });
      currentUrl = identity.url;
    }
  }
  const record = recordBase({
    sequence: records.length + 1,
    event,
    workflow: pending.record.workflow,
    runId: pending.record.runId,
    runAttempt: pending.record.runAttempt,
    tag: pending.record.tag,
    sourceSha: pending.record.sourceSha,
    artifactDigest: pending.record.artifactDigest,
    deploymentId,
    deploymentUrl: url,
    fromDeploymentId: pending.record.fromDeploymentId,
    currentDeploymentId: currentId,
    currentDeploymentUrl: currentUrl,
    recordedByRunId: recorder.runId,
    recordedByRunAttempt: recorder.runAttempt,
    recordedByWorkflow: recorder.workflow
  });
  await appendProductionRecordComment({ record, token: githubToken() });
  if (event.endsWith('_unverified')) process.exitCode = 1;
  const { appendFile } = await import('node:fs/promises');
  await appendFile(required('GITHUB_STEP_SUMMARY'), [
    '',
    '## Production intent reconciliation',
    '',
    `- Original operation: ${pending.record.workflow} run ${pending.record.runId}`,
    `- Recorded outcome: ${event}`,
    `- Current deployment ID: ${currentId}`,
    `- Verification: ${event.endsWith('_unverified') ? '切替済み・確認未完了。Production remains blocked until verification is repaired.' : 'Production state reconciled.'}`,
    ''
  ].join('\n'));
}

async function main() {
  const command = process.argv[2];
  if (command === 'accept-baseline') await acceptBaseline();
  else if (command === 'start-release') await startRelease();
  else if (command === 'finish-release') await finishRelease();
  else if (command === 'start-rollback') await startRollback();
  else if (command === 'execute-rollback') await executeRollback();
  else if (command === 'finish-rollback') await finishRollback();
  else if (command === 'inspect-recovery') await inspectRecovery();
  else if (command === 'finish-recovery') await finishRecovery();
  else fail('unknown command');
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
