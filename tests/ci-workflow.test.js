import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const qualityWorkflow = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
const releaseWorkflow = readFileSync(new URL('../.github/workflows/release.yml', import.meta.url), 'utf8');
const candidateWorkflow = readFileSync(new URL('../.github/workflows/release-candidate-assets.yml', import.meta.url), 'utf8');
const playwrightConfig = readFileSync(new URL('../playwright.config.js', import.meta.url), 'utf8');

function workflowJobBlock(workflow, name) {
  const start = workflow.indexOf(`  ${name}:\n`);
  assert.notEqual(start, -1, `missing workflow job: ${name}`);
  const nextJob = workflow.slice(start + 1).search(/^ {2}[a-z][\w-]*:\n/m);
  return nextJob === -1 ? workflow.slice(start) : workflow.slice(start, start + 1 + nextJob);
}

const releaseAssetsCurrentJob = workflowJobBlock(qualityWorkflow, 'release-assets-current');
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
  assert.match(candidateWorkflow, /workflow_dispatch:[\s\S]+candidate_ref:[\s\S]+candidate_sha:/);
  assert.match(candidateWorkflow, /Checkout trusted workflow control[\s\S]+ref: \$\{\{ github\.sha \}\}[\s\S]+persist-credentials: false/);
  assert.match(candidateWorkflow, /Resolve official candidate branch[\s\S]+git fetch --no-tags origin "refs\/heads\/\$CANDIDATE_REF"[\s\S]+rev-parse FETCH_HEAD/);
  assert.match(candidateWorkflow, /Checkout immutable candidate source[\s\S]+ref: \$\{\{ inputs\.candidate_sha \}\}/);
  assert.match(candidateWorkflow, /producer-kind release-candidate[\s\S]+producer-workflow \.github\/workflows\/release-candidate-assets\.yml[\s\S]+producer-run-attempt/);
  assert.match(candidateWorkflow, /Upload candidate documentation evidence[\s\S]+release-candidate-documentation-assets-\$\{\{ inputs\.candidate_sha \}\}-attempt-\$\{\{ github\.run_attempt \}\}/);
  assert.doesNotMatch(candidateWorkflow, /npm test|test:e2e|workflow_call/);
});

test('release asset currentness compares candidate evidence after final Quality uploads evidence', () => {
  assert.match(qualityWorkflow, /Classify release documentation asset requirement/);
  assert.match(qualityWorkflow, /release-doc-assets\.mjs required/);
  assert.match(qualityWorkflow, /quality:[\s\S]+outputs:[\s\S]+release_assets_required:[\s\S]+Upload documentation asset evidence/);
  assert.match(qualityWorkflow, /release_assets_changed: \$\{\{ steps\.release_assets\.outputs\.changed \}\}/);
  assert.match(qualityWorkflow, /release-assets-current:[\s\S]+name: Release assets current[\s\S]+needs: quality/);
  assert.match(qualityWorkflow, /needs\.quality\.result == 'success' }}\s+runs-on/);
  assert.match(qualityWorkflow, /Download final Quality documentation evidence[\s\S]+Download the originally promoted candidate artifact[\s\S]+Verify release documentation assets are current/);
  assert.match(qualityWorkflow, /steps\.classification\.outputs\.classification == 'verification-required'/);
  assert.match(qualityWorkflow, /release-assets-current:[\s\S]+Materialize release asset LFS files/);
  assert.match(qualityWorkflow, /--quality-run-id "\$\{QUALITY_RUN_ID\}"/);
  assert.match(qualityWorkflow, /Resolve promoted Quality artifact provenance[\s\S]+Resolve exact candidate artifact identity[\s\S]+artifact-ids: \$\{\{ steps\.candidate_evidence\.outputs\.artifact_id \}\}/);
  assert.match(qualityWorkflow, /release-doc-assets\.mjs compare[\s\S]+--promoted-root "\$\{PROMOTED_ASSET_DIRECTORY\}"[\s\S]+--source-sha "\$\{SOURCE_SHA\}"/);
  assert.match(qualityWorkflow, /Reject release asset changes outside a version pull request[\s\S]+versionless-asset-change[\s\S]+exit 1/);
});

test('release asset status treats missing assets as a real failure and skips duplicate failure after Quality fails', () => {
  assert.match(qualityWorkflow, /Record actual Quality run identity[\s\S]+run_id=\$\{GITHUB_RUN_ID\}/);
  assert.match(qualityWorkflow, /Classify release asset check[\s\S]+release-assets-summary\.mjs classify/);
  assert.match(qualityWorkflow, /Report missing release documentation assets[\s\S]+failure release-assets-missing[\s\S]+exit 1/);
  assert.match(qualityWorkflow, /candidate-evidence[\s\S]+--run-attempt "\$\{RUN_ATTEMPT\}"[\s\S]+--control-sha "\$\{CONTROL_SHA\}"/);
  assert.match(qualityWorkflow, /Report invalid committed provenance[\s\S]+failure provenance-invalid[\s\S]+Report unavailable candidate artifact evidence[\s\S]+failure promoted-evidence-unavailable[\s\S]+Report release asset integrity mismatch[\s\S]+failure asset-integrity-mismatch/);
});

test('release asset reporting uses one authoritative checkout and gates each classification path', () => {
  assert.match(releaseAssetsCurrentJob, /^ {4}if: \$\{\{ always\(\) && github\.event_name == 'pull_request' && needs\.quality\.result == 'success' \}\}$/m);

  const authoritativeCheckout = workflowStep(releaseAssetsCurrentJob, 'Checkout authoritative release asset source');
  assert.equal(workflowStepField(authoritativeCheckout, 'uses'), 'actions/checkout@v7');
  assert.equal(workflowStepField(authoritativeCheckout, 'fetch-depth'), '0');
  assert.equal(workflowStepField(authoritativeCheckout, 'persist-credentials'), 'false');
  assert.equal(workflowStepField(authoritativeCheckout, 'lfs'), undefined);
  assert.equal((releaseAssetsCurrentJob.match(/uses: actions\/checkout@v7/g) || []).length, 1);
  for (const name of [
    'Classify release asset check',
    'Report release assets are not required', 'Reject release asset changes outside a version pull request'
  ]) assert.ok(authoritativeCheckout.index < workflowStep(releaseAssetsCurrentJob, name).index, `${name} must follow the authoritative checkout`);

  assert.equal(workflowStepField(workflowStep(releaseAssetsCurrentJob, 'Classify release asset check'), 'if'), undefined);
  assert.match(workflowStepField(workflowStep(releaseAssetsCurrentJob, 'Report release assets are not required'), 'if'), /classification == 'not-required'/);
  assert.match(workflowStepField(workflowStep(releaseAssetsCurrentJob, 'Reject release asset changes outside a version pull request'), 'if'), /classification == 'versionless-asset-change'/);
  assert.match(workflowStepField(workflowStep(releaseAssetsCurrentJob, 'Report missing release documentation assets'), 'if'), /classification == 'promotion-required'/);
  assert.match(workflowStepField(workflowStep(releaseAssetsCurrentJob, 'Install documentation asset verification dependencies'), 'if'), /classification == 'verification-required'/);

  const lfsMaterialization = workflowStep(releaseAssetsCurrentJob, 'Materialize release asset LFS files');
  assert.match(workflowStepField(lfsMaterialization, 'if'), /classification == 'verification-required'/);
  for (const asset of [
    'docs/screenshots/en.png', 'docs/screenshots/ja.png', 'docs/screenshots/zh-CN.png',
    'output/pdf/en-letter.pdf', 'output/pdf/ja-a4.pdf', 'output/pdf/zh-CN-a4.pdf'
  ]) assert.match(lfsMaterialization.body, new RegExp(asset.replaceAll('.', '\\.')));
  assert.match(lfsMaterialization.body, /git lfs pull/);
  assert.doesNotMatch(releaseAssetsCurrentJob, /lfs: true|git lfs checkout/);
  assert.ok(authoritativeCheckout.index < lfsMaterialization.index);
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
  assert.match(releaseWorkflow, /workflow_run:[\s\S]+workflows: \[Quality\][\s\S]+types: \[completed\][\s\S]+branches: \[main\]/);
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
