import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const e2eDirectory = new URL('./e2e/', import.meta.url);
const mentionPattern = /@[a-z\d](?:[a-z\d-]{0,38})\b/i;
const testDeclarationPattern = /^\s*test(?:\.[a-z]+)*\s*\(/i;

test('Playwright report labels avoid GitHub mention syntax', () => {
  const specFiles = readdirSync(e2eDirectory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.spec.js'));

  for (const file of specFiles) {
    const source = readFileSync(new URL(file.name, e2eDirectory), 'utf8');
    const unsafeTitleCount = source.split('\n')
      .filter((line) => testDeclarationPattern.test(line) && mentionPattern.test(line))
      .length;
    assert.equal(unsafeTitleCount, 0, `${file.name} contains an unsafe Playwright title label`);
  }

  const config = readFileSync(new URL('../playwright.config.js', import.meta.url), 'utf8');
  const unsafeFilterCount = config.split('\n')
    .filter((line) => /\bgrep(?:Invert)?\s*:/.test(line) && mentionPattern.test(line))
    .length;
  assert.equal(unsafeFilterCount, 0, 'Playwright project filters contain an unsafe label');
});
