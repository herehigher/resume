import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { verifyQualityResults } from '../scripts/quality-results.mjs';

function results(docsOnly = false) {
  return {
    scope: { result: 'success', outputs: { docs_only: String(docsOnly) } },
    ...Object.fromEntries(['unit-static', 'browser', 'documentation-assets'].map((name) => [
      name, { result: docsOnly ? 'skipped' : 'success' }
    ]))
  };
}

test('Quality requires every full job, allowing skips only after successful documentation checks', () => {
  assert.equal(verifyQualityResults(results()), 'full');
  assert.equal(verifyQualityResults(results(true)), 'documentation-only');
  for (const docsOnly of [false, true]) {
    for (const job of ['scope', 'unit-static', 'browser', 'documentation-assets']) {
      const expected = job === 'scope' || !docsOnly ? 'success' : 'skipped';
      for (const result of ['success', 'skipped', 'failure', 'cancelled', undefined]) {
        if (result === expected) continue;
        const needs = results(docsOnly);
        needs[job].result = result;
        assert.throws(() => verifyQualityResults(needs));
      }
      const needs = results(docsOnly);
      delete needs[job];
      assert.throws(() => verifyQualityResults(needs));
    }
  }
});

test('missing or invalid scope outputs cannot bypass the full gate', () => {
  for (const value of [undefined, null, '', true, false, 'TRUE', 'unknown']) {
    const needs = results(true);
    needs.scope.outputs.docs_only = value;
    assert.throws(() => verifyQualityResults(needs), /scope output/);
  }
  const needs = results(true);
  delete needs.scope.outputs;
  assert.throws(() => verifyQualityResults(needs), /scope output/);
  assert.throws(() => verifyQualityResults(null), /scope did not succeed/);
});

test('the workflow CLI exits unsuccessfully for absent, malformed, or incomplete results', () => {
  for (const input of ['', '{', '{}', JSON.stringify(results()), JSON.stringify(results(true))]) {
    const child = spawnSync(process.execPath, [fileURLToPath(new URL('../scripts/quality-results.mjs', import.meta.url))], {
      encoding: 'utf8', env: { ...process.env, QUALITY_NEEDS: input }
    });
    assert.equal(child.status, input.startsWith('{"scope"') ? 0 : 1);
  }
});
