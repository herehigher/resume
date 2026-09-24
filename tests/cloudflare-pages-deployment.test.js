import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { validateCloudflarePagesDeployment } from '../scripts/validate-cloudflare-pages-deployment.mjs';

const scriptPath = fileURLToPath(new URL('../scripts/validate-cloudflare-pages-deployment.mjs', import.meta.url));

test('accepts the configured Pages production deployment at its HTTPS root', () => {
  assert.equal(validateCloudflarePagesDeployment({
    deploymentUrl: 'https://a1b2c3.resume-studio.pages.dev',
    pagesEnvironment: 'production',
    projectName: 'resume-studio'
  }), 'https://a1b2c3.resume-studio.pages.dev/');
  assert.equal(validateCloudflarePagesDeployment({
    deploymentUrl: 'https://resume-studio.pages.dev/',
    pagesEnvironment: 'production',
    projectName: 'resume-studio'
  }), 'https://resume-studio.pages.dev/');
});

test('rejects preview environments and URLs outside the configured project', () => {
  assert.throws(() => validateCloudflarePagesDeployment({
    deploymentUrl: 'https://a1b2c3.resume-studio.pages.dev',
    pagesEnvironment: 'preview',
    projectName: 'resume-studio'
  }), /must target the production environment/);
  assert.throws(() => validateCloudflarePagesDeployment({
    deploymentUrl: 'https://a1b2c3.other-project.pages.dev',
    pagesEnvironment: 'production',
    projectName: 'resume-studio'
  }), /does not belong to the configured Pages project/);
  assert.throws(() => validateCloudflarePagesDeployment({
    deploymentUrl: 'https://a1b2c3.resume-studio.pages.dev',
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
      pagesEnvironment: 'production',
      projectName: 'resume-studio'
    }));
  }
});

test('CLI prints a normalized root URL and fails closed for a preview deployment', () => {
  const accepted = spawnSync(process.execPath, [scriptPath,
    '--deployment-url', 'https://a1b2c3.resume-studio.pages.dev',
    '--pages-environment', 'production',
    '--project-name', 'resume-studio'], { encoding: 'utf8' });
  assert.equal(accepted.status, 0);
  assert.equal(accepted.stdout.trim(), 'https://a1b2c3.resume-studio.pages.dev/');

  const rejected = spawnSync(process.execPath, [scriptPath,
    '--deployment-url', 'https://a1b2c3.resume-studio.pages.dev',
    '--pages-environment', 'preview',
    '--project-name', 'resume-studio'], { encoding: 'utf8' });
  assert.equal(rejected.status, 1);
});

test('release workflow pins the same verified run artifact to a Cloudflare production deployment', async () => {
  const workflowPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.github/workflows/release.yml');
  const workflow = readFileSync(workflowPath, 'utf8');
  assert.match(workflow, /artifact-ids: \$\{\{ needs\.prepare\.outputs\.prepared_artifact_id \}\}[\s\S]+run-id: \$\{\{ github\.run_id \}\}/);
  assert.match(workflow, /concurrency:[\s\S]+group: pages-production[\s\S]+cancel-in-progress: false/);
  assert.match(workflow, /name: production[\s\S]+permissions:[\s\S]+contents: write/);
  assert.match(workflow, /uses: cloudflare\/wrangler-action@v4/);
  assert.match(workflow, /Validate configured Cloudflare Pages project[\s\S]+\^\[a-z0-9\]\(\[a-z0-9-\]\{0,61\}\[a-z0-9\]\)\?\$[\s\S]+command: pages deploy "\$\{\{ runner\.temp \}\}\/prepared\/site-artifact" --project-name=\$\{\{ vars\.CLOUDFLARE_PAGES_PROJECT \}\}/);
  assert.doesNotMatch(workflow, /--branch(?:=|\s)|Pages production branch: `main`/);
  assert.match(workflow, /Pages target: Direct Upload default \(no branch override\)/);
  assert.match(workflow, /steps\.deployment\.outputs\.pages-environment/);
  assert.match(workflow, /steps\.deployment\.outputs\.deployment-url/);
  assert.match(workflow, /validate-cloudflare-pages-deployment\.mjs/);
  assert.match(workflow, /node scripts\/validate-deployment-smoke\.mjs --base-url "\$base_url"/);
  assert.match(workflow, /node scripts\/check-online-editor\.mjs --base-url "\$base_url"/);
  assert.match(workflow, /run_smoke pages_dev "\$PAGES_DEV_URL"[\s\S]+run_smoke production "\$PRODUCTION_ORIGIN"/);
  assert.match(workflow, /Pages\.dev smoke: application \$\{PAGES_DEV_APPLICATION_SMOKE:-not-run\}; online editor \$\{PAGES_DEV_EDITOR_SMOKE:-not-run\}/);
  assert.match(workflow, /Production smoke: application \$\{PRODUCTION_APPLICATION_SMOKE:-not-run\}; online editor \$\{PRODUCTION_EDITOR_SMOKE:-not-run\}/);
  assert.doesNotMatch(workflow, /actions\/upload-pages-artifact|actions\/deploy-pages|github-pages|id-token:\s*write|pages:\s*write/);
});
