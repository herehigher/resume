import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createCloudflarePagesClient,
  isCloudflarePagesDeploymentId,
  validateAcceptedDeployment,
  validateCurrentProductionDeployment
} from '../scripts/cloudflare-pages-api.mjs';

const ID = '6968466e-88e8-4156-94e7-39d81a45add8';
const SHA = '33c3ab39c7a08346615bc1b4fd0f413d074aad98';

function deployment(overrides = {}) {
  return {
    id: ID,
    project_name: 'herehigher-rs',
    environment: 'production',
    latest_stage: { status: 'success' },
    is_skipped: false,
    deployment_trigger: { metadata: { branch: 'main', commit_hash: SHA } },
    url: 'https://6968466e.herehigher-rs.pages.dev/',
    created_on: '2026-09-24T03:30:00.000Z',
    ...overrides
  };
}

const expected = {
  deploymentId: ID,
  projectName: 'herehigher-rs',
  productionBranch: 'main',
  commitSha: SHA,
  deploymentUrl: 'https://6968466e.herehigher-rs.pages.dev/'
};

function clientWith(responseHandler) {
  const requests = [];
  const client = createCloudflarePagesClient({
    accountId: 'a'.repeat(32),
    projectName: 'herehigher-rs',
    apiToken: 'test-token-value',
    fetchImpl: async (url, options) => {
      requests.push({ url: String(url), options });
      return responseHandler(url, options);
    }
  });
  return { client, requests };
}

function jsonResponse(result, { success = true, status = 200 } = {}) {
  return new Response(JSON.stringify({ success, result }), { status, headers: { 'content-type': 'application/json' } });
}

test('Cloudflare deployment identity requires exact production project, branch, commit, and Pages.dev URL', () => {
  assert.equal(validateAcceptedDeployment(deployment(), expected).id, ID);
  assert.throws(() => validateAcceptedDeployment(deployment({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }), expected), /ID/);
  assert.throws(() => validateAcceptedDeployment(deployment({ environment: 'preview' }), expected), /production/);
  assert.throws(() => validateAcceptedDeployment(deployment({ latest_stage: { status: 'failure' } }), expected), /successfully/);
  assert.throws(() => validateAcceptedDeployment(deployment({ deployment_trigger: { metadata: { branch: 'preview', commit_hash: SHA } } }), expected), /branch/);
  assert.throws(() => validateAcceptedDeployment(deployment({ deployment_trigger: { metadata: { branch: 'main', commit_hash: 'd'.repeat(40) } } }), expected), /SHA/);
  assert.throws(() => validateAcceptedDeployment(deployment({ url: 'https://herehigher-rs.pages.dev/' }), expected), /URL/);
});

test('current project state must match the durable deployment ID', () => {
  assert.equal(validateCurrentProductionDeployment({ latest_deployment: { id: ID, environment: 'production' } }, ID).id, ID);
  assert.throws(() => validateCurrentProductionDeployment({ latest_deployment: { id: ID, environment: 'preview' } }, ID), /current production/);
  assert.throws(() => validateCurrentProductionDeployment({ latest_deployment: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', environment: 'production' } }, ID), /does not match/);
  assert.equal(isCloudflarePagesDeploymentId(ID), true);
  assert.equal(isCloudflarePagesDeploymentId('not-a-uuid'), false);
});

test('Pages client reads project and deployment identity without exposing credentials in errors', async () => {
  const { client, requests } = clientWith((url) => jsonResponse(String(url).includes('/deployments/') ? deployment() : { name: 'herehigher-rs', latest_deployment: { id: ID, environment: 'production' } }));
  const project = await client.getProject();
  const detail = await client.getDeployment(ID);
  assert.equal(project.name, 'herehigher-rs');
  assert.equal(detail.id, ID);
  assert.match(requests[0].options.headers.Authorization, /^Bearer test-token-value$/);
  assert.equal(requests[1].url.endsWith(`/deployments/${ID}`), true);

  const failing = clientWith(async () => new Response('not-json', { status: 403 }));
  await assert.rejects(failing.client.getProject(), (error) => {
    assert.doesNotMatch(error.message, /test-token-value/);
    assert.match(error.message, /HTTP 403/);
    return true;
  });
});

test('rollback client invokes Cloudflare native rollback endpoint with POST', async () => {
  const { client, requests } = clientWith(() => jsonResponse({ id: ID }));
  assert.deepEqual(await client.rollback(ID), { id: ID });
  assert.equal(requests[0].options.method, 'POST');
  assert.equal(requests[0].url.endsWith(`/deployments/${ID}/rollback`), true);
});
