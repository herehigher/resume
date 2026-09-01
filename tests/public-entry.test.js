import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

import { findExternalRuntimeAssets } from '../scripts/check-site.mjs';
import { validateState } from '../site/assets/js/state/schema.js';
import { parseImportedState } from '../site/assets/js/state/storage.js';

const base = 'https://herehigher.github.io/resume/';
const routes = Object.freeze([
  { file: 'site/index.html', lang: 'ja', canonical: base, h1: '履歴書を作成' },
  { file: 'site/ja/index.html', lang: 'ja', canonical: `${base}ja/`, h1: '日本語の履歴書・職務経歴書を作成' },
  { file: 'site/zh-cn/index.html', lang: 'zh-CN', canonical: `${base}zh-cn/`, h1: '创建简体中文简历' },
  { file: 'site/en/index.html', lang: 'en', canonical: `${base}en/`, h1: 'Create an English resume' }
]);
const alternateLinks = Object.freeze({
  ja: `${base}ja/`,
  'zh-CN': `${base}zh-cn/`,
  en: `${base}en/`,
  'x-default': base
});

function source(file) {
  return readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
}

function linkTarget(html, rel, language = '') {
  const match = html.match(new RegExp(`<link\\s+[^>]*rel="${rel}"[^>]*${language ? `hreflang="${language}"[^>]*` : ''}href="([^"]+)"`, 'i'));
  return match?.[1] || '';
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
    assert.match(html, /<a class="entry-button" href="\.\.\/\?lang=/);
    assert.match(html, /href="\.\.\/schema\/resume-studio-web-v1\.schema\.json"/);
    assert.equal(existsSync(new URL('../site/schema/resume-studio-web-v1.schema.json', import.meta.url)), true);
  }
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
