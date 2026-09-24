import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const qualityWorkflow = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
const eligibilityWorkflow = readFileSync(new URL('../.github/workflows/release-eligibility.yml', import.meta.url), 'utf8');
const releaseWorkflow = readFileSync(new URL('../.github/workflows/release.yml', import.meta.url), 'utf8');
const candidateWorkflow = readFileSync(new URL('../.github/workflows/release-candidate-assets.yml', import.meta.url), 'utf8');
const playwrightConfig = readFileSync(new URL('../playwright.config.js', import.meta.url), 'utf8');
const deploymentSmoke = readFileSync(new URL('../scripts/validate-deployment-smoke.mjs', import.meta.url), 'utf8');
const onlineEditorCheck = readFileSync(new URL('../scripts/check-online-editor.mjs', import.meta.url), 'utf8');
const networkContract = readFileSync(new URL('../scripts/network-contract.mjs', import.meta.url), 'utf8');

function workflowJobBlock(workflow, name) {
  const start = workflow.indexOf(`  ${name}:\n`);
  assert.notEqual(start, -1, `missing workflow job: ${name}`);
  const nextJob = workflow.slice(start + 1).search(/^ {2}[a-z][\w-]*:\n/m);
  return nextJob === -1 ? workflow.slice(start) : workflow.slice(start, start + 1 + nextJob);
}

const qualityJob = workflowJobBlock(qualityWorkflow, 'quality');

function workflowStep(job, name) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = job.match(new RegExp(`^      - name: ${escapedName}\\n([\\s\\S]*?)(?=^      - name:|^  [a-z][\\w-]*:\\n|(?![\\s\\S]))`, 'm'));
  assert.ok(match, `missing workflow step: ${name}`);
  return { body: match[1], index: match.index };
}

function workflowStepField(step, field) {
  return step.body.match(new RegExp(`^ {8,10}${field}: (.+)$`, 'm'))?.[1];
}

test('quality cancels superseded pull request runs without grouping main runs', () => {
  assert.match(qualityWorkflow, /group: quality-\$\{\{ github\.event_name == 'pull_request' && github\.event\.pull_request\.number \|\| github\.run_id \}\}/);
  assert.match(qualityWorkflow, /cancel-in-progress: \$\{\{ github\.event_name == 'pull_request' \}\}/);
});

test('quality classifies scope after its primary checkout', () => {
  assert.ok(workflowStep(qualityJob, 'Checkout').index < workflowStep(qualityJob, 'Classify pull request scope').index);
  assert.doesNotMatch(qualityWorkflow, /^ {2}scope:\s*$/m);
  assert.match(qualityWorkflow, /quality:[\s\S]+- name: Checkout[\s\S]+- name: Classify pull request scope[\s\S]+- name: Setup Node\.js/);
  assert.doesNotMatch(qualityWorkflow, /needs\.scope/);
  assert.match(qualityWorkflow, /steps\.scope\.outputs\.docs_only/);
  assert.match(qualityWorkflow, /id: scope\s+if: [^\n]+\s+continue-on-error: true/);
  assert.match(qualityWorkflow, /always\(\) && github\.event_name == 'pull_request' && steps\.scope\.outcome == 'failure'/);
});

test('candidate generation is a separate trusted workflow and does not claim product Quality', () => {
  assert.match(candidateWorkflow, /workflow_dispatch:[\s\S]+candidate_ref:[\s\S]+candidate_sha:[\s\S]+correlation_id:/);
  assert.match(candidateWorkflow, /run-name: Candidate asset evidence \$\{\{ inputs\.correlation_id \}\}/);
  assert.match(candidateWorkflow, /CORRELATION_ID: \$\{\{ inputs\.correlation_id \}\}[\s\S]+\[\[ "\$CORRELATION_ID" =~ \^\[0-9a-f\]\{32\}\$ \]\]/);
  assert.match(candidateWorkflow, /Checkout trusted workflow control[\s\S]+ref: \$\{\{ github\.sha \}\}[\s\S]+persist-credentials: false/);
  assert.match(candidateWorkflow, /Resolve official candidate branch[\s\S]+git fetch --no-tags origin "refs\/heads\/\$CANDIDATE_REF"[\s\S]+rev-parse FETCH_HEAD/);
  assert.match(candidateWorkflow, /Checkout immutable candidate source[\s\S]+ref: \$\{\{ inputs\.candidate_sha \}\}/);
  assert.match(candidateWorkflow, /producer-kind release-candidate[\s\S]+producer-workflow \.github\/workflows\/release-candidate-assets\.yml[\s\S]+producer-run-attempt/);
  assert.match(candidateWorkflow, /Upload candidate documentation evidence[\s\S]+release-candidate-documentation-assets-\$\{\{ inputs\.candidate_sha \}\}-attempt-\$\{\{ github\.run_attempt \}\}/);
  assert.doesNotMatch(candidateWorkflow, /npm test|test:e2e|workflow_call/);
});

test('quality owns release asset currentness and reuses its fresh temporary evidence', () => {
  assert.match(qualityWorkflow, /Classify release documentation asset requirement/);
  assert.match(qualityWorkflow, /release-doc-assets\.mjs required/);
  assert.match(qualityWorkflow, /quality:[\s\S]+outputs:[\s\S]+release_assets_required:[\s\S]+Upload documentation asset evidence/);
  assert.match(qualityWorkflow, /release_assets_changed: \$\{\{ steps\.release_assets\.outputs\.changed \}\}/);
  assert.match(qualityWorkflow, /quality:[\s\S]+Classify release asset check[\s\S]+Materialize release asset LFS files[\s\S]+Download the originally promoted candidate artifact[\s\S]+Verify release documentation assets are current[\s\S]+Upload documentation asset evidence/);
  assert.match(qualityWorkflow, /steps\.release_asset_check\.outputs\.classification == 'verification-required'/);
  assert.match(qualityWorkflow, /--quality-run-id "\$\{QUALITY_RUN_ID\}"/);
  assert.match(qualityWorkflow, /Resolve promoted candidate artifact provenance[\s\S]+Resolve exact candidate artifact identity[\s\S]+artifact-ids: \$\{\{ steps\.candidate_evidence\.outputs\.artifact_id \}\}/);
  assert.match(qualityWorkflow, /release-doc-assets\.mjs compare[\s\S]+--promoted-root "\$\{PROMOTED_ASSET_DIRECTORY\}"[\s\S]+--source-sha "\$\{SOURCE_SHA\}"/);
  assert.doesNotMatch(qualityWorkflow, /Download final Quality documentation evidence/);
  assert.match(qualityWorkflow, /Reject release asset changes outside a version pull request[\s\S]+versionless-asset-change[\s\S]+exit 1/);
});

test('release asset status treats missing assets as a real failure and skips duplicate failure after Quality fails', () => {
  assert.match(qualityWorkflow, /Record actual Quality run identity[\s\S]+run_id=\$\{GITHUB_RUN_ID\}/);
  assert.match(qualityWorkflow, /Classify release asset check[\s\S]+release-assets-summary\.mjs classify/);
  assert.match(qualityWorkflow, /Report missing release documentation assets[\s\S]+failure release-assets-missing[\s\S]+exit 1/);
  assert.match(qualityWorkflow, /candidate-evidence[\s\S]+--run-attempt "\$\{RUN_ATTEMPT\}"[\s\S]+--control-sha "\$\{CONTROL_SHA\}"/);
  assert.match(qualityWorkflow, /Report invalid committed provenance[\s\S]+failure provenance-invalid[\s\S]+Report unavailable candidate artifact evidence[\s\S]+failure promoted-evidence-unavailable[\s\S]+Report release asset integrity mismatch[\s\S]+failure asset-integrity-mismatch/);
});

test('quality is the only required workflow job and materializes release assets only when needed', () => {
  assert.doesNotMatch(qualityWorkflow, /^ {2}release-assets-current:\s*$/m);
  assert.doesNotMatch(qualityWorkflow, /Release assets current/);
  const lfsMaterialization = workflowStep(qualityJob, 'Materialize release asset LFS files');
  assert.match(workflowStepField(lfsMaterialization, 'if'), /classification == 'verification-required'/);
  for (const asset of [
    'docs/screenshots/en.png', 'docs/screenshots/ja.png', 'docs/screenshots/zh-CN.png',
    'output/pdf/en-letter.pdf', 'output/pdf/ja-a4.pdf', 'output/pdf/zh-CN-a4.pdf'
  ]) assert.match(lfsMaterialization.body, new RegExp(asset.replaceAll('.', '\\.')));
  assert.match(lfsMaterialization.body, /git lfs pull/);
  assert.doesNotMatch(qualityJob, /lfs: true|git lfs checkout/);
});

test('release preparation checks committed assets against the final Quality evidence', () => {
  assert.match(releaseWorkflow, /Download exact Quality documentation assets[\s\S]+Verify release documentation assets are current for final Quality source[\s\S]+Prepare the immutable site artifact/);
  assert.match(releaseWorkflow, /documentation-assets-\$\{\{ needs\.authorize\.outputs\.release_sha \}\}/);
  assert.match(releaseWorkflow, /run-id: \$\{\{ steps\.quality\.outputs\.run_id \}\}/);
  assert.match(releaseWorkflow, /git -C "\$RUNNER_TEMP\/release-source" lfs pull/);
  assert.match(releaseWorkflow, /release-doc-assets\.mjs compare-current[\s\S]+--generated-root "\$\{\{ runner\.temp \}\}\/quality-documentation-assets"[\s\S]+--source-sha "\$\{SOURCE_SHA\}"/);
  assert.doesNotMatch(releaseWorkflow, /Download the originally promoted Quality artifact|promoted-documentation-assets/);
});

test('only Release eligibility dispatches Release Pages after merged-version authorization', () => {
  assert.match(eligibilityWorkflow, /workflow_run:[\s\S]+workflows: \[Quality\][\s\S]+types: \[completed\][\s\S]+branches: \[main\]/);
  assert.match(eligibilityWorkflow, /validate-release-run\.mjs eligibility[\s\S]+--run-id "\$\{QUALITY_RUN_ID\}"[\s\S]+--sha "\$\{QUALITY_SHA\}"/);
  assert.match(eligibilityWorkflow, /Record ineligible main update[\s\S]+release_required != 'true'/);
  assert.match(eligibilityWorkflow, /Dispatch Release Pages for the eligible Quality run[\s\S]+release_required == 'true'[\s\S]+gh workflow run release\.yml[\s\S]+-f quality_run_id/);
  assert.doesNotMatch(releaseWorkflow, /workflow_run:/);
  assert.match(releaseWorkflow, /workflow_dispatch:[\s\S]+quality_run_id:/);
  assert.doesNotMatch(releaseWorkflow, /recovery_tag|outputs\.recovery|prepare-legacy-release-config|git archive/);
  assert.match(releaseWorkflow, /validate-release-run\.mjs eligibility --run-id "\$QUALITY_RUN_ID"/);
  assert.match(releaseWorkflow, /test "\$release_required" = true[\s\S]+Recheck current version under the production lock/);
  assert.doesNotMatch(releaseWorkflow, /mode=publish|prepared_run_id|inputs\.prepared_artifact_id/);
});

test('prepare, tag, and deploy reuse one exact artifact under the production lock', () => {
  assert.match(releaseWorkflow, /publish:[\s\S]+needs: \[authorize, prepare\][\s\S]+artifact-ids: \$\{\{ needs\.prepare\.outputs\.prepared_artifact_id \}\}[\s\S]+run-id: \$\{\{ github\.run_id \}\}/);
  assert.match(releaseWorkflow, /publish:[\s\S]+concurrency:[\s\S]+group: pages-production[\s\S]+Recheck current version under the production lock[\s\S]+prepared_version" = "\$current_version"[\s\S]+Reverify bytes and create or resume the immutable tag[\s\S]+Verify original bytes against the tagged source[\s\S]+Deploy the verified artifact to Cloudflare Pages/);
  assert.doesNotMatch(releaseWorkflow, /^concurrency:/m);
});

test('release prepares provider-neutral site bytes and smokes the production origin root', () => {
  assert.doesNotMatch(releaseWorkflow, /analytics_delivery|analyticsDelivery|analytics_mode|analytics_provider|ANALYTICS_MODE|ANALYTICS_PROVIDER|CLOUDFLARE_WEB_ANALYTICS_TOKEN|provider-compatibility|MANIFEST_PATH/i);
  assert.match(releaseWorkflow, /prepare-site-artifact\.mjs prepare[\s\S]+--source "\$SOURCE_ROOT\/site" --output "\$RUNNER_TEMP\/site-artifact"/);
  assert.doesNotMatch(releaseWorkflow, /--manifest/);
  assert.match(releaseWorkflow, /name: site-release-artifact-/);
  assert.match(releaseWorkflow, /artifact-dir "\$RUNNER_TEMP\/prepared\/site-artifact"/);
  assert.match(releaseWorkflow, /PRODUCTION_ORIGIN: \$\{\{ vars\.PRODUCTION_ORIGIN \}\}[\s\S]+test "\$PRODUCTION_ORIGIN" = 'https:\/\/rs\.herehigher\.com\/'[\s\S]+validate-deployment-smoke\.mjs --base-url "\$base_url"/);
  assert.match(releaseWorkflow, /check-online-editor\.mjs --base-url "\$base_url"/);
  assert.doesNotMatch(releaseWorkflow, /steps\.deployment\.outputs\.page_url|PAGE_URL/);
  assert.doesNotMatch(releaseWorkflow, /recovery|rollback/i);
  assert.match(releaseWorkflow, /Pages\.dev smoke: application \$\{PAGES_DEV_APPLICATION_SMOKE:-not-run\}; online editor \$\{PAGES_DEV_EDITOR_SMOKE:-not-run\}/);
  assert.match(releaseWorkflow, /Production smoke: application \$\{PRODUCTION_APPLICATION_SMOKE:-not-run\}; online editor \$\{PRODUCTION_EDITOR_SMOKE:-not-run\}/);
  assert.doesNotMatch(releaseWorkflow, /live pages\.dev\/custom-domain checks after the destination switch/);
});

test('release workflow uses Cloudflare Pages Direct Upload and production-only outputs', () => {
  const publishJob = workflowJobBlock(releaseWorkflow, 'publish');
  const project = workflowStep(publishJob, 'Validate configured Cloudflare Pages project');
  const deploy = workflowStep(publishJob, 'Deploy the verified artifact to Cloudflare Pages');
  const validate = workflowStep(publishJob, 'Validate the Pages production deployment identity');
  const smoke = workflowStep(publishJob, 'Smoke test Pages.dev deployment and production origin');
  assert.match(releaseWorkflow, /name: production[\s\S]+url: \$\{\{ vars\.PRODUCTION_ORIGIN \}\}/);
  assert.match(project.body, /CLOUDFLARE_PAGES_PROJECT[\s\S]+\^\[a-z0-9\]\(\[a-z0-9-\]\{0,61\}\[a-z0-9\]\)\?\$/);
  assert.match(deploy.body, /uses: cloudflare\/wrangler-action@v4/);
  assert.match(deploy.body, /secrets\.CLOUDFLARE_API_TOKEN/);
  assert.match(deploy.body, /vars\.CLOUDFLARE_ACCOUNT_ID/);
  assert.match(deploy.body, /vars\.CLOUDFLARE_PAGES_PROJECT/);
  assert.match(deploy.body, /command: pages deploy "\$\{\{ runner\.temp \}\}\/prepared\/site-artifact" --project-name=\$\{\{ vars\.CLOUDFLARE_PAGES_PROJECT \}\}/);
  assert.doesNotMatch(deploy.body, /\$RUNNER_TEMP|\$CLOUDFLARE_PAGES_PROJECT/);
  assert.doesNotMatch(deploy.body, /--branch(?:=|\s)/);
  assert.ok(project.index < deploy.index);
  assert.match(validate.body, /steps\.deployment\.outputs\.pages-environment/);
  assert.match(validate.body, /steps\.deployment\.outputs\.deployment-url/);
  assert.match(validate.body, /validate-cloudflare-pages-deployment\.mjs/);
  assert.ok(deploy.index < validate.index && validate.index < smoke.index);
  assert.match(smoke.body, /run_smoke pages_dev "\$PAGES_DEV_URL"[\s\S]+run_smoke production "\$PRODUCTION_ORIGIN"/);
  assert.match(releaseWorkflow, /Pages target: Direct Upload default \(no branch override\)/);
  assert.doesNotMatch(releaseWorkflow, /--branch(?:=|\s)|Pages production branch: `main`/);
  assert.doesNotMatch(releaseWorkflow, /actions\/upload-pages-artifact|actions\/deploy-pages|github-pages|id-token:\s*write|pages:\s*write/);
});

test('deployment and online editor smoke use provider-neutral contracts', () => {
  assert.doesNotMatch(deploymentSmoke, /data-cf-beacon|data-analytics-(?:mode|provider|disclosure)|cloudflareinsights|RUM|expectedToken/i);
  assert.doesNotMatch(onlineEditorCheck, /data-analytics-(?:mode|provider|disclosure)|cloudflareinsights|RUM|siteToken|expectedToken/i);
  assert.doesNotMatch(networkContract, /cloudflareinsights|RUM|siteToken|expectedToken/i);
  assert.match(onlineEditorCheck, /context\.request\.get\(new URL\(examplePath, base\)\.href, \{ maxRedirects: 0 \}\)/);
  assert.match(onlineEditorCheck, /assert\.equal\(response\.status\(\), 200/);
});

test('CI installs only the browser binaries required by headless execution', () => {
  assert.match(qualityWorkflow, /npx playwright install --with-deps --only-shell chromium webkit/);
  assert.equal(releaseWorkflow.match(/npx playwright install --with-deps --only-shell chromium/g)?.length, 1);
  assert.doesNotMatch(playwrightConfig, /\bchannel\s*:/);
  assert.doesNotMatch(playwrightConfig, /\bheadless\s*:\s*false/);
});

test('browser binaries are not restored through an Actions cache', () => {
  assert.doesNotMatch(qualityWorkflow, /actions\/cache@/);
  assert.doesNotMatch(releaseWorkflow, /actions\/cache@/);
});
