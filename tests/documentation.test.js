import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
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
  'docs/development-guide.md'
];
const requiredFiles = [
  ...markdownFiles,
  'LICENSE',
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

function collectFiles(directory) {
  return readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))
    .flatMap((entry) => {
      const absolutePath = path.join(directory, entry.name);
      return entry.isDirectory() ? collectFiles(absolutePath) : [absolutePath];
    });
}

function computeSiteHash() {
  const siteRoot = path.join(root, 'site');
  const hash = createHash('sha256');
  for (const file of collectFiles(siteRoot)) {
    hash.update(path.relative(siteRoot, file).split(path.sep).join('/'));
    hash.update('\0');
    hash.update(readFileSync(file));
    hash.update('\0');
  }
  return hash.digest('hex');
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
  assert.match(rootReadme, /Issue #9/);
  assert.doesNotMatch(rootReadme, /https:\/\/herehigher\.github\.io/);

  const commonFacts = [
    /Issue #9/,
    /python3 -m http\.server 8000 --directory site/,
    /\?lang=ja/,
    /\?lang=zh-CN/,
    /\?lang=en/,
    /localStorage/,
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
    for (const pattern of [...commonFacts, ...localeFacts[relativePath]]) {
      assert.match(markdown, pattern, `${relativePath} is missing ${pattern}`);
    }
  }
});

test('AGENTS links the canonical development and documentation guide', () => {
  const agents = readFileSync(path.join(root, 'AGENTS.md'), 'utf8');
  assert.match(agents, /\[開発ガイド\]\(docs\/development-guide\.md\)/);
  assert.match(agents, /Cloudflare Web Analytics の公開 site token/);
  assert.match(readFileSync(path.join(root, 'CONTRIBUTING.md'), 'utf8'), /公開 site token は credential ではなく/);
});

test('development docs cover localized public entry and machine-readable contracts', () => {
  const guide = readFileSync(path.join(root, 'docs/development-guide.md'), 'utf8');
  const acceptance = readFileSync(path.join(root, 'docs/acceptance-checklist.md'), 'utf8');
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
});

test('release docs cover the tag-only v0.1.0 deployment and recovery contract', () => {
  const guide = readFileSync(path.join(root, 'docs/development-guide.md'), 'utf8');
  const acceptance = readFileSync(path.join(root, 'docs/acceptance-checklist.md'), 'utf8');

  for (const fact of [
    '.github/workflows/ci.yml',
    'vMAJOR.MINOR.PATCH',
    'v0.1.0 release 手順',
    'npm run test:acceptance',
    'main` push では Pages deployment は開始されません',
    'workflow_dispatch',
    'deploy 済みだが未受入',
    'https://herehigher.github.io/resume/',
    'docs-only follow-up Pull Request'
  ]) assert.match(guide, new RegExp(fact.replaceAll('.', '\\.')));

  for (const fact of [
    'Source が `GitHub Actions`',
    'Enforce HTTPS',
    'Quality / quality',
    'site/` だけ',
    'github-pages` environment',
    'workflow_dispatch',
    'v0.1.0',
    'deploy 済み・未受入'
  ]) assert.match(acceptance, new RegExp(fact.replaceAll('.', '\\.')));
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
    'private browsing',
    'storage eviction',
    'JSON/PDF',
    'profile link',
    'application backend',
    'Cloudflare Web Analytics',
    'cloudflareinsights.com',
    'fingerprinting',
    'custom event'
  ]) {
    assert.match(privacy, new RegExp(fact.replace('/', '\\/'), 'g'));
  }
});

test('asset manifest matches the site, output files, and screenshot dimensions', () => {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.generator.path, 'scripts/generate-doc-assets.mjs');
  assert.equal(manifest.source.siteHash, computeSiteHash());
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
