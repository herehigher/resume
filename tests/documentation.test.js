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

test('release instructions keep asset promotion and publication on the full verified path', () => {
  const playbook = readFileSync(path.join(root, 'docs/release-playbook.md'), 'utf8');
  assert.match(playbook, /## 実行入口を選ぶ/);
  assert.match(playbook, /## 通常公開の実行手順/);
  assert.match(playbook, /## Production の状態を照合する/);
  assert.match(playbook, /## 前のバージョンへ戻す/);
  assert.match(playbook, /## 自動化の契約（参照）/);
  assert.match(playbook, /`docs\/screenshots\/\{en,ja,zh-CN\}\.png` の3 file/);
  assert.match(playbook, /`output\/pdf\/\{en-letter,ja-a4,zh-CN-a4\}\.pdf` の3 file/);
  assert.match(playbook, /`docs\/assets-manifest\.json` の計7 fileだけ/);
  assert.match(playbook, /Asset-only の追補 commit に fast path は設けません/);
  assert.match(playbook, /最終 PR head の `Quality` を成功/);
  assert.match(playbook, /候補 asset を生成・取り込み/);
  assert.match(playbook, /候補生成 workflow/);
  assert.match(playbook, /公開 PR と merge 結果の `main` で full Quality/);
  assert.match(playbook, /run ID・attempt、artifact ID・digest/);
  assert.match(playbook, /導入 PR.*main/);
  assert.match(playbook, /Version を変えない PR で展示 asset を変更してはいけません/);
  assert.match(playbook, /commit 済み7 file と候補 artifact の exact bytes/);
  assert.match(playbook, /fresh に生成した version・site・generator・browser・PDF・screenshot/);
  assert.match(playbook, /`Release eligibility` は official main Quality[\s\S]*通常の main 更新では `Release production` を開始しません/);
  assert.match(playbook, /Preview branch への Direct Upload と smoke が成功してから production へ upload/);
  assert.match(playbook, /公開 source は承認済み tag・SHA・artifact で固定/);
  assert.doesNotMatch(playbook, /まだ GitHub Pages の deployment action/);
  assert.match(playbook, /#251 の live hosting 完了判定/);
  assert.match(playbook, /Pages\.dev と custom domain の application・online editor smoke/);
  assert.match(playbook, /Accept existing Cloudflare production baseline[\s\S]+6968466e-88e8-4156-94e7-39d81a45add8[\s\S]+571384f3-3869-46d3-9af3-80c364bc1ef2/);
  assert.match(playbook, /Roll back Cloudflare production[\s\S]+current `latest_deployment\.id` が accepted target UUID/);
  assert.match(playbook, /`production_verification_unverified`[\s\S]*直近の verification より前の `release_unverified`/);
  assert.match(playbook, /UUID 不一致、不明な current identity、記録の欠落は\[停止して調査\]/);
  assert.match(playbook, /github-pages` environment は削除済み/);
  assert.match(playbook, /issuecomment-5889977750/);
  assert.match(playbook, /切替後の release の upload identity を記録できなかった場合、SHA だけで accepted にしません/);
});

test('the public v4 JSON example remains importable under the runtime data contract', () => {
  const schema = JSON.parse(readFileSync(path.join(root, 'site/schema/resume-studio-web-v4.schema.json'), 'utf8'));
  const example = JSON.parse(readFileSync(path.join(root, 'site/schema/resume-studio-web-v4.example.json'), 'utf8'));

  assert.equal(schema.$id, 'https://rs.herehigher.com/schema/resume-studio-web-v4.schema.json');
  assert.equal(schema.properties.version.const, 4);
  assert.equal(Object.hasOwn(schema.properties, 'schemaRevision'), false);
  assert.deepEqual(schema.properties.settings.properties.locale.enum, ['ja', 'zh-CN', 'en']);
  assert.deepEqual(Object.keys(example.documents).sort(), ['en', 'ja', 'zh-CN']);
  assert.equal(parseImportedState(JSON.stringify(example)).version, 4);
});
