import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const qualityWorkflow = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
const releaseWorkflow = readFileSync(new URL('../.github/workflows/release.yml', import.meta.url), 'utf8');
const playwrightConfig = readFileSync(new URL('../playwright.config.js', import.meta.url), 'utf8');

test('quality cancels superseded pull request runs without grouping main runs', () => {
  assert.match(qualityWorkflow, /group: quality-\$\{\{ github\.event_name == 'pull_request' && github\.event\.pull_request\.number \|\| github\.run_id \}\}/);
  assert.match(qualityWorkflow, /cancel-in-progress: \$\{\{ github\.event_name == 'pull_request' \}\}/);
});

test('quality classifies scope after its primary checkout', () => {
  assert.equal(qualityWorkflow.match(/uses: actions\/checkout@/g)?.length, 2);
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
  assert.match(qualityWorkflow, /release-assets-current:[\s\S]+name: Release assets current[\s\S]+needs: quality/);
  assert.match(qualityWorkflow, /github\.event_name == 'pull_request' && needs\.quality\.result == 'success'/);
  assert.match(qualityWorkflow, /Download documentation asset evidence[\s\S]+Verify release documentation assets are current/);
  assert.match(qualityWorkflow, /needs\.quality\.outputs\.release_assets_required == 'true'/);
  assert.match(qualityWorkflow, /release-assets-current:[\s\S]+lfs: true/);
  assert.match(qualityWorkflow, /--quality-run-id "\$\{QUALITY_RUN_ID\}"/);
  assert.match(qualityWorkflow, /Resolve promoted Quality artifact provenance[\s\S]+Download the originally promoted Quality artifact/);
  assert.match(qualityWorkflow, /release-doc-assets\.mjs compare[\s\S]+--promoted-root "\$\{PROMOTED_ASSET_DIRECTORY\}"[\s\S]+--source-sha "\$\{SOURCE_SHA\}"/);
});

test('release preparation checks committed assets against the final Quality evidence', () => {
  assert.match(releaseWorkflow, /Download exact Quality documentation assets[\s\S]+Verify release documentation assets are current for final Quality source[\s\S]+Prepare the single Pages artifact/);
  assert.match(releaseWorkflow, /documentation-assets-\$\{\{ needs\.authorize\.outputs\.release_sha \}\}/);
  assert.match(releaseWorkflow, /run-id: \$\{\{ steps\.quality\.outputs\.run_id \}\}/);
  assert.match(releaseWorkflow, /git -C "\$RUNNER_TEMP\/release-source" lfs pull/);
  assert.match(releaseWorkflow, /Resolve promoted Quality artifact provenance[\s\S]+Download the originally promoted Quality artifact/);
  assert.match(releaseWorkflow, /release-doc-assets\.mjs compare[\s\S]+--promoted-root "\$\{\{ runner\.temp \}\}\/promoted-documentation-assets"[\s\S]+--source-sha "\$\{SOURCE_SHA\}"/);
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
