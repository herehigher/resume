import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { readRunnerProviderValue } from './github-provider-variable.mjs';
import { OFFICIAL_REPOSITORY, prepareArtifact } from './prepare-pages-artifact.mjs';

function fail(message) {
  throw new Error(`Official Pages artifact preparation failed: ${message}`);
}

export async function prepareOfficialPagesArtifact({
  cwd = process.cwd(),
  environment = process.env,
  operations = {}
} = {}) {
  if (environment.GITHUB_ACTIONS !== 'true') fail('GitHub Actions runner is required');
  if (environment.GITHUB_REPOSITORY !== OFFICIAL_REPOSITORY) fail('official repository is required');
  if (!path.isAbsolute(environment.RUNNER_TEMP || '')) fail('absolute runner temporary storage is required');
  const readProviderValue = operations.readProviderValue || readRunnerProviderValue;
  const prepare = operations.prepareArtifact || prepareArtifact;
  const token = await readProviderValue({ environment });
  if (!token) fail('provider variable is unavailable in the GitHub runner');
  return prepare({
    manifestPath: path.join(cwd, '.github/pages-release-manifest.json'),
    outputDirectory: path.join(environment.RUNNER_TEMP, 'resume-pages-site'),
    repository: OFFICIAL_REPOSITORY,
    sourceDirectory: path.join(cwd, 'site'),
    token
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  prepareOfficialPagesArtifact().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
