import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

import { findExternalRuntimeAssets } from '../scripts/check-site.mjs';
import { publicDocumentContracts } from '../scripts/deployment-path-contract.mjs';
import en from '../site/assets/js/i18n/en.js';
import ja from '../site/assets/js/i18n/ja.js';
import zhCN from '../site/assets/js/i18n/zh-CN.js';
import { validateState } from '../site/assets/js/state/schema.js';
import { parseImportedState } from '../site/assets/js/state/storage.js';

const routePresentation = Object.freeze({
  'en/index.html': { h1: 'Create an English resume', brandSubtitle: 'ATS-friendly English Resume', assetPath: '../assets/favicon/' },
  'index.html': { h1: '履歴書・職務経歴書を、この端末で作成', assetPath: './assets/favicon/' },
  'ja/index.html': { h1: '日本語の履歴書・職務経歴書を作成', brandSubtitle: '履歴書・職務経歴書', assetPath: '../assets/favicon/' },
  'zh-cn/index.html': { h1: '创建简体中文简历', brandSubtitle: '中文简历', assetPath: '../assets/favicon/' }
});
const routes = Object.freeze(publicDocumentContracts().map((contract) => ({
  ...routePresentation[contract.artifactPath],
  canonical: contract.canonical,
  file: `site/${contract.artifactPath}`,
  lang: contract.lang
})));
const base = routes[0].canonical;
const faviconAssets = Object.freeze([
  { rel: 'icon', file: 'resume-studio-16.png', sizes: '16x16', width: 16 },
  { rel: 'icon', file: 'resume-studio-32.png', sizes: '32x32', width: 32 },
  { rel: 'icon', file: 'resume-studio-192.png', sizes: '192x192', width: 192 },
  { rel: 'icon', file: 'resume-studio.png', sizes: '512x512', width: 512 },
  { rel: 'apple-touch-icon', file: 'resume-studio-180.png', sizes: '180x180', width: 180 }
]);
const alternateLinks = Object.freeze({
  ja: `${base}ja/`,
  'zh-CN': `${base}zh-cn/`,
  en: `${base}en/`,
  'x-default': base
});
const licenseUrl = 'https://github.com/herehigher/resume/blob/main/LICENSE';

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

function pngDimensions(file) {
  const png = readFileSync(file);
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
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
    return Object.entries(schema.properties || {}).every(([key, child]) => (
      !(key in value) || validateSchema(child, value[key], `${pointer}/properties/${key}`, root)
    ));
  }
  if (schema.type === 'array') return Array.isArray(value) && value.every((item) => validateSchema(schema.items, item, `${pointer}/items`, root));
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
      assert.deepEqual(pngDimensions(file), { width: asset.width, height: asset.width });
    }
    assert.equal(linkTarget(html, 'canonical'), route.canonical);
    for (const [locale, url] of Object.entries(alternateLinks)) {
      assert.equal(linkTarget(html, 'alternate', locale), url, `${route.file} must link to ${locale}`);
    }
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
    assert.match(html, /href="\.\.\/schema\/resume-studio-web-v1\.schema\.json"/);
    assert.match(html, new RegExp(`<div class="entry-brand">[\\s\\S]*?<img class="entry-mark" src="\\.\\.\\/assets\\/favicon\\/resume-studio-192\\.png" alt="" width="50" height="50">[\\s\\S]*?<div class="entry-brand-copy"><strong class="entry-brand-title">Resume Studio<\\/strong><small class="entry-brand-subtitle">${route.brandSubtitle}<\\/small>`));
    assert.match(html, /<div class="entry-main">[\s\S]*?<p class="entry-lede">[\s\S]*?<div class="entry-trust-list"[\s\S]*?data-analytics-disclosure="status"/);
    assert.equal((html.match(/class="entry-trust-row"/g) || []).length, 2);
    assert.match(html, /<a class="entry-button"[^>]*>[\s\S]*?<span aria-hidden="true">→<\/span><\/a>/);
    assert.match(html, /<div class="entry-actions">[\s\S]*?<\/div>\s*<p class="entry-legal">/);
    assert.equal(existsSync(new URL('../site/schema/resume-studio-web-v1.schema.json', import.meta.url)), true);
    assert.match(html, new RegExp(`data-analytics-disclosure="status"[\\s\\S]*?${licenseUrl.replaceAll('/', '\\/')}`));
    assert.match(html, new RegExp(`<a[^>]*href="${licenseUrl}"[^>]*target="_blank"[^>]*rel="noopener noreferrer"[^>]*>MIT License<\\/a>`));
  }
});

test('editor brand opens the active locale entry and public entries use the shared decorative mark', () => {
  const html = source('site/editor/index.html');
  assert.match(html, /<meta name="robots" content="noindex,follow">/);
  assert.doesNotMatch(html, /hreflang=/);
  assert.match(html, /<a class="brand" href="\.\.\/ja\/" aria-label="Resume Studio の紹介ページを開く">/);
  assert.match(html, /<img class="brand-mark" src="\.\.\/assets\/favicon\/resume-studio-192\.png" alt="" width="38" height="38">/);
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
  assert.match(publicEntryCss, /\.entry-actions\s*\{[\s\S]*?justify-content: center;[\s\S]*?margin: 28px 0 22px;/);
  assert.match(publicEntryCss, /\.entry-button\s*\{[\s\S]*?display: inline-flex;[\s\S]*?font-size: 14px;[\s\S]*?gap: 8px;[\s\S]*?min-height: 44px;[\s\S]*?padding: 0 19px;/);
  assert.match(publicEntryCss, /\.entry-button:hover\s*\{[^}]*background: #194f86;/);
  assert.match(publicEntryCss, /\.entry-legal\s*\{[\s\S]*?font-size: 12px;[\s\S]*?margin: 0;[\s\S]*?text-align: center;/);
  assert.match(publicEntryCss, /\.entry-links\s*\{[^}]*text-align: center;/);
  assert.match(publicEntryCss, /@media \(max-width: 620px\)[\s\S]*?\.entry-main h1\s*\{[^}]*font-size: 23px;/);
  assert.deepEqual(
    [ja.brandEntry, zhCN.brandEntry, en.brandEntry],
    ['Resume Studio の紹介ページを開く', '打开 Resume Studio 简介页', 'Open the Resume Studio introduction']
  );
  const controller = source('site/assets/js/ui/locale-controller.js');
  assert.match(controller, /const publicEntryPaths = Object\.freeze\(\{[\s\S]*?ja: '\.\.\/ja\/',[\s\S]*?'zh-CN': '\.\.\/zh-cn\/',[\s\S]*?en: '\.\.\/en\/'/);
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
  const schema = JSON.parse(source('site/schema/resume-studio-web-v1.schema.json'));
  const example = JSON.parse(source('site/schema/resume-studio-web-v1.example.json'));
  assert.equal(validateSchema(schema, example), true);
  assert.deepEqual(parseImportedState(JSON.stringify(example)), example);

  const invalidVersion = structuredClone(example);
  invalidVersion.version = 2;
  assert.equal(validateSchema(schema, invalidVersion), false);

  const invalidLocale = structuredClone(example);
  invalidLocale.settings.locale = 'fr';
  assert.equal(validateSchema(schema, invalidLocale), false);

  const missingRequiredField = structuredClone(example);
  delete missingRequiredField.documents.en.resume.summary;
  assert.equal(validateSchema(schema, missingRequiredField), false);

  const unsafePhoto = structuredClone(example);
  unsafePhoto.profile.photo = 'https://example.test/photo.png';
  assert.equal(validateState(unsafePhoto).valid, false);
  assert.equal(validateSchema(schema, unsafePhoto), false);

  const caseInsensitivePhoto = structuredClone(example);
  caseInsensitivePhoto.profile.photo = 'DATA:IMAGE/PNG;BASE64,AAAA';
  assert.equal(validateState(caseInsensitivePhoto).valid, true);
  assert.equal(validateSchema(schema, caseInsensitivePhoto), true);
});
