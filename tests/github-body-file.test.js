import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const bodyFileWriter = path.join(root, 'scripts/write-github-body-file.mjs');

test('GitHub body-file writer preserves fictional Markdown without shell evaluation', (t) => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'resume-github-body-'));
  t.after(() => rmSync(directory, { force: true, recursive: true }));
  const outputPath = path.join(directory, 'body.md');
  const sideEffectPath = path.join(directory, 'must-not-exist');
  const fixture = Buffer.from([
    '## 架空の本文',
    '`literal --body`',
    `$(touch ${sideEffectPath})`,
    '"double quotes" and \'single quotes\'',
    '[Issue #123](https://github.invalid/example/resume/issues/123)',
    '[PR #456](https://github.invalid/example/resume/pull/456)'
  ].join('\n'), 'utf8');

  const result = spawnSync(process.execPath, [bodyFileWriter, '--output', outputPath], {
    encoding: 'utf8',
    input: fixture
  });

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(readFileSync(outputPath), fixture);
  assert.equal(existsSync(sideEffectPath), false);
});

test('GitHub body-file writer requires an absolute temporary-file path', () => {
  const result = spawnSync(process.execPath, [bodyFileWriter, '--output', 'body.md'], {
    encoding: 'utf8',
    input: 'fictional body'
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /absolute temporary-file path/);
});

test('contribution and release instructions use body files while preserving the Japanese PR template headings', () => {
  const contributing = readFileSync(path.join(root, 'CONTRIBUTING.md'), 'utf8');
  const releasePlaybook = readFileSync(path.join(root, 'docs/release-playbook.md'), 'utf8');
  const template = readFileSync(path.join(root, '.github/pull_request_template.md'), 'utf8');

  assert.match(contributing, /gh issue create[\s\S]*--body-file "\$body_file"/);
  assert.match(contributing, /gh pr create[\s\S]*--body-file "\$body_file"/);
  assert.match(contributing, /gh pr edit[\s\S]*--body-file "\$body_file"/);
  assert.match(releasePlaybook, /gh pr create[\s\S]*--body-file "\$body_file"/);
  assert.match(releasePlaybook, /gh pr edit[\s\S]*--body-file "\$body_file"/);
  assert.match(template, /^## 問題と変更後の動作[\s\S]*^## 検証[\s\S]*^## 関連 Issue/m);
});
