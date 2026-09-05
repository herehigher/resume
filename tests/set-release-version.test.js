import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { setReleaseVersion } from '../scripts/set-release-version.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));

function fixture(t) {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'resume-version-'));
  t.after(() => rmSync(directory, { force: true, recursive: true }));
  const metadata = { name: 'fictional-version-fixture', version: '7.4.1' };
  mkdirSync(path.join(directory, 'site/assets/js'), { recursive: true });
  writeFileSync(path.join(directory, 'package.json'), JSON.stringify(metadata));
  writeFileSync(path.join(directory, 'package-lock.json'), JSON.stringify({ ...metadata, packages: { '': metadata } }));
  writeFileSync(path.join(directory, 'site/assets/js/config.js'), "export const APP_VERSION = '7.4.1';\n");
  writeFileSync(path.join(directory, 'CHANGELOG.md'), '# Changelog\n\n## [Unreleased]\n\n- Fictional change.\n');
  return directory;
}

test('one version operation synchronizes package, lock, application, and changelog', async (t) => {
  const directory = fixture(t);
  await setReleaseVersion({ date: '2001-02-03', rootDirectory: directory, version: '7.4.2' });
  assert.equal(JSON.parse(readFileSync(path.join(directory, 'package.json'))).version, '7.4.2');
  assert.equal(JSON.parse(readFileSync(path.join(directory, 'package-lock.json'))).version, '7.4.2');
  assert.match(readFileSync(path.join(directory, 'site/assets/js/config.js'), 'utf8'), /APP_VERSION = '7\.4\.2'/);
  assert.match(readFileSync(path.join(directory, 'CHANGELOG.md'), 'utf8'), /## \[7\.4\.2\] - 2001-02-03/);
  await assert.rejects(setReleaseVersion({ date: '2001-02-03', rootDirectory: directory, version: '7.4.2' }), /already contains/);
});

test('version operation rejects prereleases and malformed dates', async (t) => {
  const directory = fixture(t);
  await assert.rejects(setReleaseVersion({ date: '2001/02/03', rootDirectory: directory, version: '7.4.2' }), /date/);
  await assert.rejects(setReleaseVersion({ date: '2001-02-03', rootDirectory: directory, version: '7.4.2-rc.1' }), /SemVer/);
  await assert.rejects(setReleaseVersion({ date: '2001-02-30', rootDirectory: directory, version: '7.4.2' }), /real/);
  await assert.rejects(setReleaseVersion({ date: '2001-02-03', rootDirectory: 'relative', version: '7.4.2' }), /absolute/);
});

test('the actual version CLI updates a separate checkout and rejects duplicate release entries', (t) => {
  const directory = fixture(t);
  const command = path.join(root, 'scripts/set-release-version.mjs');
  const invoke = () => spawnSync(process.execPath, [command, '7.4.2', '2001-02-03'], { cwd: directory, encoding: 'utf8' });
  const result = invoke();
  assert.equal(result.status, 0, result.stderr);
  const lock = JSON.parse(readFileSync(path.join(directory, 'package-lock.json'), 'utf8'));
  assert.equal(lock.packages[''].version, '7.4.2');
  const repeated = invoke();
  assert.notEqual(repeated.status, 0);
  assert.match(repeated.stderr, /already contains/);
});
