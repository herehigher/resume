const API_ORIGIN = 'https://api.cloudflare.com/client/v4';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA_PATTERN = /^[0-9a-f]{40}$/;

function fail(message) {
  throw new Error(`Cloudflare Pages API: ${message}`);
}

function validateConfiguration({ accountId, projectName, apiToken }) {
  if (!/^[a-f0-9]{32}$/.test(accountId || '')) fail('account ID is invalid');
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(projectName || '')) fail('project name is invalid');
  if (typeof apiToken !== 'string' || apiToken.trim() === '') fail('API token is unavailable');
}

function normalizePagesDevUrl(value, projectName) {
  if (typeof value !== 'string' || value !== value.trim()) fail('deployment URL is invalid');
  let url;
  try {
    url = new URL(value);
  } catch {
    fail('deployment URL is invalid');
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.pathname !== '/'
    || url.search || url.hash || url.hostname === `${projectName}.pages.dev`
    || !url.hostname.endsWith(`.${projectName}.pages.dev`)) {
    fail('deployment URL must be an HTTPS deployment-specific Pages.dev root URL');
  }
  return `${url.origin}/`;
}

function validateDeployment(deployment, expected) {
  if (!deployment || typeof deployment !== 'object' || Array.isArray(deployment)) fail('deployment response is invalid');
  if (!UUID_PATTERN.test(deployment.id || '') || deployment.id.toLowerCase() !== expected.deploymentId.toLowerCase()) {
    fail('deployment ID does not match the accepted record');
  }
  if (deployment.project_name !== expected.projectName) fail('deployment belongs to a different Pages project');
  if (deployment.environment !== 'production') fail('deployment is not a production deployment');
  if (deployment.latest_stage?.status !== 'success') fail('deployment did not complete successfully');
  if (deployment.is_skipped !== false) fail('skipped deployment is not accepted');
  if (deployment.deployment_trigger?.metadata?.branch !== expected.productionBranch) {
    fail('deployment production branch does not match');
  }
  if (deployment.deployment_trigger?.metadata?.commit_hash !== expected.commitSha) {
    fail('deployment source SHA does not match the accepted record');
  }
  if (normalizePagesDevUrl(deployment.url, expected.projectName) !== expected.deploymentUrl) {
    fail('deployment URL does not match the accepted record');
  }
  const createdOn = Date.parse(deployment.created_on);
  if (!Number.isFinite(createdOn)) fail('deployment creation time is invalid');
  return Object.freeze({
    id: deployment.id.toLowerCase(),
    url: expected.deploymentUrl,
    createdOn: new Date(createdOn).toISOString(),
    environment: deployment.environment,
    projectName: deployment.project_name,
    productionBranch: expected.productionBranch,
    commitSha: deployment.deployment_trigger.metadata.commit_hash,
    status: deployment.latest_stage.status
  });
}

export function createCloudflarePagesClient({ accountId, projectName, apiToken, fetchImpl = fetch }) {
  validateConfiguration({ accountId, projectName, apiToken });
  if (typeof fetchImpl !== 'function') fail('fetch implementation is unavailable');
  const projectPath = `/accounts/${accountId}/pages/projects/${projectName}`;

  async function request(path, { method = 'GET', query } = {}) {
    const url = new URL(`${API_ORIGIN}${path}`);
    for (const [key, value] of Object.entries(query || {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
    let response;
    try {
      response = await fetchImpl(url, {
        method,
        headers: {
          Authorization: `Bearer ${apiToken}`,
          Accept: 'application/json'
        }
      });
    } catch {
      fail('request failed before receiving a response');
    }
    let body;
    try {
      body = await response.json();
    } catch {
      fail(`response was not valid JSON (HTTP ${response.status})`);
    }
    if (!response.ok || body?.success !== true) fail(`request failed (HTTP ${response.status})`);
    return body;
  }

  return Object.freeze({
    async getProject() {
      const response = await request(projectPath);
      if (response.result?.name !== projectName) fail('project response name does not match');
      return response.result;
    },
    async getDeployment(deploymentId) {
      if (!UUID_PATTERN.test(deploymentId || '')) fail('deployment ID is invalid');
      const response = await request(`${projectPath}/deployments/${deploymentId}`);
      return response.result;
    },
    async listProductionDeployments({ page = 1, perPage = 100 } = {}) {
      if (!Number.isInteger(page) || page < 1 || !Number.isInteger(perPage) || perPage < 1 || perPage > 100) {
        fail('deployment pagination is invalid');
      }
      const response = await request(`${projectPath}/deployments`, {
        query: { env: 'production', page, per_page: perPage }
      });
      if (!Array.isArray(response.result)) fail('deployment list response is invalid');
      return Object.freeze({ deployments: response.result, totalPages: response.result_info?.total_pages ?? 1 });
    },
    async rollback(deploymentId) {
      if (!UUID_PATTERN.test(deploymentId || '')) fail('deployment ID is invalid');
      const response = await request(`${projectPath}/deployments/${deploymentId}/rollback`, { method: 'POST' });
      return response.result;
    }
  });
}

export function validateAcceptedDeployment(deployment, expected) {
  if (!expected || !UUID_PATTERN.test(expected.deploymentId || '') || !SHA_PATTERN.test(expected.commitSha || '')) {
    fail('expected deployment identity is invalid');
  }
  if (typeof expected.projectName !== 'string' || !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(expected.projectName)) {
    fail('expected project name is invalid');
  }
  if (typeof expected.productionBranch !== 'string' || expected.productionBranch === '') fail('expected production branch is invalid');
  if (normalizePagesDevUrl(expected.deploymentUrl, expected.projectName) !== expected.deploymentUrl) {
    fail('expected Pages.dev URL is invalid');
  }
  return validateDeployment(deployment, expected);
}

export function validateCurrentProductionDeployment(project, expectedDeploymentId) {
  const current = project?.latest_deployment;
  if (current?.environment !== 'production' || !UUID_PATTERN.test(current.id || '')) {
    fail('current production deployment identity is unavailable');
  }
  if (current.id.toLowerCase() !== expectedDeploymentId.toLowerCase()) {
    fail('current production deployment does not match the accepted state');
  }
  return current;
}

export function isCloudflarePagesDeploymentId(value) {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}
