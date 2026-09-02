import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const manifestPath = path.join(root, 'docs/assets-manifest.json');
const markdownFiles = [
  'AGENTS.md',
  'README.md',
  'README.zh-CN.md',
  'README.en.md',
  'PRIVACY.md',
  'CHANGELOG.md',
  'CONTRIBUTING.md',
  'docs/acceptance-checklist.md',
  'docs/development-guide.md',
  'docs/release-playbook.md'
];
const requiredFiles = [
  ...markdownFiles,
  'LICENSE',
  '.gitattributes',
  '.github/pages-release-manifest.json',
  'docs/assets-manifest.json',
  'docs/screenshots/ja.png',
  'docs/screenshots/zh-CN.png',
  'docs/screenshots/en.png',
  'output/pdf/ja-a4.pdf',
  'output/pdf/zh-CN-a4.pdf',
  'output/pdf/en-letter.pdf'
];
const detailedReadmes = ['README.md', 'README.zh-CN.md', 'README.en.md'];

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

function literalPattern(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function fileHash(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

function pngSize(file) {
  const data = readFileSync(file);
  assert.deepEqual([...data.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(data.subarray(12, 16).toString('ascii'), 'IHDR');
  return { height: data.readUInt32BE(20), width: data.readUInt32BE(16) };
}

async function inspectPdf(file) {
  const loadingTask = getDocument({
    data: new Uint8Array(await readFile(file)),
    disableFontFace: true,
    isEvalSupported: false,
    useSystemFonts: true
  });
  const document = await loadingTask.promise;
  const pages = [];
  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      pages.push({
        height: viewport.height,
        text: content.items.map((item) => item.str).join(' '),
        width: viewport.width
      });
    }
  } finally {
    await loadingTask.destroy();
  }
  return pages;
}

test('required public documentation and generated assets exist', () => {
  for (const relativePath of requiredFiles) {
    const absolutePath = path.join(root, relativePath);
    assert.equal(existsSync(absolutePath), true, `${relativePath} is required`);
    assert.ok(readFileSync(absolutePath).length > 0, `${relativePath} must not be empty`);
  }
});

test('every relative Markdown link, image, and fragment resolves', () => {
  for (const relativePath of markdownFiles) {
    const sourcePath = path.join(root, relativePath);
    const markdown = readFileSync(sourcePath, 'utf8');
    for (const target of markdownTargets(markdown)) {
      if (/^[a-z][a-z+.-]*:/i.test(target)) continue;
      const [targetPath, rawFragment] = target.split('#', 2);
      const resolvedPath = targetPath
        ? path.resolve(path.dirname(sourcePath), decodeURIComponent(targetPath))
        : sourcePath;
      assert.equal(existsSync(resolvedPath), true, `${relativePath}: missing ${targetPath}`);
      if (rawFragment) {
        const fragment = decodeURIComponent(rawFragment);
        const targetText = readFileSync(resolvedPath, 'utf8');
        assert.equal(
          fragmentsIn(targetText).has(fragment),
          true,
          `${relativePath}: missing fragment #${fragment} in ${targetPath || relativePath}`
        );
      }
    }
  }
});

test('root Japanese guide and localized README fact matrix stay complete', () => {
  const rootReadme = readFileSync(path.join(root, 'README.md'), 'utf8');
  assert.equal(existsSync(path.join(root, 'README.ja.md')), false, 'README.md is the only Japanese guide');
  const rootTargets = markdownTargets(rootReadme);
  for (const target of ['README.zh-CN.md', 'README.en.md']) {
    assert.ok(rootTargets.includes(target), `README.md must link ${target}`);
  }
  assert.match(rootReadme, /日本語（このページ）/);
  assert.doesNotMatch(rootReadme, /#project-overview|README\.ja\.md/);
  assert.match(rootReadme, /README だけで使い始める/);
  assert.match(rootReadme, /https:\/\/herehigher\.github\.io\/resume\//);
  assert.doesNotMatch(rootReadme, /Issue #9/);

  const commonFacts = [
    /https:\/\/herehigher\.github\.io\/resume\//,
    /python3 -m http\.server 8000 --directory site/,
    /npx --yes http-server site --port 8000/,
    /http:\/\/localhost:8000\//,
    /http:\/\/127\.0\.0\.1/,
    /http:\/\/0\.0\.0\.0/,
    /file:\/\//,
    /\?lang=ja/,
    /\?lang=zh-CN/,
    /\?lang=en/,
    /localStorage/,
    /AES-GCM/,
    /resume-studio-web-v1/,
    /resume-studio-data-v1/,
    /JSON/,
    /PDF/,
    /A4/,
    /Letter/,
    /Chrome/,
    /職務経歴書/,
    /ATS-friendly/,
    /中文简历/,
    /PRIVACY\.md#privacy-/,
    /LICENSE/
  ];
  const obsoletePlaintextClaims = [
    /localStorage と export file は暗号化されません/,
    /localStorage 和 export file 不会被加密/,
    /Neither localStorage nor exported files are encrypted/
  ];
  const localeFacts = {
    'README.md': [/## Web版/, /入力例/, /自動保存/, /手動保存/, /再読込/, /削除/, /profile・連絡先・写真は三言語で共有/],
    'README.en.md': [
      /## Web App/,
      /Example mode|example/i,
      /Autosave|saved automatically/i,
      /manual save/i,
      /Reload/i,
      /delete/i,
      /profile, contact details, and photo are shared across locales/i
    ],
    'README.zh-CN.md': [/## 在线版/, /示例/, /自动保存/, /手动保存/, /重新载入/, /删除/, /profile、联系方式和照片由三种语言共享/]
  };
  for (const relativePath of detailedReadmes) {
    const markdown = readFileSync(path.join(root, relativePath), 'utf8');
    assert.doesNotMatch(markdown, /\bDemo\b/, `${relativePath} must describe the production Web App, not a demo`);
    assert.doesNotMatch(markdown, /Issue #9/, `${relativePath} must not describe the published Web App as pending`);
    for (const pattern of obsoletePlaintextClaims) {
      assert.doesNotMatch(markdown, pattern, `${relativePath} contains obsolete plaintext-storage copy`);
    }
    for (const pattern of [...commonFacts, ...localeFacts[relativePath]]) {
      assert.match(markdown, pattern, `${relativePath} is missing ${pattern}`);
    }
  }
});

test('AGENTS links the canonical development and documentation guide', () => {
  const agents = readFileSync(path.join(root, 'AGENTS.md'), 'utf8');
  assert.match(agents, /\[開発ガイド\]\(docs\/development-guide\.md\)/);
  assert.match(agents, /Analytics provider token の raw value.*tracked file/s);
  assert.match(readFileSync(path.join(root, 'CONTRIBUTING.md'), 'utf8'), /SHA-256 fingerprint.*実値/s);
});

test('release screenshots and PDF samples are assigned to Git LFS', () => {
  const attributes = readFileSync(path.join(root, '.gitattributes'), 'utf8');
  assert.match(attributes, /^docs\/screenshots\/\*\.png filter=lfs diff=lfs merge=lfs -text$/m);
  assert.match(attributes, /^output\/pdf\/\*\.pdf filter=lfs diff=lfs merge=lfs -text$/m);

  const workflow = readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8');
  assert.match(workflow, /uses: actions\/checkout@v4[\s\S]*?lfs: true/);
});

test('development docs cover localized public entry and machine-readable contracts', () => {
  const guide = readFileSync(path.join(root, 'docs/development-guide.md'), 'utf8');
  const acceptance = readFileSync(path.join(root, 'docs/acceptance-checklist.md'), 'utf8');
  const contributing = readFileSync(path.join(root, 'CONTRIBUTING.md'), 'utf8');
  const acceptanceItems = acceptance.split('\n').filter((line) => line.startsWith('- [ ] '));
  const hasAcceptanceItem = (...facts) => acceptanceItems.some((line) => facts.every((fact) => line.includes(fact)));

  for (const fact of [
    '/ja/',
    '/zh-cn/',
    '/en/',
    'canonical',
    'hreflang',
    'sitemap.xml',
    'resume-studio-web-v1.schema.json',
    'tests/public-entry.test.js'
  ]) {
    assert.match(guide, new RegExp(fact.replaceAll('.', '\\.')));
  }

  for (const fact of [
    '/ja/',
    '/zh-cn/',
    '/en/',
    'x-default',
    'sitemap.xml',
    'resume-studio-web-v1.schema.json',
    'aria-selected',
    'aria-pressed'
  ]) {
    assert.match(acceptance, new RegExp(fact.replaceAll('.', '\\.')));
  }

  assert.equal(hasAcceptanceItem('/ja/', '/zh-cn/', '/en/', 'public entry', '正しい言語の公開内容'), true);
  assert.equal(hasAcceptanceItem('Root editor', 'JavaScript', 'H1', 'editor content'), true);
  assert.equal(hasAcceptanceItem('三言語 public entry', 'JavaScript', 'editor CTA', 'JSON Schema link'), true);
  assert.equal(hasAcceptanceItem('Root', 'editor CTA'), false);
  assert.equal(hasAcceptanceItem('Root', 'JSON Schema link'), false);
  assert.equal(hasAcceptanceItem('Public entry', '?lang=ja', '?lang=zh-CN', '?lang=en'), true);
  for (const document of [guide, contributing]) {
    assert.match(document, /provider.*template.*endpoint.*privacy.*network policy.*Pull Request.*version.*tag/is);
    assert.match(document, /Manifest structure.*fingerprint.*schemaVersion/is);
    assert.match(document, /既存 tag.*adapter.*schema.*redeploy/is);
    assert.match(document, /旧 token.*hard failure|旧 token.*利用不能.*失敗/is);
  }
});

test('v0.1.0 changelog freezes the dated release without losing release notes', () => {
  const changelog = readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8');
  const unreleased = '## [Unreleased]';
  const release = '## [0.1.0] - 2026-09-01';
  const unreleasedIndex = changelog.indexOf(unreleased);
  const releaseIndex = changelog.indexOf(release);

  assert.ok(unreleasedIndex >= 0);
  assert.ok(releaseIndex > unreleasedIndex, 'Unreleased must remain before the latest release');
  assert.equal(changelog.slice(unreleasedIndex + unreleased.length, releaseIndex).trim(), '');
  assert.equal((changelog.match(/^## \[0\.1\.0\] - 2026-09-01$/gm) || []).length, 1);

  const releaseNotes = changelog.slice(releaseIndex + release.length);
  assert.match(releaseNotes, /### Added \/ 追加/);
  assert.match(releaseNotes, /### Security \/ Privacy/);
  for (const fact of [
    '日本語の履歴書・職務経歴書',
    '简体中文 resume editor',
    'English ATS-friendly resume',
    '三言語で共有する profile',
    'Profile URL の protocol 制限',
    'Desktop/mobile workflow',
    'reproducible screenshot/PDF samples',
    'GitHub source link',
    'Issue #9',
    'stable SemVer tag によってのみ起動する GitHub Pages production deployment',
    'version release playbook',
    '`site/` source、clone、fork は Analytics 無効',
    'deployment 時に決定的に追加',
    'no raw provider token'
  ]) assert.match(releaseNotes, new RegExp(literalPattern(fact)));
});

test('release playbook is canonical and covers publication, evidence, and recovery decisions', () => {
  const guide = readFileSync(path.join(root, 'docs/development-guide.md'), 'utf8');
  const acceptance = readFileSync(path.join(root, 'docs/acceptance-checklist.md'), 'utf8');
  const contributing = readFileSync(path.join(root, 'CONTRIBUTING.md'), 'utf8');
  const playbook = readFileSync(path.join(root, 'docs/release-playbook.md'), 'utf8');
  const headings = [...playbook.matchAll(/^##\s+(.+)$/gm)].map((match) => match[1]);

  for (const heading of [
    '権限と release gate',
    'RC freeze と screenshot の時点',
    'Preflight inputs と local gate',
    'Pull Request、Quality、merge',
    '初回 Pages と HTTPS 設定',
    'Annotated immutable tag の作成と push',
    'Actions の監視と online acceptance',
    'Evidence 記録 template',
    'Existing tag の manual redeploy / rollback',
    '失敗時の判断',
    '初回成功後の README と Issue close',
    'English summary'
  ]) assert.ok(headings.includes(heading), `release playbook is missing ${heading}`);

  assert.match(guide, /\[Version release playbook\]\(release-playbook\.md\).*canonical/);
  assert.match(acceptance, /\[Version release playbook\]\(release-playbook\.md\)/);
  assert.match(contributing, /\[Version release playbook\]\(docs\/release-playbook\.md\)/);

  for (const contract of [
    /owner の明示承認.*Public release|Public release.*owner の明示承認/s,
    /安定版 `vMAJOR\.MINOR\.PATCH`.*leading zero.*prerelease.*build metadata/s,
    /version を含むすべての画面内容を確定した.*merge と tag の前.*npm run release:assets/s,
    /生成後に `site\/` または public sample が変わった場合は再生成します/,
    /Workflow \/ Markdown だけの変更では再生成しません/,
    /`CHANGELOG\.md` の `Unreleased` から `## \[<RELEASE_VERSION>\] - <RELEASE_DATE>`.*release date を確定/s,
    /`package\.json`、`site\/assets\/js\/config\.js` の `APP_VERSION`、`CHANGELOG\.md`.*同じ `<RELEASE_VERSION>`/s,
    /npm run test:acceptance/,
    /git diff --check origin\/main\.\.\.HEAD/,
    /working tree.*committed Pull Request range/s,
    /通常の `main` push では Pages deployment が起動しない/,
    /gh pr view "\$pr_number" --repo herehigher\/resume.*mergeCommit/s,
    /reviewed merge commit.*pinned merge SHA/s,
    /gh run list --repo herehigher\/resume --workflow ci\.yml.*--commit "\$release_sha".*--status success/s,
    /gh run view "\$quality_run_id".*\.name == "quality".*\.conclusion == "success"/s,
    /main` push の `Quality` run が成功/s,
    /Pages Analytics manifest の PR 前開発検証/,
    /Pinned release SHA の最終 artifact gate/,
    /gh variable get CLOUDFLARE_WEB_ANALYTICS_TOKEN --repo herehigher\/resume/,
    /derive-cloudflare --source site/,
    /owner の明示承認後、PR 前にも.*token を表示・記録せず/s,
    /Enabled のまま先に tag を作ることは禁止/,
    /Source を `GitHub Actions`.*`Enforce HTTPS`/s,
    /if ! remote_tag_result="\$\(git ls-remote --tags origin/,
    /test -z "\$remote_tag_result".*Release tag already exists remotely/s,
    /local_tag_status.*-eq 1/s,
    /package_json="\$\(git show.*"\$\{release_sha}:package\.json"\)"/s,
    /\^v\(0\|\[1-9\]\\d\*\).*expected_tag/s,
    /test "\$release_tag" = "\$expected_tag".*does not exactly match/s,
    /git tag --annotate "\$release_tag" "\$release_sha"/,
    /git push origin "refs\/tags\/\$\{release_tag}:refs\/tags\/\$\{release_tag}"/,
    /validate → quality → artifact → deploy → smoke/,
    /Smoke failure は deploy 後の未受入状態/,
    /gh workflow run deploy-pages\.yml --ref main --field "release_tag=\$\{existing_tag}"/,
    /Tag は immutable.*移動・上書き・削除しない/s,
    /docs-only follow-up Pull Request.*Issue を close/s
  ]) assert.match(playbook, contract);

  for (const evidenceField of [
    'Release commit (full SHA)',
    'Owner approval',
    'Quality on PR',
    'Reviewed PR merge SHA pin',
    'Main `Quality / quality` for pinned SHA',
    'Working tree `git diff --check`',
    'Committed PR range `git diff --check origin/main...HEAD`',
    'Version consistency (`package.json` / `APP_VERSION` / `CHANGELOG.md`)',
    'CHANGELOG release notes / date',
    'Pages Analytics mode / provider / fingerprint',
    'Pages source / adapter / final artifact digest',
    'Final pinned artifact gate',
    'Screenshot / PDF source SHA',
    'Pages Source / custom domain / HTTPS',
    'Deploy workflow',
    'Online smoke / manual browser',
    'Final decision'
  ]) assert.match(playbook, new RegExp(literalPattern(evidenceField)));

  for (const failureStage of [
    'Pre-deploy / RC gate',
    'Validate',
    'Quality',
    'Artifact',
    'Deploy',
    'Post-deploy smoke',
    'HTTP 200 だが stale CDN content',
    '同一 origin の content defect'
  ]) assert.match(playbook, new RegExp(`\\| ${literalPattern(failureStage)} \\|`));

  assert.match(playbook, /`<RELEASE_VERSION>`.*`<RELEASE_DATE>`.*`<RELEASE_TAG>`.*`<RELEASE_SHA>`.*`<PR_NUMBER>`/s);
  assert.match(playbook, /`<` または `>` が残る command は実行しません/);
  assert.ok(
    playbook.indexOf('git fetch --tags origin main') < playbook.indexOf('git diff --check origin/main...HEAD'),
    'the committed range check must follow the base fetch'
  );
  assert.ok(
    playbook.indexOf('git ls-remote --tags origin') < playbook.indexOf('test -z "$remote_tag_result"'),
    'remote tag absence must be checked only after a successful query'
  );
  const finalGate = playbook.match(
    /```bash\n### FINAL_RELEASE_ARTIFACT_GATE_START\n([\s\S]*?)\n### FINAL_RELEASE_ARTIFACT_GATE_END\n```/
  );
  assert.ok(finalGate, 'final release artifact gate is missing');
  const finalGateStart = playbook.indexOf('### FINAL_RELEASE_ARTIFACT_GATE_START');
  assert.ok(
    playbook.indexOf('この Quality URL と pinned `<RELEASE_SHA>` の組を evidence に記録します。') < finalGateStart,
    'the final artifact gate must follow pinned main Quality verification'
  );
  assert.ok(
    finalGateStart < playbook.indexOf('### RELEASE_TAG_PREFLIGHT_START'),
    'the final artifact gate must precede tag preflight'
  );
  for (const contract of [
    /git worktree add --detach "\$final_gate_tree" "\$release_sha"/,
    /rev-parse HEAD.*"\$release_sha"/s,
    /symbolic-ref --quiet HEAD/,
    /status --porcelain=v1 --untracked-files=all/,
    /prepare-pages-artifact\.mjs" validate/,
    /gh variable get CLOUDFLARE_WEB_ANALYTICS_TOKEN --repo herehigher\/resume/,
    /derive-cloudflare/,
    /source digest mismatch/,
    /provider fingerprint mismatch/,
    /final artifact digest mismatch/,
    /cleanup_final_gate.*Final verification cleanup failed/s
  ]) assert.match(finalGate[1], contract);
  assert.ok(
    finalGate[1].indexOf('prepare-pages-artifact.mjs" validate')
      < finalGate[1].indexOf('gh variable get CLOUDFLARE_WEB_ANALYTICS_TOKEN'),
    'manifest validation must fail before provider variable access'
  );
  assert.doesNotMatch(playbook, /git rev-parse --verify 'origin\/main\^\{commit\}'/);
  assert.doesNotMatch(playbook, /一度だけ `npm run generate:docs`/);
  assert.doesNotMatch(playbook, /gh[pousr]_[A-Za-z0-9]|github_pat_[A-Za-z0-9]|Authorization:\s*Bearer/i);
});

test('tracked text tree contains no migrated raw analytics token', () => {
  const releaseManifest = JSON.parse(readFileSync(path.join(root, '.github/pages-release-manifest.json'), 'utf8'));
  const providerFingerprint = releaseManifest.providerTokenSha256;
  assert.match(providerFingerprint, /^[0-9a-f]{64}$/);
  const ignoredRoots = new Set(['.git', 'node_modules', 'output']);
  const textExtensions = new Set(['.html', '.js', '.json', '.md', '.mjs', '.yml', '.yaml']);
  function textFiles(directory) {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      if (ignoredRoots.has(entry.name) || (entry.name === 'screenshots' && path.basename(directory) === 'docs')) return [];
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) return textFiles(absolutePath);
      return textExtensions.has(path.extname(entry.name)) ? [absolutePath] : [];
    });
  }
  for (const file of textFiles(root)) {
    const contents = readFileSync(file, 'utf8');
    for (const match of contents.matchAll(/(?<![0-9a-f])[0-9a-f]{32}(?![0-9a-f])/g)) {
      const candidateFingerprint = createHash('sha256').update(match[0]).digest('hex');
      assert.notEqual(candidateFingerprint, providerFingerprint, path.relative(root, file));
    }
  }
});

test('release tag shell preflight fails closed before its success marker', (t) => {
  const playbook = readFileSync(path.join(root, 'docs/release-playbook.md'), 'utf8');
  const block = playbook.match(
    /```bash\n### RELEASE_TAG_PREFLIGHT_START\n([\s\S]*?)\n### RELEASE_TAG_PREFLIGHT_END\n```/
  );
  assert.ok(block, 'executable release tag preflight block is missing');

  const fakeBin = mkdtempSync(path.join(os.tmpdir(), 'resume-release-playbook-'));
  t.after(() => rmSync(fakeBin, { force: true, recursive: true }));
  const fakeGit = path.join(fakeBin, 'git');
  writeFileSync(fakeGit, `#!/bin/sh
case "$1" in
  merge-base) exit 0 ;;
  show) printf '{"version":"%s"}\\n' "\${FAKE_PACKAGE_VERSION:-0.1.0}"; exit 0 ;;
  rev-parse) exit 1 ;;
  ls-remote)
    if [ "\${FAKE_LS_REMOTE_FAIL:-0}" = "1" ]; then exit 2; fi
    if [ "\${FAKE_REMOTE_TAG_EXISTS:-0}" = "1" ]; then printf 'deadbeef\\trefs/tags/v0.1.0\\n'; fi
    exit 0
    ;;
  *) printf 'Unexpected git command: %s\\n' "$*" >&2; exit 99 ;;
esac
`);
  chmodSync(fakeGit, 0o755);

  const runPreflight = (overrides = {}) => spawnSync('bash', ['-c', block[1]], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${fakeBin}:${process.env.PATH}`,
      RELEASE_SHA: 'a'.repeat(40),
      RELEASE_TAG: 'v0.1.0',
      ...overrides
    }
  });
  const assertRejectedBeforeSuccess = (result, message) => {
    assert.notEqual(result.status, 0, message);
    assert.doesNotMatch(result.stdout, /Release tag preflight passed/);
  };

  const success = runPreflight();
  assert.equal(success.status, 0, success.stderr);
  assert.match(success.stdout, /Release tag preflight passed: v0\.1\.0 -> [a-f0-9]{40}/);

  const mismatch = runPreflight({ RELEASE_TAG: 'v0.1.1' });
  assertRejectedBeforeSuccess(mismatch, 'package/tag mismatch must fail');
  assert.match(mismatch.stderr, /does not exactly match the pinned package version/);

  const invalidPackageVersion = runPreflight({ FAKE_PACKAGE_VERSION: '01.0.0' });
  assertRejectedBeforeSuccess(invalidPackageVersion, 'leading-zero package version must fail');
  assert.match(invalidPackageVersion.stderr, /not stable SemVer/);

  const queryFailure = runPreflight({ FAKE_LS_REMOTE_FAIL: '1' });
  assertRejectedBeforeSuccess(queryFailure, 'remote tag query failure must fail');
  assert.match(queryFailure.stderr, /Unable to query remote tags/);

  const existingRemoteTag = runPreflight({ FAKE_REMOTE_TAG_EXISTS: '1' });
  assertRejectedBeforeSuccess(existingRemoteTag, 'an existing remote tag must fail');
  assert.match(existingRemoteTag.stderr, /already exists remotely/);
});

test('privacy has stable tri-lingual anchors and one effective version', () => {
  const privacy = readFileSync(path.join(root, 'PRIVACY.md'), 'utf8');
  for (const fragment of ['privacy-ja', 'privacy-zh-cn', 'privacy-en']) {
    assert.equal(fragmentsIn(privacy).has(fragment), true);
  }
  assert.equal((privacy.match(/Version 1\.1 - Effective 2026-09-01/g) || []).length, 1);
  assert.equal((privacy.match(/https:\/\/www\.cloudflare\.com\/web-analytics\//g) || []).length, 3);
  for (const fact of [
    'resume-studio-web-v1',
    'resume-studio-data-v1',
    'localStorage',
    'AES-GCM',
    'secure context',
    'http://localhost',
    'IndexedDB',
    'non-extractable',
    'private browsing',
    'storage eviction',
    'JSON/PDF',
    'profile link',
    'application backend',
    'Cloudflare Web Analytics',
    'cloudflareinsights.com',
    'data-analytics-mode',
    'configuration error',
    'fingerprinting',
    'custom event'
  ]) {
    assert.match(privacy, new RegExp(fact.replace('/', '\\/'), 'g'));
  }
});

test('asset manifest describes the committed release outputs and screenshot dimensions', () => {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.generator.path, 'scripts/generate-doc-assets.mjs');
  assert.match(manifest.source.siteHash, /^[0-9a-f]{64}$/);
  assert.equal(manifest.source.markerPrefix, 'RESUME-STUDIO-SAMPLE');
  assert.deepEqual(manifest.browser.viewport, { height: 1000, width: 1440 });

  const expected = new Map([
    ['ja', ['docs/screenshots/ja.png', 'output/pdf/ja-a4.pdf', 'A4']],
    ['zh-CN', ['docs/screenshots/zh-CN.png', 'output/pdf/zh-CN-a4.pdf', 'A4']],
    ['en', ['docs/screenshots/en.png', 'output/pdf/en-letter.pdf', 'LETTER']]
  ]);
  assert.equal(manifest.outputs.length, expected.size);
  for (const output of manifest.outputs) {
    const [screenshotPath, pdfPath, paper] = expected.get(output.locale) || [];
    assert.equal(output.screenshot.path, screenshotPath);
    assert.equal(output.pdf.path, pdfPath);
    assert.equal(output.screenshot.fixture, 'built-in-example');
    assert.equal(output.pdf.fixture, 'deterministic-print-example');
    assert.equal(output.paper, paper);
    assert.equal(output.lastText, output.marker);
    assert.equal(manifest.source.markerHashLength, 12);
    assert.equal(
      output.marker,
      `RESUME-STUDIO-SAMPLE-${output.locale.toUpperCase()}-${manifest.source.siteHash.slice(0, 12).toUpperCase()}`
    );
    assert.equal(output.screenshot.sha256, fileHash(path.join(root, screenshotPath)));
    assert.equal(output.pdf.sha256, fileHash(path.join(root, pdfPath)));
    assert.deepEqual(pngSize(path.join(root, screenshotPath)), { height: 1000, width: 1440 });
  }
});

test('PDF samples have physical paper sizes and extractable first/last markers', async () => {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const sizes = {
    A4: { height: 841.89, width: 595.28 },
    LETTER: { height: 792, width: 612 }
  };
  for (const output of manifest.outputs) {
    const pages = await inspectPdf(path.join(root, output.pdf.path));
    assert.ok(pages.length >= 1, `${output.locale} PDF must have a page`);
    assert.match(pages[0].text, new RegExp(output.firstText));
    assert.match(pages.at(-1).text, new RegExp(output.lastText));
    for (const page of pages) {
      assert.ok(Math.abs(page.width - sizes[output.paper].width) < 1);
      assert.ok(Math.abs(page.height - sizes[output.paper].height) < 1);
    }
  }
});
