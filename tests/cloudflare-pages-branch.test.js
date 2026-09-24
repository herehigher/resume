import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { validateCloudflarePagesBranch } from '../scripts/validate-cloudflare-pages-branch.mjs';

const scriptPath = fileURLToPath(new URL('../scripts/validate-cloudflare-pages-branch.mjs', import.meta.url));

test('accepts the configured Cloudflare production branch and ordinary nested Git branch names', () => {
  assert.equal(validateCloudflarePagesBranch('main'), 'main');
  assert.equal(validateCloudflarePagesBranch('release/0.4.1'), 'release/0.4.1');
});

test('rejects empty, malformed, or command-shaped Pages branch names', () => {
  for (const branch of [
    '',
    '../main',
    'release//0.4.1',
    'release/../main',
    '.hidden',
    'main.lock',
    'main;--commit-hash=deadbeef',
    'main --branch=preview',
    'a'.repeat(256)
  ]) {
    assert.throws(() => validateCloudflarePagesBranch(branch));
  }
});

test('branch validator CLI prints only a validated branch', () => {
  const accepted = spawnSync(process.execPath, [scriptPath, '--branch', 'main'], { encoding: 'utf8' });
  assert.equal(accepted.status, 0);
  assert.equal(accepted.stdout.trim(), 'main');

  const rejected = spawnSync(process.execPath, [scriptPath, '--branch', 'main;--branch=preview'], { encoding: 'utf8' });
  assert.equal(rejected.status, 1);
});
