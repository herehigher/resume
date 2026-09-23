import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { validateDeploymentArtifact } from '../scripts/validate-pages-smoke.mjs';

const oldProductionOrigin = 'https://herehigher.github.io/resume/';
const packageVersion = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
const publicationCommand = fileURLToPath(new URL('../scripts/release-publication.mjs', import.meta.url));

function fixture(t) {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'resume-legacy-release-policy-'));
  t.after(() => rmSync(directory, { force: true, recursive: true }));
  const site = path.join(directory, 'site');
  cpSync(new URL('../site', import.meta.url), site, { recursive: true });
  return { directory, site };
}

test('publication command has no legacy rollback entry point', () => {
  for (const tag of ['v0.2.2', 'v0.2.1', 'v0.2.0']) {
    const rejected = spawnSync(process.execPath, [publicationCommand, 'rollback', '--tag', tag], { encoding: 'utf8' });
    assert.notEqual(rejected.status, 0, tag);
    assert.match(rejected.stderr, /expected publish command/, tag);
  }
});

test('root smoke rejects metadata from the retired GitHub Pages mount', async (t) => {
  const { site } = fixture(t);
  const entry = path.join(site, 'index.html');
  writeFileSync(entry, readFileSync(entry, 'utf8').replace('href="https://rs.herehigher.com/"', `href="${oldProductionOrigin}"`));
  await assert.rejects(validateDeploymentArtifact({ directory: site, packageVersion }), /canonical URL is invalid/);
});
