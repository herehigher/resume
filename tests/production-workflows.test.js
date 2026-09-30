import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../.github/workflows/', import.meta.url);
const readWorkflow = (name) => readFileSync(new URL(name, root), 'utf8');

test('release records the locked pre-state before creating a tag or changing production', () => {
  const release = readWorkflow('release.yml');
  assert.match(release, /group: pages-production[\s\S]+cancel-in-progress: false/);
  assert.match(release, /permissions:[\s\S]+deployments: write/);
  assert.doesNotMatch(release, /issues: write/);
  const intent = release.indexOf('name: Verify durable production state and persist release intent');
  const tag = release.indexOf('name: Reverify bytes and create or resume the immutable tag');
  const productionUpload = release.indexOf('name: Deploy the verified artifact to the Cloudflare production environment');
  const finalizer = release.indexOf('name: Record accepted or unverified production deployment');
  assert.ok(intent > 0 && intent < tag && tag < productionUpload && productionUpload < finalizer);
  assert.match(release, /node scripts\/production-state\.mjs start-release/);
  assert.match(release, /node scripts\/production-state\.mjs finish-release/);
  assert.match(release, /production_state_start\.outcome == 'success'/);
  assert.match(release, /PRODUCTION_DEPLOYMENT_URL: \$\{\{ steps\.production_identity\.outputs\.deployment_url \}\}/);
});

test('baseline, rollback, and reconciliation are owner-triggered main-only workflows sharing the release lock', () => {
  const baseline = readWorkflow('accept-production-baseline.yml');
  const rollback = readWorkflow('rollback-production.yml');
  const reconcile = readWorkflow('reconcile-production.yml');
  for (const workflow of [baseline, rollback, reconcile]) {
    assert.match(workflow, /github\.ref == 'refs\/heads\/main'/);
    assert.match(workflow, /github\.actor == 'herehigher'/);
    assert.match(workflow, /github\.triggering_actor == 'herehigher'/);
    assert.match(workflow, /group: pages-production[\s\S]+cancel-in-progress: false/);
    assert.match(workflow, /environment: production/);
  }
  assert.match(baseline, /deployments: read/);
  assert.doesNotMatch(baseline, /issues: write|deployments: write/);
  for (const workflow of [rollback, reconcile]) {
    assert.match(workflow, /deployments: write/);
    assert.doesNotMatch(workflow, /issues: write/);
  }
  assert.match(baseline, /artifact-ids: '10788856459'[\s\S]+run-id: '35951587964'/);
  assert.match(baseline, /artifact-ids: '10799566904'[\s\S]+run-id: '35979958986'/);
  assert.match(baseline, /node scripts\/production-state\.mjs accept-baseline/);
  assert.match(rollback, /Validate accepted target and persist rollback intent[\s\S]+Request Cloudflare native rollback[\s\S]+Install smoke verification dependencies after the production switch[\s\S]+Smoke test the current Pages\.dev rollback deployment[\s\S]+Smoke test the custom-domain rollback deployment/);
  assert.match(rollback, /node scripts\/production-state\.mjs execute-rollback/);
  assert.match(rollback, /node scripts\/production-state\.mjs finish-rollback/);
  assert.doesNotMatch(rollback, /wrangler-action|pages deploy|actions\/deploy-pages/);
  assert.match(reconcile, /node scripts\/production-state\.mjs inspect-recovery/);
  assert.match(reconcile, /node scripts\/production-state\.mjs finish-recovery/);
  const state = readFileSync(new URL('../scripts/production-state.mjs', import.meta.url), 'utf8');
  assert.match(state, /validateReleaseDeploymentEvidence\(detail, \{[\s\S]+deploymentId: pending\.deploymentId[\s\S]+deploymentUrl: pending\.deploymentUrl/);
  assert.doesNotMatch(reconcile, /wrangler-action|pages deploy|execute-rollback/);
});

test('rollback smoke requires the exact target ID and both public URLs, and failures reconcile as unverified', () => {
  const state = readFileSync(new URL('../scripts/production-state.mjs', import.meta.url), 'utf8');
  assert.match(state, /rollbackResult\?\.id !== pending\.record\.deploymentId/);
  assert.match(state, /currentId === pending\.record\.deploymentId/);
  assert.match(state, /event: verified \? 'rollback_completed' : 'rollback_unverified'/);
  assert.match(state, /process\.exitCode = 1/);
  assert.match(state, /currentId === pending\.record\.deploymentId/);
});
