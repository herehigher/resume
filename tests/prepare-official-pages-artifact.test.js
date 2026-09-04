import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { prepareOfficialPagesArtifact } from '../scripts/prepare-official-pages-artifact.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const token = 'a'.repeat(32);

function fixture(overrides = {}) {
  const calls = [];
  return {
    calls,
    run: () => prepareOfficialPagesArtifact({
      cwd: root,
      environment: {
        GITHUB_ACTIONS: 'true',
        GITHUB_REPOSITORY: 'herehigher/resume',
        RUNNER_TEMP: '/tmp/runner',
        ...overrides
      },
      operations: {
        prepareArtifact: async (input) => calls.push(input),
        readProviderValue: async () => overrides.providerValue ?? token
      }
    })
  };
}

test('official Pages wrapper keeps the provider value inside the runner process', async () => {
  const prepared = fixture();
  await prepared.run();
  assert.deepEqual(prepared.calls, [{
    manifestPath: path.join(root, '.github/pages-release-manifest.json'),
    outputDirectory: '/tmp/runner/resume-pages-site',
    repository: 'herehigher/resume',
    sourceDirectory: path.join(root, 'site'),
    token
  }]);
});

test('official Pages wrapper rejects non-runner, fork, temporary path, and missing provider failures', async () => {
  for (const overrides of [
    { GITHUB_ACTIONS: 'false' },
    { GITHUB_REPOSITORY: 'fork/resume' },
    { RUNNER_TEMP: 'relative' },
    { providerValue: '' }
  ]) {
    const prepared = fixture(overrides);
    await assert.rejects(prepared.run(), /Official Pages artifact preparation failed/);
    assert.deepEqual(prepared.calls, []);
  }
});
