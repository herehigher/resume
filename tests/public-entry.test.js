import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

import { findExternalRuntimeAssets } from '../scripts/check-site.mjs';
import { publicDocumentContracts } from '../scripts/deployment-path-contract.mjs';
import {
  CARD_PRESENTATIONS,
  MASCOT_RELATIVE_PATH,
  renderOpenGraphCards
} from '../scripts/render-open-graph-cards.mjs';
import en from '../site/assets/js/i18n/en.js';
import ja from '../site/assets/js/i18n/ja.js';
import zhCN from '../site/assets/js/i18n/zh-CN.js';
import { validateState } from '../site/assets/js/state/schema.js';
import { parseImportedState } from '../site/assets/js/state/storage.js';

const routePresentation = Object.freeze({
  'en/index.html': {
    h1: 'Create an English resume', brandSubtitle: 'ATS-friendly English Resume', assetPath: '../assets/favicon/',
    openGraphLocale: 'en_US', openGraphAlternates: ['ja_JP', 'zh_CN'], openGraphImage: 'resume-studio-og-en.png',
    openGraphImageAlt: 'Resume Studio — Build your resume. Keep your data local.'
  },
  'index.html': {
    h1: '日本語の履歴書・職務経歴書を作成', brandSubtitle: '履歴書・職務経歴書', assetPath: './assets/favicon/',
    openGraphLocale: 'ja_JP', openGraphAlternates: ['zh_CN', 'en_US'], openGraphImage: 'resume-studio-og-ja.png',
    openGraphImageAlt: 'Resume Studio — 履歴書をつくる。データは端末の中に。'
  },
  'zh-cn/index.html': {
    h1: '创建简体中文简历', brandSubtitle: '中文简历', assetPath: '../assets/favicon/',
    openGraphLocale: 'zh_CN', openGraphAlternates: ['ja_JP', 'en_US'], openGraphImage: 'resume-studio-og-zh-cn.png',
    openGraphImageAlt: 'Resume Studio — 创建简历，数据留在本地。'
  }
});
const routes = Object.freeze(publicDocumentContracts().map((contract) => ({
  ...routePresentation[contract.artifactPath],
  canonical: contract.canonical,
  file: `site/${contract.artifactPath}`,
  lang: contract.lang
})));
const base = routes[0].canonical;
const faviconAssets = Object.freeze([
  { rel: 'icon', file: 'resume-studio-marmot-16.png', sizes: '16x16', width: 16 },
  { rel: 'icon', file: 'resume-studio-marmot-32.png', sizes: '32x32', width: 32 },
  { rel: 'icon', file: 'resume-studio-marmot-192.png', sizes: '192x192', width: 192 },
  { rel: 'icon', file: 'resume-studio-marmot-512.png', sizes: '512x512', width: 512 },
  { rel: 'apple-touch-icon', file: 'resume-studio-marmot-180.png', sizes: '180x180', width: 180 }
]);
const alternateLinks = Object.freeze({
  ja: base,
  'zh-CN': `${base}zh-cn/`,
  en: `${base}en/`,
  'x-default': base
});
const licenseUrl = 'https://github.com/herehigher/resume/blob/main/LICENSE';
const xProfileUrl = 'https://x.com/kanhigher';
const keywordMetadata = Object.freeze({
  'site/index.html': '無料オンライン履歴書作成, オープンソース履歴書作成, ローカル処理, プライバシー重視, PDF履歴書作成, 履歴書テンプレート, 職務経歴書テンプレート',
  'site/ja/index.html': '無料オンライン履歴書作成, オープンソース履歴書作成, ローカル処理, プライバシー重視, PDF履歴書作成, 履歴書テンプレート, 職務経歴書テンプレート',
  'site/zh-cn/index.html': '免费在线简历制作, 开源简历生成器, 本地处理, 隐私安全, PDF简历生成, 简历模板, 中文简历模板',
  'site/en/index.html': 'free online resume builder, open source resume builder, local processing, privacy-first resume editor, PDF resume generator, resume templates, English CV template',
  'site/editor/index.html': '無料オンライン履歴書作成, オープンソース履歴書作成, ローカル処理, プライバシー重視, PDF履歴書作成, 免费在线简历制作, 开源简历生成器, 本地处理, 隐私安全, PDF简历生成, free online resume builder, open source resume builder, local processing, privacy-first resume editor, PDF resume generator'
});
const descriptionTerms = Object.freeze({
  'site/index.html': ['無料', 'オープンソース', 'オンライン', '端末内', 'テンプレート', 'PDF'],
  'site/ja/index.html': ['無料', 'オープンソース', 'オンライン', '端末内', 'テンプレート', 'PDF'],
  'site/zh-cn/index.html': ['免费', '开源', '在线', '本地设备', '模板', 'PDF'],
  'site/en/index.html': ['free', 'open-source', 'online', 'locally', 'template', 'PDF']
});

function source(file) {
  return readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
}

function linkTarget(html, rel, language = '') {
  const match = html.match(new RegExp(`<link\\s+[^>]*rel="${rel}"[^>]*${language ? `hreflang="${language}"[^>]*` : ''}href="([^"]+)"`, 'i'));
  return match?.[1] || '';
}

function linkAttributes(html) {
  return [...html.matchAll(/<link\s+([^>]+)>/gi)].map((match) => Object.fromEntries(
    [...match[1].matchAll(/([\w-]+)="([^"]*)"/g)].map((attribute) => [attribute[1], attribute[2]])
  ));
}

function metaValues(html, key) {
  return [...html.matchAll(/<meta\s+([^>]+)>/gi)]
    .map((match) => Object.fromEntries(
      [...match[1].matchAll(/([\w:-]+)="([^"]*)"/g)].map((attribute) => [attribute[1], attribute[2]])
    ))
    .filter((attributes) => attributes.property === key || attributes.name === key)
    .map((attributes) => attributes.content);
}

function pngDimensions(file) {
  const png = readFileSync(file);
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  return { colorType: png[25], width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

function fileSha256(file) {
  return createHash('sha256').update(readFileSync(new URL(`../${file}`, import.meta.url))).digest('hex');
}

function resolvePointer(root, reference) {
  return reference.slice(1).split('/').filter(Boolean).reduce((value, part) => value[part], root);
}

function validateSchema(schema, value, pointer = '#', root = schema) {
  if (schema.$ref) return validateSchema(resolvePointer(root, schema.$ref), value, schema.$ref, root);
  if (schema.const !== undefined && value !== schema.const) return false;
  if (schema.enum && !schema.enum.includes(value)) return false;
  if (schema.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    if ((schema.required || []).some((key) => !(key in value))) return false;
    if (schema.additionalProperties === false && Object.keys(value).some((key) => !(key in (schema.properties || {})))) return false;
    return Object.entries(schema.properties || {}).every(([key, child]) => (
      !(key in value) || validateSchema(child, value[key], `${pointer}/properties/${key}`, root)
    ));
  }
  if (schema.type === 'array') return Array.isArray(value)
    && (!schema.maxItems || value.length <= schema.maxItems)
    && (!schema.uniqueItems || new Set(value.map((item) => JSON.stringify(item))).size === value.length)
    && value.every((item) => validateSchema(schema.items, item, `${pointer}/items`, root));
  if (schema.type === 'string') return typeof value === 'string' && (!schema.pattern || new RegExp(schema.pattern).test(value));
  return true;
}

test('public routes have reciprocal canonical and hreflang metadata with useful no-JavaScript content', () => {
  for (const route of routes) {
    const html = source(route.file);
    assert.match(html, new RegExp(`<html\\s+lang="${route.lang}"`, 'i'));
    assert.match(html, /<meta\s+name="description"\s+content="[^"]+"/i);
    assert.match(html, /<title>[^<]+<\/title>/i);
    assert.match(html, new RegExp(`<h1[^>]*>${route.h1}</h1>`));
    const links = linkAttributes(html);
    for (const asset of faviconAssets) {
      const href = `${route.assetPath}${asset.file}`;
      const link = links.find((candidate) => candidate.rel === asset.rel && candidate.href === href);
      assert.deepEqual(link, { rel: asset.rel, type: 'image/png', sizes: asset.sizes, href }, `${route.file} must expose ${asset.file}`);
      const file = new URL(href, new URL(`../${route.file}`, import.meta.url));
      assert.equal(existsSync(file), true);
      assert.deepEqual(pngDimensions(file), { colorType: 6, width: asset.width, height: asset.width });
    }
    assert.equal(linkTarget(html, 'canonical'), route.canonical);
    for (const [locale, url] of Object.entries(alternateLinks)) {
      assert.equal(linkTarget(html, 'alternate', locale), url, `${route.file} must link to ${locale}`);
    }
    const title = html.match(/<title>([^<]+)<\/title>/i)?.[1] || '';
    const description = metaValues(html, 'description')[0] || '';
    const imageUrl = `${base}assets/social/${route.openGraphImage}`;
    assert.deepEqual(metaValues(html, 'og:type'), ['website']);
    assert.deepEqual(metaValues(html, 'og:site_name'), ['Resume Studio']);
    assert.deepEqual(metaValues(html, 'og:title'), [title]);
    assert.deepEqual(metaValues(html, 'og:description'), [description]);
    assert.deepEqual(metaValues(html, 'og:url'), [route.canonical]);
    assert.deepEqual(metaValues(html, 'og:locale'), [route.openGraphLocale]);
    assert.deepEqual(metaValues(html, 'og:locale:alternate'), route.openGraphAlternates);
    assert.deepEqual(metaValues(html, 'og:image'), [imageUrl]);
    assert.deepEqual(metaValues(html, 'og:image:type'), ['image/png']);
    assert.deepEqual(metaValues(html, 'og:image:width'), ['1200']);
    assert.deepEqual(metaValues(html, 'og:image:height'), ['630']);
    assert.deepEqual(metaValues(html, 'og:image:alt'), [route.openGraphImageAlt]);
    assert.deepEqual(metaValues(html, 'twitter:card'), ['summary_large_image']);
    assert.deepEqual(metaValues(html, 'twitter:title'), [title]);
    assert.deepEqual(metaValues(html, 'twitter:description'), [description]);
    assert.deepEqual(metaValues(html, 'twitter:image'), [imageUrl]);
    assert.deepEqual(metaValues(html, 'twitter:image:alt'), [route.openGraphImageAlt]);
    const { width, height } = pngDimensions(new URL(`../site/assets/social/${route.openGraphImage}`, import.meta.url));
    assert.deepEqual({ width, height }, { width: 1200, height: 630 });
  }

  for (const route of routes) {
    const html = source(route.file);
    assert.match(html, /<html\b[^>]*data-analytics-mode="disabled"[^>]*data-analytics-provider="none"/i);
    assert.doesNotMatch(html, /data-cf-beacon|cloudflareinsights\.com/i);
    assert.deepEqual(findExternalRuntimeAssets(html), []);
  }

  for (const route of routes.slice(1)) {
    const html = source(route.file);
    assert.match(html, /source build|official release/);
    assert.match(html, /PDF/i);
    assert.match(html, /JSON/i);
    assert.match(html, /<a class="entry-button" href="\.\.\/editor\/\?lang=/);
    assert.match(html, /href="\.\.\/schema\/resume-studio-web-v3\.schema\.json"/);
    assert.match(html, new RegExp(`<div class="entry-brand">[\\s\\S]*?<img class="entry-mark" src="\\.\\.\\/assets\\/favicon\\/resume-studio-marmot-192\\.png" alt="" width="50" height="50">[\\s\\S]*?<div class="entry-brand-copy"><strong class="entry-brand-title">Resume Studio<\\/strong><small class="entry-brand-subtitle">${route.brandSubtitle}<\\/small>`));
    assert.match(html, /<div class="entry-main">[\s\S]*?<p class="entry-lede">[\s\S]*?<div class="entry-trust-list"[\s\S]*?data-analytics-disclosure="status"/);
    assert.equal((html.match(/class="entry-trust-row"/g) || []).length, 2);
    assert.match(html, /<a class="entry-button"[^>]*>[\s\S]*?<span aria-hidden="true">→<\/span><\/a>/);
    assert.equal(existsSync(new URL('../site/schema/resume-studio-web-v3.schema.json', import.meta.url)), true);
    assert.match(html, new RegExp(`data-analytics-disclosure="status"[\\s\\S]*?${licenseUrl.replaceAll('/', '\\/')}`));
    assert.match(html, new RegExp(`<a[^>]*href="${licenseUrl}"[^>]*target="_blank"[^>]*rel="noopener noreferrer"[^>]*>MIT License<\\/a>`));
  }

  for (const file of [...routes.map((route) => route.file), 'site/ja/index.html']) {
    const html = source(file);
    assert.match(
      html,
      /<div class="entry-actions">[\s\S]*?<\/div>\s*<p class="entry-links">[\s\S]*?<\/p>\s*<p class="entry-legal">/,
      `${file} must place language links between the primary action and legal notice`
    );
  }
});

test('Open Graph card manifest binds every committed image to its generator and original mascot', () => {
  const manifest = JSON.parse(source('site/assets/social/resume-studio-og.manifest.json'));
  assert.equal(manifest.schemaVersion, 1);
  assert.deepEqual(manifest.generator, {
    path: 'scripts/render-open-graph-cards.mjs',
    sha256: fileSha256('scripts/render-open-graph-cards.mjs')
  });
  assert.deepEqual(manifest.mascot, {
    path: MASCOT_RELATIVE_PATH,
    sha256: fileSha256(MASCOT_RELATIVE_PATH)
  });
  assert.deepEqual(Object.keys(manifest.cards).sort(), Object.keys(CARD_PRESENTATIONS).sort());
  for (const [locale, presentation] of Object.entries(CARD_PRESENTATIONS)) {
    assert.deepEqual(manifest.cards[locale], {
      output: presentation.output,
      sha256: fileSha256(`site/assets/social/${presentation.output}`)
    });
  }
});

test('committed Open Graph cards must be regenerated as a complete locale set', async () => {
  await assert.rejects(
    renderOpenGraphCards({ locales: ['ja'] }),
    /must be rendered together with --locale all/
  );
});

test('entry and editor metadata describes the free, local, private PDF resume experience in every locale', () => {
  for (const [file, keywords] of Object.entries(keywordMetadata)) {
    const html = source(file);
    assert.match(html, new RegExp(`<meta name="keywords" content="${keywords.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}">`));
  }
  for (const [file, terms] of Object.entries(descriptionTerms)) {
    const description = source(file).match(/<meta name="description" content="([^"]+)">/)?.[1] || '';
    for (const term of terms) assert.match(description, new RegExp(term, 'i'), `${file} description must include ${term}`);
  }
  const editor = source('site/editor/index.html');
  assert.match(editor, /無料オンライン履歴書作成/);
  assert.match(editor, /free online resume builder/);
  assert.match(editor, /<meta name="robots" content="noindex,follow">/);
});

test('public routes show the X contact link beside the copyright notice', () => {
  for (const route of routes) {
    const html = source(route.file);
    assert.match(html, new RegExp(
      `<p class="entry-legal">[\\s\\S]*?<a class="x-contact-link" href="${xProfileUrl.replaceAll('/', '\\/')}" target="_blank" rel="noopener noreferrer" aria-label="X: @kanhigher">[\\s\\S]*?<svg class="x-contact-icon" aria-hidden="true" focusable="false" viewBox="0 0 24 24">[\\s\\S]*?<span>@kanhigher<\\/span>[\\s\\S]*?<\\/a>[\\s\\S]*?<\\/p>`
    ));
  }

  const css = source('site/assets/css/public-entry.css');
  assert.match(css, /\.x-contact-link\s*\{[\s\S]*?align-items: center;[\s\S]*?display: inline-flex;[\s\S]*?white-space: nowrap;/);
  assert.match(css, /\.x-contact-icon\s*\{[\s\S]*?fill: currentColor;[\s\S]*?height: 1em;[\s\S]*?width: 1em;/);
});

test('default Japanese entry opens the editor directly and the legacy Japanese URL consolidates to it', () => {
  const root = source('site/index.html');
  assert.match(root, /<a class="entry-button" href="\.\/editor\/\?lang=ja">日本語で編集を始める/);
  assert.match(root, /href="\.\/schema\/resume-studio-web-v3\.schema\.json"/);
  assert.match(root, /各言語の書類内容は独立して保存されます/);
  assert.doesNotMatch(root, /\.\/ja\//);

  const legacy = source('site/ja/index.html');
  assert.match(legacy, /<link rel="canonical" href="https:\/\/herehigher\.github\.io\/resume\/">/);
  assert.doesNotMatch(legacy, /hreflang=/);
  assert.match(legacy, /<a class="entry-button" href="\.\.\/editor\/\?lang=ja">/);
});

test('editor brand opens the active locale entry and public entries use the shared decorative mark', () => {
  const html = source('site/editor/index.html');
  assert.match(html, /<meta name="robots" content="noindex,follow">/);
  assert.doesNotMatch(html, /hreflang=/);
  assert.match(html, /<a class="brand" href="\.\.\/" aria-label="Resume Studio の紹介ページを開く">/);
  assert.match(html, /<img class="brand-mark" src="\.\.\/assets\/favicon\/resume-studio-marmot-192\.png" alt="" width="38" height="38">/);
  assert.match(source('site/assets/css/base.css'), /\.brand-mark\s*\{[\s\S]*?border-radius: 10px;[\s\S]*?height: 38px;[\s\S]*?object-fit: cover;[\s\S]*?width: 38px;/);
  assert.match(source('site/assets/css/responsive.css'), /\.brand-mark\s*\{ border-radius: 9px; height: 34px; width: 34px; \}/);
  const publicEntryCss = source('site/assets/css/public-entry.css');
  assert.match(publicEntryCss, /\.entry-header\s*\{[^}]*padding: 30px;/);
  assert.match(publicEntryCss, /\.entry-brand\s*\{[\s\S]*?align-items: center;[\s\S]*?display: flex;[\s\S]*?gap: 12px;/);
  assert.match(publicEntryCss, /\.entry-brand-copy\s*\{[\s\S]*?flex-direction: column;[\s\S]*?justify-content: center;[\s\S]*?min-width: 0;/);
  assert.match(publicEntryCss, /\.entry-brand-title\s*\{[\s\S]*?font-size: 15px;[\s\S]*?font-weight: 700;[\s\S]*?letter-spacing: -\.01em;[\s\S]*?line-height: 1\.25;/);
  assert.match(publicEntryCss, /\.entry-brand-subtitle\s*\{[\s\S]*?color: #64748b;[\s\S]*?font-size: 13px;[\s\S]*?line-height: 1\.45;[\s\S]*?margin-top: 3px;/);
  assert.match(publicEntryCss, /\.entry-mark\s*\{[\s\S]*?background: #fff;[\s\S]*?border: 1px solid rgba\(15, 23, 42, \.12\);[\s\S]*?border-radius: 10px;[\s\S]*?box-shadow: 0 2px 8px rgba\(15, 23, 42, \.08\);[\s\S]*?height: 50px;[\s\S]*?object-fit: cover;[\s\S]*?width: 50px;/);
  assert.match(publicEntryCss, /\.entry-main\s*\{[^}]*margin: 32px auto 0;[^}]*max-width: 650px;/);
  assert.match(publicEntryCss, /\.entry-main h1\s*\{[\s\S]*?font-size: clamp\(23px, 3\.1vw, 31px\);[\s\S]*?letter-spacing: -\.035em;[\s\S]*?line-height: 1\.3;[\s\S]*?margin: 0;[\s\S]*?overflow-wrap: anywhere;/);
  assert.match(publicEntryCss, /\.entry-lede\s*\{[\s\S]*?color: #354250;[\s\S]*?font-size: 16px;[\s\S]*?line-height: 1\.7;[\s\S]*?margin: 14px 0 0;/);
  assert.match(publicEntryCss, /\.entry-trust-list\s*\{[\s\S]*?gap: 9px;[\s\S]*?margin: 21px 0 0;/);
  assert.match(publicEntryCss, /\.entry-trust-dot\s*\{[\s\S]*?background: #eef5fc;[\s\S]*?border: 1px solid #cadeef;[\s\S]*?height: 19px;[\s\S]*?line-height: 17px;[\s\S]*?width: 19px;/);
  assert.match(publicEntryCss, /\.entry-actions\s*\{[\s\S]*?justify-content: center;[\s\S]*?margin: 28px 0 0;/);
  assert.match(publicEntryCss, /\.entry-button\s*\{[\s\S]*?display: inline-flex;[\s\S]*?font-size: 14px;[\s\S]*?gap: 8px;[\s\S]*?min-height: 44px;[\s\S]*?padding: 0 19px;/);
  assert.match(publicEntryCss, /\.entry-button:hover\s*\{[^}]*background: #194f86;/);
  assert.match(publicEntryCss, /\.entry-legal\s*\{[\s\S]*?font-size: 12px;[\s\S]*?margin: 0;[\s\S]*?text-align: center;/);
  assert.match(publicEntryCss, /\.entry-links\s*\{[^}]*font-size: 13px;[^}]*margin: 10px 0 14px;[^}]*text-align: center;/);
  assert.match(publicEntryCss, /@media \(max-width: 620px\)[\s\S]*?\.entry-main h1\s*\{[^}]*font-size: 23px;/);
  assert.deepEqual(
    [ja.brandEntry, zhCN.brandEntry, en.brandEntry],
    ['Resume Studio の紹介ページを開く', '打开 Resume Studio 简介页', 'Open the Resume Studio introduction']
  );
  const controller = source('site/assets/js/ui/locale-controller.js');
  assert.match(controller, /const publicEntryPaths = Object\.freeze\(\{[\s\S]*?ja: '\.\.\/',[\s\S]*?'zh-CN': '\.\.\/zh-cn\/',[\s\S]*?en: '\.\.\/en\/'/);
  assert.match(controller, /brand\.href = publicEntryPaths\[locale\];/);
  assert.match(controller, /brand\.setAttribute\('aria-label', copy\.brandEntry\)/);
});

test('static guard permits only canonical and alternate external link metadata', () => {
  assert.deepEqual(findExternalRuntimeAssets([
    '<link rel="canonical" href="https://herehigher.github.io/resume/">',
    '<link rel="alternate" hreflang="en" href="https://herehigher.github.io/resume/en/">'
  ].join('')), []);
  for (const tag of [
    `<script type="module" src="https://static.cloudflareinsights.com/beacon.min.js?unexpected=1" data-cf-beacon='{"token":"${'a'.repeat(32)}"}'></script>`,
    '<script type="module" src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon=\'{"token":"wrong"}\'></script>',
    `<script type="module" src="https://example.test/beacon.min.js" data-cf-beacon='{"token":"${'a'.repeat(32)}"}'></script>`,
    '<link rel="preconnect" href="https://example.test">',
    '<link rel="icon" href="https://example.test/icon.svg">',
    '<link rel="stylesheet" href="https://example.test/style.css">',
    '<link rel=preconnect href=https://example.test>'
  ]) {
    assert.equal(findExternalRuntimeAssets(tag).length, 1, tag);
  }
});

test('sitemap is well formed and lists only canonical public URLs', () => {
  const sitemap = source('site/sitemap.xml');
  assert.match(sitemap, /^<\?xml version="1\.0" encoding="UTF-8"\?>\s*<urlset\b[\s\S]*<\/urlset>\s*$/);
  const locations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
  assert.deepEqual(locations, routes.map((route) => route.canonical));
});

test('published JSON Schema accepts exports and rejects primary invalid values', () => {
  const schema = JSON.parse(source('site/schema/resume-studio-web-v3.schema.json'));
  const example = JSON.parse(source('site/schema/resume-studio-web-v3.example.json'));
  assert.equal(validateSchema(schema, example), true);
  assert.deepEqual(parseImportedState(JSON.stringify(example)), example);

  const invalidVersion = structuredClone(example);
  invalidVersion.version = 4;
  assert.equal(validateSchema(schema, invalidVersion), false);

  const missingVersion = structuredClone(example);
  delete missingVersion.version;
  assert.equal(validateSchema(schema, missingVersion), false);

  const retiredRevision = structuredClone(example);
  retiredRevision.schemaRevision = 1;
  assert.equal(validateSchema(schema, retiredRevision), false);
  assert.equal(validateState(retiredRevision).valid, false);

  const invalidLocale = structuredClone(example);
  invalidLocale.settings.locale = 'fr';
  assert.equal(validateSchema(schema, invalidLocale), false);

  const missingRequiredField = structuredClone(example);
  delete missingRequiredField.documents.en.resume.summary;
  assert.equal(validateSchema(schema, missingRequiredField), false);

  const missingNationality = structuredClone(example);
  delete missingNationality.profile.fields.nationality;
  assert.equal(validateSchema(schema, missingNationality), false);
  assert.equal(validateState(missingNationality).valid, false);

  const invalidGender = structuredClone(example);
  invalidGender.profile.fields.gender = '男性';
  assert.equal(validateSchema(schema, invalidGender), false);
  assert.equal(validateState(invalidGender).valid, false);

  const missingOptionalPersonalDetails = structuredClone(example);
  delete missingOptionalPersonalDetails.documents.en.resume.showOptionalPersonalDetails;
  assert.equal(validateSchema(schema, missingOptionalPersonalDetails), false);
  assert.equal(validateState(missingOptionalPersonalDetails).valid, false);

  const unsafePhoto = structuredClone(example);
  unsafePhoto.profile.photo = 'https://example.test/photo.png';
  assert.equal(validateState(unsafePhoto).valid, false);
  assert.equal(validateSchema(schema, unsafePhoto), false);

  const caseInsensitivePhoto = structuredClone(example);
  caseInsensitivePhoto.profile.photo = 'DATA:IMAGE/PNG;BASE64,AAAA';
  assert.equal(validateState(caseInsensitivePhoto).valid, true);
  assert.equal(validateSchema(schema, caseInsensitivePhoto), true);

  for (const mutate of [
    (value) => { value.settings.pageBreaks.en.A4.resume = ['career-history']; },
    (value) => { value.settings.pageBreaks.ja.A4.resume = ['experience']; },
    (value) => { value.settings.pageBreaks.extra = {}; },
    (value) => { value.settings.pageBreaks.en.B5 = { resume: [] }; },
    (value) => { value.settings.pageBreaks.en.A4.extra = []; },
    (value) => { value.settings.pageBreaks.en.A4.resume = ['projects', 'projects']; },
    (value) => { value.settings.pageBreaks.en.A4.resume = Array(7).fill('projects'); },
    (value) => { value.settings.pageBreaks.en.A4.resume = 'projects'; }
  ]) {
    const invalidBreaks = structuredClone(example);
    mutate(invalidBreaks);
    assert.equal(validateSchema(schema, invalidBreaks), false);
    assert.equal(validateState(invalidBreaks).valid, false);
  }
});
