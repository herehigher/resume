import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function verifyQualityResults(needs) {
  assert.equal(needs?.scope?.result, 'success', 'Quality scope did not succeed');
  const docsOnly = needs.scope.outputs?.docs_only;
  assert.ok(['true', 'false'].includes(docsOnly), 'Quality scope output is missing or invalid');
  const expected = docsOnly === 'true' ? 'skipped' : 'success';
  for (const job of ['unit-static', 'browser', 'documentation-assets']) {
    assert.equal(needs[job]?.result, expected, `${job} must be ${expected}`);
  }
  return docsOnly === 'true' ? 'documentation-only' : 'full';
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const mode = verifyQualityResults(JSON.parse(process.env.QUALITY_NEEDS || 'null'));
    console.log(`Verified ${mode} Quality results.`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
