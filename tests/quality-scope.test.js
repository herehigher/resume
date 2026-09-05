import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { documentationOnlyBetween, isDocumentationOnly } from '../scripts/quality-scope.mjs';

test('only explicit Markdown documentation paths may skip browser quality', () => {
  assert.equal(isDocumentationOnly(['AGENTS.md', 'docs/development-guide.md', '.github/pull_request_template.md']), true);
  for (const files of [[], ['site/readme.md'], ['scripts/readme.md'], ['docs/screenshots/ja.png'],
    ['.github/workflows/ci.yml'], ['tests/documentation.test.js'], ['README.md', 'package.json']]) {
    assert.equal(isDocumentationOnly(files), false, JSON.stringify(files));
  }
  assert.equal(documentationOnlyBetween('main', 'HEAD'), false);
});

test('the CLI classifies actual commit ranges and keeps code renames in the full gate', (t) => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'resume-quality-scope-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd: directory, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init', '--initial-branch=main');
  git('config', 'user.name', 'Fictional Quality Test');
  git('config', 'user.email', 'quality@example.invalid');
  git('config', 'commit.gpgSign', 'false');
  writeFileSync(path.join(directory, 'README.md'), 'Initial documentation\n');
  mkdirSync(path.join(directory, 'scripts'));
  writeFileSync(path.join(directory, 'scripts/example.mjs'), 'console.log("fixture");\n');
  git('add', '.');
  git('commit', '-m', 'initial fixture');
  const base = git('rev-parse', 'HEAD');
  writeFileSync(path.join(directory, 'README.md'), 'Updated documentation\n');
  git('commit', '-am', 'documentation fixture');
  const head = git('rev-parse', 'HEAD');
  const output = path.join(directory, 'actions-output');
  execFileSync(process.execPath, [fileURLToPath(new URL('../scripts/quality-scope.mjs', import.meta.url)), base, head], {
    cwd: directory, env: { ...process.env, GITHUB_OUTPUT: output }, stdio: 'pipe'
  });
  assert.equal(readFileSync(output, 'utf8'), 'docs_only=true\n');
  git('mv', 'scripts/example.mjs', 'example.md');
  git('commit', '-am', 'rename code into documentation');
  assert.equal(documentationOnlyBetween(head, git('rev-parse', 'HEAD'), directory), false);
  assert.equal(documentationOnlyBetween('a'.repeat(40), head, directory), false);
  assert.equal(documentationOnlyBetween(head, head, directory), false);
});
