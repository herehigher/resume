import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const qualityWorkflow = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
const releaseWorkflow = readFileSync(new URL('../.github/workflows/release.yml', import.meta.url), 'utf8');
const playwrightConfig = readFileSync(new URL('../playwright.config.js', import.meta.url), 'utf8');

const qualityWorkflowStructure = JSON.parse(execFileSync('ruby', ['-e', [
  "require 'json'",
  "require 'yaml'",
  "puts JSON.generate(YAML.load_file(ARGV.fetch(0)))"
].join('; '), fileURLToPath(new URL('../.github/workflows/ci.yml', import.meta.url))], { encoding: 'utf8' }));

function qualityStep(name) {
  const step = qualityWorkflowStructure.jobs['release-assets-current'].steps.find((item) => item.name === name);
  assert.ok(step, `missing workflow step: ${name}`);
  return step;
}

function qualityStepIndex(name) {
  return qualityWorkflowStructure.jobs['release-assets-current'].steps.findIndex((item) => item.name === name);
}

test('quality cancels superseded pull request runs without grouping main runs', () => {
  assert.match(qualityWorkflow, /group: quality-\$\{\{ github\.event_name == 'pull_request' && github\.event\.pull_request\.number \|\| github\.run_id \}\}/);
  assert.match(qualityWorkflow, /cancel-in-progress: \$\{\{ github\.event_name == 'pull_request' \}\}/);
});

test('quality classifies scope after its primary checkout', () => {
  const qualitySteps = qualityWorkflowStructure.jobs.quality.steps;
  assert.ok(qualitySteps.findIndex((step) => step.name === 'Checkout') < qualitySteps.findIndex((step) => step.name === 'Classify pull request scope'));
  assert.doesNotMatch(qualityWorkflow, /^ {2}scope:\s*$/m);
  assert.match(qualityWorkflow, /quality:[\s\S]+- name: Checkout[\s\S]+- name: Classify pull request scope[\s\S]+- name: Setup Node\.js/);
  assert.doesNotMatch(qualityWorkflow, /needs\.scope/);
  assert.match(qualityWorkflow, /steps\.scope\.outputs\.docs_only/);
  assert.match(qualityWorkflow, /id: scope\s+if: [^\n]+\s+continue-on-error: true/);
  assert.match(qualityWorkflow, /always\(\) && github\.event_name == 'pull_request' && steps\.scope\.outcome == 'failure'/);
});

test('release asset currentness is a separate check after Quality uploads evidence', () => {
  assert.match(qualityWorkflow, /Classify release documentation asset requirement/);
  assert.match(qualityWorkflow, /release-doc-assets\.mjs required/);
  assert.match(qualityWorkflow, /quality:[\s\S]+outputs:[\s\S]+release_assets_required:[\s\S]+Upload documentation asset evidence/);
  assert.match(qualityWorkflow, /release_assets_changed: \$\{\{ steps\.release_assets\.outputs\.changed \}\}/);
  assert.match(qualityWorkflow, /release-assets-current:[\s\S]+name: Release assets current[\s\S]+needs: quality/);
  assert.match(qualityWorkflow, /github\.event_name == 'pull_request' }}\s+runs-on:[\s\S]+Report Quality failure[\s\S]+needs\.quality\.result != 'success'/);
  assert.match(qualityWorkflow, /Download documentation asset evidence[\s\S]+Verify release documentation assets are current/);
  assert.match(qualityWorkflow, /steps\.classification\.outputs\.classification == 'verification-required'/);
  assert.match(qualityWorkflow, /release-assets-current:[\s\S]+lfs: true/);
  assert.match(qualityWorkflow, /--quality-run-id "\$\{QUALITY_RUN_ID\}"/);
  assert.match(qualityWorkflow, /Resolve promoted Quality artifact provenance[\s\S]+Download the originally promoted Quality artifact/);
  assert.match(qualityWorkflow, /release-doc-assets\.mjs compare[\s\S]+--promoted-root "\$\{PROMOTED_ASSET_DIRECTORY\}"[\s\S]+--source-sha "\$\{SOURCE_SHA\}"/);
  assert.match(qualityWorkflow, /Reject release asset changes outside a version pull request[\s\S]+versionless-asset-change[\s\S]+exit 1/);
});

test('release asset status distinguishes promotion waiting from Quality, provenance, expiry, and integrity failures', () => {
  assert.match(qualityWorkflow, /Record actual Quality run identity[\s\S]+run_id=\$\{GITHUB_RUN_ID\}/);
  assert.match(qualityWorkflow, /Classify release asset check[\s\S]+release-assets-summary\.mjs classify/);
  assert.match(qualityWorkflow, /Resolve exact current Quality evidence[\s\S]+promote-pr-doc-assets\.mjs evidence[\s\S]+--quality-run-id "\$\{QUALITY_RUN_ID\}"[\s\S]+--source-merge-sha "\$\{SOURCE_MERGE_SHA\}"/);
  assert.match(qualityWorkflow, /Report promotion required[\s\S]+promotion-required "\$CANDIDATE_VERSION" "\$PR_NUMBER" "\$QUALITY_RUN_ID" "\$SOURCE_MERGE_SHA" "\$ARTIFACT_NAME"[\s\S]+exit 1/);
  assert.match(qualityWorkflow, /Report invalid committed provenance[\s\S]+failure provenance-invalid[\s\S]+Report unavailable promoted Quality artifact[\s\S]+failure promoted-evidence-unavailable[\s\S]+Report release asset integrity mismatch[\s\S]+failure asset-integrity-mismatch/);
});

test('release asset reporting always runs after a minimal checkout and gates each classification path', () => {
  const job = qualityWorkflowStructure.jobs['release-assets-current'];
  assert.equal(job.if, '${' + "{ always() && github.event_name == 'pull_request' }}");

  const summaryCheckout = qualityStep('Checkout workflow summary tooling');
  assert.equal(summaryCheckout.uses, 'actions/checkout@v7');
  assert.equal(summaryCheckout.with['fetch-depth'], 1);
  assert.equal(summaryCheckout.with['persist-credentials'], false);
  assert.equal(summaryCheckout.with.lfs, undefined);
  for (const name of [
    'Report Quality failure', 'Classify release asset check',
    'Report release assets are not required', 'Reject release asset changes outside a version pull request'
  ]) assert.ok(qualityStepIndex('Checkout workflow summary tooling') < qualityStepIndex(name), `${name} must follow the summary checkout`);

  assert.match(qualityStep('Report Quality failure').if, /needs\.quality\.result != 'success'/);
  assert.match(qualityStep('Classify release asset check').if, /needs\.quality\.result == 'success'/);
  assert.match(qualityStep('Report release assets are not required').if, /classification == 'not-required'/);
  assert.match(qualityStep('Reject release asset changes outside a version pull request').if, /classification == 'versionless-asset-change'/);
  assert.match(qualityStep('Report promotion required').if, /classification == 'promotion-required'/);
  assert.match(qualityStep('Install documentation asset verification dependencies').if, /classification == 'verification-required'/);

  const verificationCheckout = qualityStep('Checkout release asset verification source');
  assert.equal(verificationCheckout.with.lfs, true);
  assert.ok(qualityStepIndex('Checkout workflow summary tooling') < qualityStepIndex('Checkout release asset verification source'));
});

test('release preparation checks committed assets against the final Quality evidence', () => {
  assert.match(releaseWorkflow, /Download exact Quality documentation assets[\s\S]+Verify release documentation assets are current for final Quality source[\s\S]+Prepare the single Pages artifact/);
  assert.match(releaseWorkflow, /documentation-assets-\$\{\{ needs\.authorize\.outputs\.release_sha \}\}/);
  assert.match(releaseWorkflow, /run-id: \$\{\{ steps\.quality\.outputs\.run_id \}\}/);
  assert.match(releaseWorkflow, /git -C "\$RUNNER_TEMP\/release-source" lfs pull/);
  assert.match(releaseWorkflow, /release-doc-assets\.mjs compare-current[\s\S]+--generated-root "\$\{\{ runner\.temp \}\}\/quality-documentation-assets"[\s\S]+--source-sha "\$\{SOURCE_SHA\}"/);
  assert.doesNotMatch(releaseWorkflow, /Download the originally promoted Quality artifact|promoted-documentation-assets/);
});

test('a merged version pull request is the standard publication authorization', () => {
  assert.match(releaseWorkflow, /workflow_run:[\s\S]+workflows: \[Quality\][\s\S]+types: \[completed\]/);
  assert.match(releaseWorkflow, /workflow_run\.conclusion == 'success'[\s\S]+workflow_run\.event == 'push'[\s\S]+workflow_run\.head_branch == github\.event\.repository\.default_branch/);
  assert.match(releaseWorkflow, /validate-release-run\.mjs quality --sha "\$release_sha" --run-id "\$quality_run_id"/);
  assert.match(releaseWorkflow, /commits\/\$release_sha\/pulls[\s\S]+base_sha="\$\(jq -r '\.\[0\]\.base\.sha'[\s\S]+release-doc-assets\.mjs required/);
  assert.match(releaseWorkflow, /\.merged_at != null[\s\S]+\.base\.repo\.full_name == \$repository[\s\S]+\.merge_commit_sha == \$sha/);
  assert.match(releaseWorkflow, /package_version" != "\$current_version"[\s\S]+release_required=false[\s\S]+Stale release ignored/);
  assert.doesNotMatch(releaseWorkflow, /mode=publish|prepared_run_id|inputs\.prepared_artifact_id/);
});

test('prepare, tag, and deploy reuse one exact artifact under the production lock', () => {
  assert.match(releaseWorkflow, /publish:[\s\S]+needs: \[authorize, prepare\][\s\S]+artifact-ids: \$\{\{ needs\.prepare\.outputs\.prepared_artifact_id \}\}[\s\S]+run-id: \$\{\{ github\.run_id \}\}/);
  assert.match(releaseWorkflow, /publish:[\s\S]+concurrency:[\s\S]+group: pages-production[\s\S]+Recheck current version under the production lock[\s\S]+prepared_version" = "\$current_version"[\s\S]+Reverify bytes and create or resume the immutable tag[\s\S]+Verify original bytes against the tagged source[\s\S]+Deploy to GitHub Pages/);
  assert.doesNotMatch(releaseWorkflow, /^concurrency:/m);
});

test('CI installs only the browser binaries required by headless execution', () => {
  assert.match(qualityWorkflow, /npx playwright install --with-deps --only-shell chromium webkit/);
  assert.equal(releaseWorkflow.match(/npx playwright install --with-deps --only-shell chromium/g)?.length, 2);
  assert.doesNotMatch(playwrightConfig, /\bchannel\s*:/);
  assert.doesNotMatch(playwrightConfig, /\bheadless\s*:\s*false/);
});

test('browser binaries are not restored through an Actions cache', () => {
  assert.doesNotMatch(qualityWorkflow, /actions\/cache@/);
  assert.doesNotMatch(releaseWorkflow, /actions\/cache@/);
});
