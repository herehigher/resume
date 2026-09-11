import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { APP_VERSION } from '../site/assets/js/config.js';
import { parseImportedState } from '../site/assets/js/state/storage.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const markdownFiles = [
  'AGENTS.md',
  'README.md',
  'README.zh-CN.md',
  'README.en.md',
  'PRIVACY.md',
  'CHANGELOG.md',
  'CONTRIBUTING.md',
  '.github/pull_request_template.md',
  'docs/development-guide.md',
  'docs/release-playbook.md'
];

function markdownSlug(heading) {
  return heading
    .trim()
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}\s-]/gu, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

function fragmentsIn(markdown) {
  const fragments = new Set();
  for (const match of markdown.matchAll(/<a\s+id="([^"]+)"\s*><\/a>/g)) fragments.add(match[1]);
  for (const match of markdown.matchAll(/^#{1,6}\s+(.+)$/gm)) fragments.add(markdownSlug(match[1]));
  return fragments;
}

function markdownTargets(markdown) {
  return [...markdown.matchAll(/!?\[[^\]]*\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g)]
    .map((match) => match[1]);
}

test('published documentation files exist and local links resolve', () => {
  for (const relativePath of markdownFiles) {
    const sourcePath = path.join(root, relativePath);
    assert.equal(existsSync(sourcePath), true, `${relativePath} is required`);
    const markdown = readFileSync(sourcePath, 'utf8');
    assert.ok(markdown.trim(), `${relativePath} must not be empty`);

    for (const target of markdownTargets(markdown)) {
      if (/^[a-z][a-z+.-]*:/i.test(target)) continue;
      const [targetPath, rawFragment] = target.split('#', 2);
      const resolvedPath = targetPath
        ? path.resolve(path.dirname(sourcePath), decodeURIComponent(targetPath))
        : sourcePath;
      assert.equal(existsSync(resolvedPath), true, `${relativePath}: missing ${targetPath}`);
      if (rawFragment) {
        const targetText = readFileSync(resolvedPath, 'utf8');
        assert.equal(
          fragmentsIn(targetText).has(decodeURIComponent(rawFragment)),
          true,
          `${relativePath}: missing fragment #${rawFragment}`
        );
      }
    }
  }
});

test('release version has one source of truth and a dated changelog entry', () => {
  const packageVersion = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).version;
  assert.match(packageVersion, /^\d+\.\d+\.\d+$/);

  assert.equal(APP_VERSION, packageVersion);
  const lock = JSON.parse(readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
  assert.equal(lock.version, packageVersion);
  assert.equal(lock.packages[''].version, packageVersion);

  const changelog = readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8');
  const release = new RegExp(`^## \\[${packageVersion.replaceAll('.', '\\.')}\\] - \\d{4}-\\d{2}-\\d{2}$`, 'm');
  assert.match(changelog, release);
  const unreleasedIndex = changelog.indexOf('## [Unreleased]');
  assert.ok(unreleasedIndex >= 0);
  assert.ok(unreleasedIndex < changelog.search(release));
});

test('release instructions keep asset-only catch-up commits on the final-head full Quality path', () => {
  const playbook = readFileSync(path.join(root, 'docs/release-playbook.md'), 'utf8');
  assert.match(playbook, /### Asset-only 追補 commit の fast path/);
  assert.match(playbook, /導入しません/);
  assert.match(playbook, /2026-09-11 に確認した 2026-09-10 の実測/);
  assert.doesNotMatch(playbook, /2026-09-11 の実測/);
  assert.match(playbook, /v0.2.8 candidate Quality | 3:48/);
  assert.match(playbook, /asset supplement Quality | 2:55/);
  assert.match(playbook, /asset supplement Release assets current | 0:13/);
  assert.match(playbook, /merge result main Quality | 2:58/);
  for (const runId of ['34478079250', '34478959420', '34479373432']) assert.match(playbook, new RegExp(runId));
  assert.match(playbook, /final PR head の `Quality` と `Release assets current` を必ず要求/);
  assert.match(playbook, /current head の fresh 生成 artifact/);
  assert.match(playbook, /current-merge-ref provenance/);
  assert.match(playbook, /cross-head\/base で一意に結び/);
  assert.match(playbook, /約3分の短縮/);
  assert.match(playbook, /main の full Quality、immutable tag、単一の prepared artifact、online smoke/);
});

test('the public v3 JSON example remains importable under the runtime data contract', () => {
  const schema = JSON.parse(readFileSync(path.join(root, 'site/schema/resume-studio-web-v3.schema.json'), 'utf8'));
  const example = JSON.parse(readFileSync(path.join(root, 'site/schema/resume-studio-web-v3.example.json'), 'utf8'));

  assert.equal(schema.$id, 'https://herehigher.github.io/resume/schema/resume-studio-web-v3.schema.json');
  assert.equal(schema.properties.version.const, 3);
  assert.equal(Object.hasOwn(schema.properties, 'schemaRevision'), false);
  assert.deepEqual(schema.properties.settings.properties.locale.enum, ['ja', 'zh-CN', 'en']);
  assert.deepEqual(Object.keys(example.documents).sort(), ['en', 'ja', 'zh-CN']);
  assert.equal(parseImportedState(JSON.stringify(example)).version, 3);
});
