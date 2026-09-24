import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { validateCloudflarePagesDeployment } from '../scripts/validate-cloudflare-pages-deployment.mjs';

const scriptPath = fileURLToPath(new URL('../scripts/validate-cloudflare-pages-deployment.mjs', import.meta.url));

test('accepts configured Pages preview and production deployments at their HTTPS roots', () => {
  assert.equal(validateCloudflarePagesDeployment({
    deploymentUrl: 'https://a1b2c3.resume-studio.pages.dev',
    expectedEnvironment: 'production',
    pagesEnvironment: 'production',
    projectName: 'resume-studio'
  }), 'https://a1b2c3.resume-studio.pages.dev/');
  assert.equal(validateCloudflarePagesDeployment({
    deploymentUrl: 'https://resume-studio.pages.dev/',
    expectedEnvironment: 'production',
    pagesEnvironment: 'production',
    projectName: 'resume-studio'
  }), 'https://resume-studio.pages.dev/');
  assert.equal(validateCloudflarePagesDeployment({
    deploymentUrl: 'https://a1b2c3.resume-studio.pages.dev',
    expectedEnvironment: 'preview',
    pagesEnvironment: 'preview',
    projectName: 'resume-studio'
  }), 'https://a1b2c3.resume-studio.pages.dev/');
});

test('rejects environment mismatches and URLs outside the configured project', () => {
  assert.throws(() => validateCloudflarePagesDeployment({
    deploymentUrl: 'https://a1b2c3.resume-studio.pages.dev',
    expectedEnvironment: 'production',
    pagesEnvironment: 'preview',
    projectName: 'resume-studio'
  }), /must target the production environment/);
  assert.throws(() => validateCloudflarePagesDeployment({
    deploymentUrl: 'https://a1b2c3.resume-studio.pages.dev',
    expectedEnvironment: 'preview',
    pagesEnvironment: 'production',
    projectName: 'resume-studio'
  }), /must target the preview environment/);
  assert.throws(() => validateCloudflarePagesDeployment({
    deploymentUrl: 'https://a1b2c3.other-project.pages.dev',
    expectedEnvironment: 'production',
    pagesEnvironment: 'production',
    projectName: 'resume-studio'
  }), /does not belong to the configured Pages project/);
  assert.throws(() => validateCloudflarePagesDeployment({
    deploymentUrl: 'https://a1b2c3.resume-studio.pages.dev',
    expectedEnvironment: 'production',
    pagesEnvironment: 'production',
    projectName: 'resume-studio;--branch=preview'
  }), /project name is invalid/);
});

test('rejects non-root or non-HTTPS deployment URLs', () => {
  for (const deploymentUrl of [
    'http://a1b2c3.resume-studio.pages.dev/',
    'https://a1b2c3.resume-studio.pages.dev/editor/',
    'https://a1b2c3.resume-studio.pages.dev/?draft=1',
    'https://a1b2c3.resume-studio.pages.dev/#editor',
    'https://user@a1b2c3.resume-studio.pages.dev/'
  ]) {
    assert.throws(() => validateCloudflarePagesDeployment({
      deploymentUrl,
      expectedEnvironment: 'production',
      pagesEnvironment: 'production',
      projectName: 'resume-studio'
    }));
  }
});

test('CLI prints a normalized root URL and fails closed for a preview deployment', () => {
  const accepted = spawnSync(process.execPath, [scriptPath,
    '--deployment-url', 'https://a1b2c3.resume-studio.pages.dev',
    '--expected-environment', 'production',
    '--pages-environment', 'production',
    '--project-name', 'resume-studio'], { encoding: 'utf8' });
  assert.equal(accepted.status, 0);
  assert.equal(accepted.stdout.trim(), 'https://a1b2c3.resume-studio.pages.dev/');

  const rejected = spawnSync(process.execPath, [scriptPath,
    '--deployment-url', 'https://a1b2c3.resume-studio.pages.dev',
    '--expected-environment', 'production',
    '--pages-environment', 'preview',
    '--project-name', 'resume-studio'], { encoding: 'utf8' });
  assert.equal(rejected.status, 1);
});

test('release workflow gates production on preview smoke and rechecks the same run artifact', async () => {
  const workflowPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.github/workflows/release.yml');
  const workflow = readFileSync(workflowPath, 'utf8');
  assert.match(workflow, /artifact-ids: \$\{\{ needs\.prepare\.outputs\.prepared_artifact_id \}\}[\s\S]+run-id: \$\{\{ github\.run_id \}\}/);
  assert.match(workflow, /concurrency:[\s\S]+group: pages-production[\s\S]+cancel-in-progress: false/);
  assert.match(workflow, /name: production[\s\S]+permissions:[\s\S]+contents: write/);
  assert.match(workflow, /uses: cloudflare\/wrangler-action@v4/);
  assert.match(workflow, /Validate configured Cloudflare Pages project[\s\S]+\^\[a-z0-9\]\(\[a-z0-9-\]\{0,61\}\[a-z0-9\]\)\?\$/);
  assert.match(workflow, /Validate configured Cloudflare Pages production branch[\s\S]+vars\.CLOUDFLARE_PAGES_PRODUCTION_BRANCH[\s\S]+validate-cloudflare-pages-branch\.mjs/);
  assert.match(workflow, /Verify Cloudflare production branch before preview upload[\s\S]+Authorization: Bearer \$CLOUDFLARE_API_TOKEN[\s\S]+verify-cloudflare-pages-project\.mjs/);
  assert.match(workflow, /Verify Cloudflare production branch before production upload[\s\S]+Authorization: Bearer \$CLOUDFLARE_API_TOKEN[\s\S]+verify-cloudflare-pages-project\.mjs/);
  assert.match(workflow, /command: pages deploy "\$\{\{ runner\.temp \}\}\/prepared\/site-artifact" --project-name=\$\{\{ vars\.CLOUDFLARE_PAGES_PROJECT \}\} --branch=\$\{\{ steps\.preview_branch\.outputs\.branch \}\} --commit-hash=\$\{\{ needs\.authorize\.outputs\.release_sha \}\}/);
  assert.match(workflow, /name: Deploy the verified artifact to the Cloudflare production environment[\s\S]+command: pages deploy "\$\{\{ runner\.temp \}\}\/prepared\/site-artifact" --project-name=\$\{\{ vars\.CLOUDFLARE_PAGES_PROJECT \}\} --branch=\$\{\{ steps\.production_pages_project\.outputs\.branch \}\} --commit-hash=\$\{\{ needs\.authorize\.outputs\.release_sha \}\}/);
  assert.doesNotMatch(workflow, /Pages production branch: `main`/);
  assert.match(workflow, /steps\.preview_deployment\.outputs\.pages-environment/);
  assert.match(workflow, /steps\.preview_deployment\.outputs\.deployment-url/);
  assert.match(workflow, /steps\.production_deployment\.outputs\.pages-environment/);
  assert.match(workflow, /steps\.production_deployment\.outputs\.deployment-url/);
  assert.match(workflow, /validate-cloudflare-pages-deployment\.mjs/);
  assert.match(workflow, /node scripts\/validate-deployment-smoke\.mjs --base-url "\$base_url"/);
  assert.match(workflow, /node scripts\/check-online-editor\.mjs --base-url "\$base_url"/);
  const previewDeploy = workflow.indexOf('name: Deploy the verified artifact to the Cloudflare preview environment');
  const previewIdentity = workflow.indexOf('name: Validate the Pages preview deployment identity');
  const previewSmoke = workflow.indexOf('name: Smoke test the Cloudflare preview deployment');
  const reverify = workflow.indexOf('name: Reverify the prepared artifact before production upload');
  const previewPagesConfig = workflow.indexOf('name: Verify Cloudflare production branch before preview upload');
  const productionPagesConfig = workflow.indexOf('name: Verify Cloudflare production branch before production upload');
  const productionDeploy = workflow.indexOf('name: Deploy the verified artifact to the Cloudflare production environment');
  const productionIdentity = workflow.indexOf('name: Validate the Pages production deployment identity');
  const productionSmoke = workflow.indexOf('name: Smoke test production Pages.dev deployment and custom domain');
  const summaryStart = workflow.indexOf('      - name: Record publication outcome');
  const summaryEnd = workflow.indexOf('\n\n', summaryStart);
  const summaryStep = workflow.slice(summaryStart, summaryEnd);
  assert.ok(previewPagesConfig < previewDeploy && previewSmoke < productionPagesConfig
    && productionPagesConfig < reverify && reverify < productionDeploy);
  assert.ok(previewDeploy < previewIdentity && previewIdentity < previewSmoke && previewSmoke < reverify
    && reverify < productionDeploy && productionDeploy < productionIdentity && productionIdentity < productionSmoke);
  assert.match(workflow, /--expected-environment preview[\s\S]+--pages-environment "\$PAGES_ENVIRONMENT"/);
  assert.match(workflow, /--expected-environment production[\s\S]+--pages-environment "\$PAGES_ENVIRONMENT"/);
  assert.match(workflow, /Reverify the prepared artifact before production upload[\s\S]+release-artifact-evidence\.mjs verify[\s\S]+--artifact-dir "\$RUNNER_TEMP\/prepared\/site-artifact"/);
  assert.match(workflow, /run_smoke pages_dev "\$PAGES_DEV_URL"[\s\S]+run_smoke custom_domain "\$PRODUCTION_ORIGIN"/);
  assert.match(workflow, /Preview smoke: application \$\{PREVIEW_APPLICATION_SMOKE:-not-run\}; online editor \$\{PREVIEW_EDITOR_SMOKE:-not-run\}/);
  assert.match(workflow, /Production Pages\.dev smoke: application \$\{PRODUCTION_PAGES_APPLICATION_SMOKE:-not-run\}; online editor \$\{PRODUCTION_PAGES_EDITOR_SMOKE:-not-run\}/);
  assert.match(workflow, /Custom domain smoke: application \$\{CUSTOM_DOMAIN_APPLICATION_SMOKE:-not-run\}; online editor \$\{CUSTOM_DOMAIN_EDITOR_SMOKE:-not-run\}/);
  assert.match(workflow, /Preview Pages\.dev URL \(validated\): \$\{PREVIEW_DEPLOYMENT_URL:-not-accepted\}/);
  assert.match(workflow, /Production Pages\.dev URL \(validated\): \$\{PRODUCTION_DEPLOYMENT_URL:-not-accepted\}/);
  assert.match(workflow, /production_deployment_status="\$\(summarize_outcome "\$\{PRODUCTION_DEPLOYMENT_OUTCOME:-\}"\)"/);
  assert.match(workflow, /echo "- Production Direct Upload: \$\{production_deployment_status\}"/);
  assert.match(workflow, /Production Pages branch: .*configured Cloudflare production route label/);
  assert.match(workflow, /Artifact source: authorized release SHA[\s\S]+commit-hash[\s\S]+to both uploads/);
  assert.doesNotMatch(summaryStep, /(?<!\\)`/);
  assert.doesNotMatch(workflow, /actions\/upload-pages-artifact|actions\/deploy-pages|github-pages|id-token:\s*write|pages:\s*write/);
});
