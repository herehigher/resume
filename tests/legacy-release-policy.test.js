import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const publicationCommand = fileURLToPath(new URL('../scripts/release-publication.mjs', import.meta.url));

test('publication command has no legacy rollback entry point', () => {
  const rejected = spawnSync(process.execPath, [publicationCommand, 'rollback', '--tag', 'v0.2.2'], { encoding: 'utf8' });
  assert.notEqual(rejected.status, 0);
  assert.match(rejected.stderr, /expected publish command/);
});
