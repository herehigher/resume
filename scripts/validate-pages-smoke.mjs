import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CLOUDFLARE_BEACON_URL,
  cloudflareAnalyticsScriptTags,
  isCloudflareAnalyticsScriptTag
} from './cloudflare-analytics.mjs';
import { CLOUDFLARE_PROVIDER } from './prepare-pages-artifact.mjs';

const PAGE_CONTRACTS = Object.freeze([
  Object.freeze({ file: 'index.html', lang: 'ja', canonical: 'https://herehigher.github.io/resume/' }),
  Object.freeze({ file: 'ja/index.html', lang: 'ja', canonical: 'https://herehigher.github.io/resume/ja/' }),
  Object.freeze({ file: 'zh-cn/index.html', lang: 'zh-CN', canonical: 'https://herehigher.github.io/resume/zh-cn/' }),
  Object.freeze({ file: 'en/index.html', lang: 'en', canonical: 'https://herehigher.github.io/resume/en/' })
]);
const EDITOR_CONTRACT = Object.freeze({ file: 'editor/index.html', lang: 'ja', canonical: 'https://herehigher.github.io/resume/editor/' });
const ALTERNATES = Object.freeze({
  ja: 'https://herehigher.github.io/resume/ja/',
  'zh-CN': 'https://herehigher.github.io/resume/zh-cn/',
  en: 'https://herehigher.github.io/resume/en/',
  'x-default': 'https://herehigher.github.io/resume/'
});
const digestPattern = /^[0-9a-f]{64}$/;
const tokenPattern = /^[0-9a-f]{32}$/;

function fail(message) {
  throw new Error(`Deployment artifact smoke failed: ${message}`);
}

function attributes(tag) {
  const values = new Map();
  for (const match of tag.matchAll(/([^\s=/>]+)\s*=\s*(["'])(.*?)\2/g)) {
    values.set(match[1].toLowerCase(), match[3].replaceAll('&quot;', '"'));
  }
  return values;
}

function openingHtml(html, file) {
  const tags = html.match(/<html\b[^>]*>/gi) || [];
  if (tags.length !== 1) fail(`${file} must contain exactly one html element`);
  return attributes(tags[0]);
}

function assertCanonicalLinks(html, contract) {
  const links = [...html.matchAll(/<link\b[^>]*>/gi)].map((match) => attributes(match[0]));
  const canonical = links.filter((item) => item.get('rel') === 'canonical');
  if (canonical.length !== 1 || canonical[0].get('href') !== contract.canonical) {
    fail(`${contract.file} canonical URL is invalid`);
  }
  for (const [locale, href] of Object.entries(ALTERNATES)) {
    const matches = links.filter((item) => item.get('rel') === 'alternate'
      && item.get('hreflang') === locale && item.get('href') === href);
    if (matches.length !== 1) fail(`${contract.file} ${locale} alternate URL is invalid`);
  }
}

function cloudflareTokens(html) {
  return [...html.matchAll(/<script\b[^>]*\bdata-cf-beacon\s*=\s*(["']).*?\1[^>]*><\/script>/gis)]
    .map((match) => match[0])
    .map((tag) => {
      const configuration = attributes(tag).get('data-cf-beacon');
      try {
        const token = JSON.parse(configuration || '').token;
        return tokenPattern.test(token || '') && isCloudflareAnalyticsScriptTag(tag, token) ? token : null;
      } catch {
        return null;
      }
    });
}

function assertAnalytics(html, file, { analyticsMode, analyticsProvider, providerFingerprint }) {
  const htmlAttributes = openingHtml(html, file);
  for (const attribute of ['data-analytics-mode', 'data-analytics-provider']) {
    if ((html.match(new RegExp(`\\b${attribute}\\s*=`, 'gi')) || []).length !== 1) {
      fail(`${file} ${attribute} must appear exactly once`);
    }
  }
  if (htmlAttributes.get('data-analytics-mode') !== analyticsMode
    || htmlAttributes.get('data-analytics-provider') !== analyticsProvider) {
    fail(`${file} analytics tuple is invalid`);
  }

  const beaconAttributes = html.match(/\bdata-cf-beacon\s*=/gi) || [];
  const beaconUrls = html.match(new RegExp(CLOUDFLARE_BEACON_URL.replaceAll('.', '\\.'), 'gi')) || [];
  if (analyticsMode === 'disabled') {
    if (beaconAttributes.length || beaconUrls.length || /cloudflareinsights\.com/i.test(html)) {
      fail(`${file} includes analytics runtime while disabled`);
    }
    return;
  }
  if (beaconAttributes.length !== 1 || beaconUrls.length !== 1) fail(`${file} must contain one analytics beacon`);
  const tokens = cloudflareTokens(html);
  if (tokens.length !== 1 || !tokens[0] || cloudflareAnalyticsScriptTags(html, tokens[0]).length !== 1) {
    fail(`${file} analytics beacon contract is invalid`);
  }
  const fingerprint = createHash('sha256').update(tokens[0]).digest('hex');
  if (fingerprint !== providerFingerprint) fail(`${file} analytics token fingerprint does not match`);
}

export async function validateDeploymentArtifact({
  directory,
  analyticsMode,
  analyticsProvider,
  packageVersion,
  providerFingerprint
}) {
  if (!['disabled', 'enabled'].includes(analyticsMode)) fail('unsupported analytics mode');
  const expectedProvider = analyticsMode === 'enabled' ? CLOUDFLARE_PROVIDER : 'none';
  if (analyticsProvider !== expectedProvider) fail('unsupported analytics provider');
  if (analyticsMode === 'enabled' && !digestPattern.test(providerFingerprint || '')) fail('invalid provider fingerprint');
  if (analyticsMode === 'disabled' && providerFingerprint !== 'none') fail('disabled analytics requires no provider fingerprint');
  if (!/^\d+\.\d+\.\d+$/.test(packageVersion || '')) fail('invalid package version');

  for (const contract of PAGE_CONTRACTS) {
    const html = await readFile(path.join(directory, contract.file), 'utf8');
    const htmlAttributes = openingHtml(html, contract.file);
    if (htmlAttributes.get('lang') !== contract.lang) fail(`${contract.file} language is invalid`);
    assertCanonicalLinks(html, contract);
    assertAnalytics(html, contract.file, { analyticsMode, analyticsProvider, providerFingerprint });
  }
  const editor = await readFile(path.join(directory, EDITOR_CONTRACT.file), 'utf8');
  const editorAttributes = openingHtml(editor, EDITOR_CONTRACT.file);
  if (editorAttributes.get('lang') !== EDITOR_CONTRACT.lang) fail('editor language is invalid');
  const editorCanonical = [...editor.matchAll(/<link\b[^>]*>/gi)].map((match) => attributes(match[0]))
    .filter((item) => item.get('rel') === 'canonical');
  if (editorCanonical.length !== 1 || editorCanonical[0].get('href') !== EDITOR_CONTRACT.canonical) fail('editor canonical URL is invalid');
  if (!/<meta\s+name="robots"\s+content="noindex,follow">/i.test(editor)) fail('editor must be noindex,follow');
  if (/hreflang=/i.test(editor)) fail('editor must not join the public hreflang cluster');
  assertAnalytics(editor, EDITOR_CONTRACT.file, { analyticsMode, analyticsProvider, providerFingerprint });
  const config = await readFile(path.join(directory, 'assets/js/config.js'), 'utf8');
  const versionPattern = new RegExp(`^export const APP_VERSION = '${packageVersion.replaceAll('.', '\\.')}';$`, 'gm');
  if ((config.match(versionPattern) || []).length !== 1) fail('APP_VERSION does not match package version');
  return Object.freeze({ analyticsMode, analyticsProvider, packageVersion, providerFingerprint });
}

function parseArguments(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index];
    const value = args[index + 1];
    if (!name?.startsWith('--') || value === undefined || value.startsWith('--')) fail('invalid command arguments');
    const key = name.slice(2);
    if (!['directory', 'analytics-mode', 'analytics-provider', 'package-version', 'provider-fingerprint'].includes(key)
      || key in options) fail('unknown or duplicate command argument');
    options[key] = value;
  }
  return options;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (Object.keys(options).length !== 5) fail('all smoke contract arguments are required');
  await validateDeploymentArtifact({
    directory: options.directory,
    analyticsMode: options['analytics-mode'],
    analyticsProvider: options['analytics-provider'],
    packageVersion: options['package-version'],
    providerFingerprint: options['provider-fingerprint']
  });
  console.log('Deployment artifact smoke passed.');
}

const scriptPath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
