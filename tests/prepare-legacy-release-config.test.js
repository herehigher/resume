import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { prepareLegacyReleaseConfig } from '../scripts/prepare-legacy-release-config.mjs';

function fixture(t, manifest) {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'resume-legacy-config-'));
  t.after(() => rmSync(directory, { force: true, recursive: true }));
  mkdirSync(path.join(directory, '.github'));
  writeFileSync(path.join(directory, '.github/pages-release-manifest.json'), JSON.stringify(manifest));
  return { output: path.join(directory, 'config.json'), source: directory };
}

test('legacy adapter retains only the accepted analytics configuration', async (t) => {
  const { output, source } = fixture(t, {
    analyticsMode: 'enabled', analyticsProvider: 'cloudflare-web-analytics'
  });
  const config = await prepareLegacyReleaseConfig({ outputPath: output, sourceDirectory: source, tag: 'v0.2.2' });
  assert.deepEqual(config, { analyticsMode: 'enabled', analyticsProvider: 'cloudflare-web-analytics', schemaVersion: 2 });
  assert.deepEqual(JSON.parse(readFileSync(output, 'utf8')), config);
});

test('legacy adapter rejects abandoned and incompatible historical releases', async (t) => {
  const { output, source } = fixture(t, { analyticsMode: 'enabled', analyticsProvider: 'unknown' });
  await assert.rejects(prepareLegacyReleaseConfig({ outputPath: output, sourceDirectory: source, tag: 'v0.2.0' }), /not supported/);
  await assert.rejects(prepareLegacyReleaseConfig({ outputPath: output, sourceDirectory: source, tag: 'v0.2.2' }), /unsupported/);
});
