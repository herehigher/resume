import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { setReleaseVersion } from '../scripts/set-release-version.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));

function fixture(t) {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'resume-version-'));
  t.after(() => rmSync(directory, { force: true, recursive: true }));
  for (const entry of ['package.json', 'package-lock.json', 'CHANGELOG.md', 'site']) {
    cpSync(path.join(root, entry), path.join(directory, entry), { recursive: true });
  }
  return directory;
}

test('one version operation synchronizes package, lock, application, and changelog', async (t) => {
  const directory = fixture(t);
  await setReleaseVersion({ date: '2026-09-05', rootDirectory: directory, version: '0.2.3' });
  assert.equal(JSON.parse(readFileSync(path.join(directory, 'package.json'))).version, '0.2.3');
  assert.equal(JSON.parse(readFileSync(path.join(directory, 'package-lock.json'))).version, '0.2.3');
  assert.match(readFileSync(path.join(directory, 'site/assets/js/config.js'), 'utf8'), /APP_VERSION = '0\.2\.3'/);
  assert.match(readFileSync(path.join(directory, 'CHANGELOG.md'), 'utf8'), /## \[0\.2\.3\] - 2026-09-05/);
});

test('version operation rejects prereleases and malformed dates', async (t) => {
  const directory = fixture(t);
  await assert.rejects(setReleaseVersion({ date: '2026/09/05', rootDirectory: directory, version: '0.2.3' }), /date/);
  await assert.rejects(setReleaseVersion({ date: '2026-09-05', rootDirectory: directory, version: '0.2.3-rc.1' }), /SemVer/);
  await assert.rejects(setReleaseVersion({ date: '2026-02-30', rootDirectory: directory, version: '0.2.3' }), /real/);
  await assert.rejects(setReleaseVersion({ date: '2026-09-05', rootDirectory: 'relative', version: '0.2.3' }), /absolute/);
});
