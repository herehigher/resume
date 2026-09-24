import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { verifyCloudflarePagesProject } from '../scripts/verify-cloudflare-pages-project.mjs';

const scriptPath = fileURLToPath(new URL('../scripts/verify-cloudflare-pages-project.mjs', import.meta.url));

const expected = {
  expectedProjectName: 'resume-studio',
  expectedProductionBranch: 'main',
  previewBranch: 'release-preflight-v0.5.1'
};

function projectResponse(productionBranch = 'main', name = 'resume-studio') {
  return { success: true, result: { name, production_branch: productionBranch } };
}

test('confirms Cloudflare project identity and configured production branch before deployment', () => {
  assert.equal(verifyCloudflarePagesProject({ ...expected, projectResponse: projectResponse() }), 'main');
});

test('fails closed if Cloudflare project or production branch differs or collides with preview', () => {
  assert.throws(() => verifyCloudflarePagesProject({
    ...expected,
    projectResponse: projectResponse('release-preflight-v0.5.1')
  }), /does not match the Cloudflare project/);
  assert.throws(() => verifyCloudflarePagesProject({
    ...expected,
    expectedProductionBranch: 'release-preflight-v0.5.1',
    projectResponse: projectResponse('release-preflight-v0.5.1')
  }), /collides with the Cloudflare production branch/);
  assert.throws(() => verifyCloudflarePagesProject({
    ...expected,
    projectResponse: projectResponse('main', 'different-project')
  }), /different Pages project/);
  assert.throws(() => verifyCloudflarePagesProject({
    ...expected,
    projectResponse: { success: false, result: {} }
  }), /did not confirm the configured Pages project/);
});

test('CLI reads only the project response file and prints the verified branch', () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'cloudflare-pages-project-'));
  try {
    const responsePath = path.join(directory, 'project.json');
    writeFileSync(responsePath, JSON.stringify(projectResponse()), 'utf8');
    const result = spawnSync(process.execPath, [scriptPath,
      '--response', responsePath,
      '--project-name', expected.expectedProjectName,
      '--production-branch', expected.expectedProductionBranch,
      '--preview-branch', expected.previewBranch], { encoding: 'utf8' });
    assert.equal(result.status, 0);
    assert.equal(result.stdout.trim(), 'main');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
