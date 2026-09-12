import assert from 'node:assert/strict';
import test from 'node:test';

import {
  classifyReleaseAssetCheck,
  promotionRequiredReport,
  releaseAssetFailureReport
} from '../scripts/release-assets-summary.mjs';

const sourceMergeSha = 'a'.repeat(40);

test('release asset status distinguishes no-op, promotion waiting, and invalid asset changes', () => {
  assert.equal(classifyReleaseAssetCheck({ assetsChanged: false, assetsRequired: false }), 'not-required');
  assert.equal(classifyReleaseAssetCheck({ assetsChanged: true, assetsRequired: false }), 'versionless-asset-change');
  assert.equal(classifyReleaseAssetCheck({ assetsChanged: false, assetsRequired: true }), 'promotion-required');
  assert.equal(classifyReleaseAssetCheck({ assetsChanged: true, assetsRequired: true }), 'verification-required');
  assert.throws(() => classifyReleaseAssetCheck({ assetsChanged: 'false', assetsRequired: true }), /booleans/);
});

test('version bump-only promotion report uses validated Actions identity fields and the #174 entry', () => {
  const artifactName = `documentation-assets-${sourceMergeSha}`;
  const report = promotionRequiredReport({
    artifactName, candidateVersion: '0.3.0', pullRequestNumber: '177', qualityRunId: '456789', sourceMergeSha
  });
  assert.match(report.annotation, /Promotion required for v0\.3\.0/);
  assert.match(report.summary, /^## Promotion required after successful Quality/);
  assert.match(report.summary, /Quality \(product and tests\) succeeded/);
  assert.match(report.summary, /Candidate version: `0\.3\.0`/);
  assert.match(report.summary, /Pull request: `#177`/);
  assert.match(report.summary, /Quality run ID: `456789`/);
  assert.match(report.summary, new RegExp(`Source merge SHA: \`${sourceMergeSha}\``));
  assert.match(report.summary, new RegExp(`Artifact: \`${artifactName}\``));
  assert.match(report.summary, /npm run promote:pr-doc-assets -- --pr 177/);
  assert.match(report.summary, /does not approve, merge, tag, push, or publish/);
  assert.throws(() => promotionRequiredReport({
    artifactName: 'documentation-assets-wrong', candidateVersion: '0.3.0', pullRequestNumber: '177', qualityRunId: '456789', sourceMergeSha
  }), /artifact name/);
});

test('non-waiting release asset failures have separate safe reports', () => {
  for (const category of [
    'quality-failure', 'versionless-asset-change', 'provenance-invalid',
    'current-evidence-github-api-or-artifact-unavailable', 'current-evidence-identity-mismatch',
    'current-evidence-local-tooling-bootstrap-failure', 'promoted-evidence-unavailable', 'asset-integrity-mismatch'
  ]) {
    const report = releaseAssetFailureReport(category);
    assert.match(report.annotation, /[.]$/);
    assert.doesNotMatch(report.summary, /npm run promote:pr-doc-assets/);
  }
  assert.match(releaseAssetFailureReport('versionless-asset-change').summary, /not a promotion waiting state/);
  assert.match(releaseAssetFailureReport('promoted-evidence-unavailable').summary, /unavailable or expired/);
  assert.match(releaseAssetFailureReport('asset-integrity-mismatch').summary, /digests/);
  assert.match(releaseAssetFailureReport('current-evidence-identity-mismatch').summary, /does not match this pull request identity/);
});
