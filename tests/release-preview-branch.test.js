import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { releasePreviewBranchForTag } from '../scripts/release-preview-branch.mjs';

const scriptPath = fileURLToPath(new URL('../scripts/release-preview-branch.mjs', import.meta.url));

test('derives a bounded preview branch from a stable immutable release tag', () => {
  assert.equal(releasePreviewBranchForTag('v0.5.1'), 'release-preflight-v0.5.1');
  assert.throws(() => releasePreviewBranchForTag('v0.5.1-rc.1'), /stable SemVer tag/);
  assert.throws(() => releasePreviewBranchForTag('v0.5.1/unsafe'), /stable SemVer tag/);
  assert.throws(() => releasePreviewBranchForTag(`v${'1'.repeat(41)}.2.3`), /too long/);
});

test('preview branch CLI emits only the validated branch', () => {
  const result = spawnSync(process.execPath, [scriptPath, '--tag', 'v0.5.1'], { encoding: 'utf8' });
  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), 'release-preflight-v0.5.1');
});
