import { appendFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const fullCommitPattern = /^[0-9a-f]{40}$/;
const positiveId = /^[1-9][0-9]*$/;
const versionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

function fail(message) {
  throw new Error(`Release asset status failed: ${message}`);
}

function requireValue(condition, message) {
  if (!condition) fail(message);
}

export function classifyReleaseAssetCheck({ assetsChanged, assetsRequired }) {
  requireValue(typeof assetsChanged === 'boolean' && typeof assetsRequired === 'boolean',
    'asset requirement values must be booleans');
  if (!assetsRequired && !assetsChanged) return 'not-required';
  if (!assetsRequired && assetsChanged) return 'versionless-asset-change';
  if (assetsRequired && !assetsChanged) return 'promotion-required';
  return 'verification-required';
}

function promotionFields({ artifactName, candidateVersion, pullRequestNumber, qualityRunId, sourceMergeSha }) {
  requireValue(versionPattern.test(candidateVersion || ''), 'candidate version is invalid');
  requireValue(positiveId.test(String(pullRequestNumber || '')), 'pull request number is invalid');
  requireValue(positiveId.test(String(qualityRunId || '')), 'Quality run ID is invalid');
  requireValue(fullCommitPattern.test(sourceMergeSha || ''), 'source merge SHA is invalid');
  requireValue(artifactName === `documentation-assets-${sourceMergeSha}`, 'artifact name is invalid');
  return { artifactName, candidateVersion, pullRequestNumber: String(pullRequestNumber), qualityRunId: String(qualityRunId), sourceMergeSha };
}

export function promotionRequiredReport(fields) {
  const identity = promotionFields(fields);
  return {
    annotation: `Promotion required for v${identity.candidateVersion}; Quality run ${identity.qualityRunId} has the exact documentation evidence.`,
    summary: [
      '## Promotion required',
      '',
      'Quality (product and tests) succeeded. Release assets are intentionally not current yet, so this required check remains failed.',
      '',
      `- Candidate version: \`${identity.candidateVersion}\``,
      `- Quality run ID: \`${identity.qualityRunId}\``,
      `- Source merge SHA: \`${identity.sourceMergeSha}\``,
      `- Artifact: \`${identity.artifactName}\``,
      '',
      'Next step (from a clean checkout of this candidate branch):',
      '',
      `\`npm run promote:pr-doc-assets -- --pr ${identity.pullRequestNumber}\``,
      '',
      'This only retrieves and verifies the exact Quality artifact, then updates the seven reviewable release asset files. Review and commit those files to this pull request; it does not approve, merge, tag, push, or publish.'
    ].join('\n')
  };
}

export function releaseAssetFailureReport(category) {
  const reports = {
    'quality-failure': {
      annotation: 'Quality did not succeed, so release asset currentness was not assessed.',
      summary: '## Quality failure\n\nProduct or test Quality did not succeed. Release asset currentness was not assessed; fix and rerun Quality before attempting promotion.'
    },
    'versionless-asset-change': {
      annotation: 'Release documentation assets changed without a package version change.',
      summary: '## Release asset policy failure\n\nRelease documentation assets changed without a package version change. Split the asset change from this pull request; this is not a promotion waiting state.'
    },
    'provenance-invalid': {
      annotation: 'Committed release asset provenance is invalid.',
      summary: '## Release asset provenance failure\n\nThe committed manifest cannot identify a valid promoted Quality artifact. This is not a promotion waiting state; repair the manifest or asset provenance in a new commit.'
    },
    'current-evidence-unavailable': {
      annotation: 'The current Quality documentation artifact is unavailable.',
      summary: '## Current Quality evidence unavailable\n\nThe documentation artifact from this pull request’s successful Quality run could not be downloaded. Re-run Quality if its artifact expired; do not treat this as a completed promotion.'
    },
    'promoted-evidence-unavailable': {
      annotation: 'The artifact recorded by committed promotion provenance is unavailable or expired.',
      summary: '## Promoted Quality artifact unavailable\n\nThe artifact recorded by the committed manifest is unavailable or expired. This is not a promotion waiting state; obtain fresh Quality evidence and promote it again before merging.'
    },
    'asset-integrity-mismatch': {
      annotation: 'Release asset bytes or their generation contract do not match Quality evidence.',
      summary: '## Release asset integrity failure\n\nThe committed assets, manifest digests, or generation contract do not match the verified Quality evidence. This is not a promotion waiting state; repair the mismatched asset set and rerun the check.'
    }
  };
  requireValue(reports[category], 'failure category is invalid');
  return reports[category];
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [command, ...args] = process.argv.slice(2);
    let report;
    if (command === 'classify') {
      const [required, changed] = args;
      requireValue((required === 'true' || required === 'false') && (changed === 'true' || changed === 'false'),
        'classify expects required and changed booleans');
      const classification = classifyReleaseAssetCheck({ assetsChanged: changed === 'true', assetsRequired: required === 'true' });
      if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `classification=${classification}\n`);
      console.log(`Release asset check classification: ${classification}.`);
    } else if (command === 'promotion-required') {
      const [candidateVersion, pullRequestNumber, qualityRunId, sourceMergeSha, artifactName] = args;
      report = promotionRequiredReport({ artifactName, candidateVersion, pullRequestNumber, qualityRunId, sourceMergeSha });
    } else if (command === 'failure') {
      report = releaseAssetFailureReport(args[0]);
    } else {
      fail('expected classify, promotion-required, or failure command');
    }
    if (report) {
      if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${report.summary}\n`);
      console.log(`::error title=Release assets current::${report.annotation}`);
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
