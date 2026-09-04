import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DEPLOYMENT_ORIGIN,
  DEPLOYMENT_PATH_CONTRACTS,
  publicDocumentContracts
} from './deployment-path-contract.mjs';
import {
  CLOUDFLARE_BEACON_URL,
  cloudflareAnalyticsScriptTags,
  isCloudflareAnalyticsScriptTag
} from './cloudflare-analytics.mjs';
import { CLOUDFLARE_PROVIDER } from './prepare-pages-artifact.mjs';

const digestPattern = /^[0-9a-f]{64}$/;
const tokenPattern = /^[0-9a-f]{32}$/;

function fail(message) {
  throw new Error(`Deployment artifact smoke failed: ${message}`);
}

function failure(contract, metadata, message) {
  const smokePath = contract.urlPath || '/';
  fail(`${smokePath} [artifact=${contract.artifactPath}; status=${metadata.status}; content-type=${metadata.contentType}]: ${message}`);
}

function attributes(tag) {
  const values = new Map();
  for (const match of tag.matchAll(/([^\s=/>]+)\s*=\s*(["'])(.*?)\2/g)) {
    values.set(match[1].toLowerCase(), match[3].replaceAll('&quot;', '"'));
  }
  return values;
}

function openingHtml(html, contract, metadata) {
  const tags = html.match(/<html\b[^>]*>/gi) || [];
  if (tags.length !== 1) failure(contract, metadata, 'must contain exactly one html element');
  return attributes(tags[0]);
}

function assertCanonicalLinks(html, contract, metadata) {
  const links = [...html.matchAll(/<link\b[^>]*>/gi)].map((match) => attributes(match[0]));
  const canonical = links.filter((item) => item.get('rel') === 'canonical');
  if (canonical.length !== 1 || canonical[0].get('href') !== contract.canonical) {
    failure(contract, metadata, 'canonical URL is invalid');
  }
  for (const alternate of publicDocumentContracts()) {
    const locale = alternate.lang === 'ja' && !alternate.urlPath ? 'x-default' : alternate.lang;
    const matches = links.filter((item) => item.get('rel') === 'alternate'
      && item.get('hreflang') === locale && item.get('href') === alternate.canonical);
    if (matches.length !== 1) failure(contract, metadata, `${locale} alternate URL is invalid`);
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

function assertAnalytics(html, contract, metadata, { analyticsMode, analyticsProvider, providerFingerprint }) {
  const htmlAttributes = openingHtml(html, contract, metadata);
  for (const attribute of ['data-analytics-mode', 'data-analytics-provider']) {
    if ((html.match(new RegExp(`\\b${attribute}\\s*=`, 'gi')) || []).length !== 1) {
      failure(contract, metadata, `${attribute} must appear exactly once`);
    }
  }
  if (htmlAttributes.get('data-analytics-mode') !== analyticsMode
    || htmlAttributes.get('data-analytics-provider') !== analyticsProvider) {
    failure(contract, metadata, 'analytics tuple is invalid');
  }

  const beaconAttributes = html.match(/\bdata-cf-beacon\s*=/gi) || [];
  const beaconUrls = html.match(new RegExp(CLOUDFLARE_BEACON_URL.replaceAll('.', '\\.'), 'gi')) || [];
  if (analyticsMode === 'disabled') {
    if (beaconAttributes.length || beaconUrls.length || /cloudflareinsights\.com/i.test(html)) {
      failure(contract, metadata, 'includes analytics runtime while disabled');
    }
    return;
  }
  if (beaconAttributes.length !== 1 || beaconUrls.length !== 1) failure(contract, metadata, 'must contain one analytics beacon');
  const tokens = cloudflareTokens(html);
  if (tokens.length !== 1 || !tokens[0] || cloudflareAnalyticsScriptTags(html, tokens[0]).length !== 1) {
    failure(contract, metadata, 'analytics beacon contract is invalid');
  }
  const fingerprint = createHash('sha256').update(tokens[0]).digest('hex');
  if (fingerprint !== providerFingerprint) failure(contract, metadata, 'analytics token fingerprint does not match');
}

function expectedContentType(kind) {
  if (kind === 'html') return 'text/html';
  if (kind === 'xml') return 'application/xml';
  if (kind === 'javascript') return 'text/javascript';
  return 'application/json';
}

function hasExpectedContentType(kind, contentType) {
  const value = contentType.toLowerCase();
  if (kind === 'html') return value.startsWith('text/html');
  if (kind === 'xml') return value.startsWith('application/xml') || value.startsWith('text/xml');
  if (kind === 'javascript') return value.startsWith('text/javascript') || value.startsWith('application/javascript');
  return value.startsWith('application/json');
}

function assertSemanticContract(contract, content, metadata, options) {
  if (!content.includes(contract.marker)) failure(contract, metadata, 'required marker was not found');
  if (!hasExpectedContentType(contract.kind, metadata.contentType)) {
    failure(contract, metadata, `unexpected content type for ${contract.kind}`);
  }
  if (contract.semantic === 'public-document') {
    const htmlAttributes = openingHtml(content, contract, metadata);
    if (htmlAttributes.get('lang') !== contract.lang) failure(contract, metadata, 'language is invalid');
    assertCanonicalLinks(content, contract, metadata);
    assertAnalytics(content, contract, metadata, options);
    return;
  }
  if (contract.semantic === 'editor-document') {
    const htmlAttributes = openingHtml(content, contract, metadata);
    if (htmlAttributes.get('lang') !== contract.lang) failure(contract, metadata, 'language is invalid');
    const canonical = [...content.matchAll(/<link\b[^>]*>/gi)].map((match) => attributes(match[0]))
      .filter((item) => item.get('rel') === 'canonical');
    if (canonical.length !== 1 || canonical[0].get('href') !== contract.canonical) failure(contract, metadata, 'canonical URL is invalid');
    if (!/<meta\s+name="robots"\s+content="noindex,follow">/i.test(content)) failure(contract, metadata, 'must be noindex,follow');
    if (/hreflang=/i.test(content)) failure(contract, metadata, 'must not join the public hreflang cluster');
    assertAnalytics(content, contract, metadata, options);
    return;
  }
  if (contract.semantic === 'compatibility-document') {
    const htmlAttributes = openingHtml(content, contract, metadata);
    if (htmlAttributes.get('lang') !== contract.lang) failure(contract, metadata, 'language is invalid');
    const links = [...content.matchAll(/<link\b[^>]*>/gi)].map((match) => attributes(match[0]));
    const canonical = links.filter((item) => item.get('rel') === 'canonical');
    if (canonical.length !== 1 || canonical[0].get('href') !== contract.canonical) failure(contract, metadata, 'canonical URL is invalid');
    if (!/<meta\s+name="robots"\s+content="noindex,follow">/i.test(content)) failure(contract, metadata, 'must be noindex,follow');
    if (/hreflang=/i.test(content)) failure(contract, metadata, 'must not join the public hreflang cluster');
    assertAnalytics(content, contract, metadata, options);
    return;
  }
  if (contract.semantic === 'sitemap') {
    if (!/^<\?xml version="1\.0" encoding="UTF-8"\?>\s*<urlset\b[\s\S]*<\/urlset>\s*$/.test(content)) {
      failure(contract, metadata, 'is not a complete sitemap document');
    }
    const locations = [...content.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
    if (locations.length !== publicDocumentContracts().length
      || locations.some((location, index) => location !== publicDocumentContracts()[index].canonical)) {
      failure(contract, metadata, 'does not match public document canonical URLs');
    }
    return;
  }
  if (contract.semantic === 'json-schema') {
    let schema;
    try {
      schema = JSON.parse(content);
    } catch {
      failure(contract, metadata, 'is not valid JSON');
    }
    if (schema.$id !== `${DEPLOYMENT_ORIGIN}${contract.artifactPath}` || schema.title !== 'Resume Studio web v1 export') {
      failure(contract, metadata, 'identity or title is invalid');
    }
    return;
  }
  if (contract.semantic === 'import-example') {
    let example;
    try {
      example = JSON.parse(content);
    } catch {
      failure(contract, metadata, 'is not valid JSON');
    }
    if (example.version !== 1) failure(contract, metadata, 'version is invalid');
    return;
  }
  if (contract.semantic === 'version-config') {
    const versionPattern = new RegExp(`^export const APP_VERSION = '${options.packageVersion.replaceAll('.', '\\.')}';$`, 'gm');
    if ((content.match(versionPattern) || []).length !== 1) failure(contract, metadata, 'APP_VERSION does not match package version');
  }
}

function validateOptions({ analyticsMode, analyticsProvider, packageVersion, providerFingerprint }) {
  if (!['disabled', 'enabled'].includes(analyticsMode)) fail('unsupported analytics mode');
  const expectedProvider = analyticsMode === 'enabled' ? CLOUDFLARE_PROVIDER : 'none';
  if (analyticsProvider !== expectedProvider) fail('unsupported analytics provider');
  if (analyticsMode === 'enabled' && !digestPattern.test(providerFingerprint || '')) fail('invalid provider fingerprint');
  if (analyticsMode === 'disabled' && providerFingerprint !== 'none') fail('disabled analytics requires no provider fingerprint');
  if (!/^\d+\.\d+\.\d+$/.test(packageVersion || '')) fail('invalid package version');
}

async function validateWithReader(options, readArtifact) {
  validateOptions(options);
  for (const contract of DEPLOYMENT_PATH_CONTRACTS) {
    const { content, metadata } = await readArtifact(contract);
    assertSemanticContract(contract, content, metadata, options);
  }
  return Object.freeze({
    analyticsMode: options.analyticsMode,
    analyticsProvider: options.analyticsProvider,
    packageVersion: options.packageVersion,
    providerFingerprint: options.providerFingerprint
  });
}

export async function validateDeploymentArtifact({ directory, ...options }) {
  return validateWithReader(options, async (contract) => {
    try {
      return {
        content: await readFile(path.join(directory, contract.artifactPath), 'utf8'),
        metadata: { contentType: expectedContentType(contract.kind), status: 'local' }
      };
    } catch {
      failure(contract, { contentType: 'unknown', status: 'missing' }, 'artifact file is unavailable');
    }
  });
}

export async function validatePublishedDeployment({
  attempts = 4,
  baseUrl,
  fetchImpl = fetch,
  requestTimeoutMs = 30_000,
  releaseSha = '',
  timeoutSignal = (milliseconds) => AbortSignal.timeout(milliseconds),
  ...options
}) {
  let origin;
  try {
    origin = new URL(baseUrl);
    if (origin.protocol !== 'https:' || origin.username || origin.password || !origin.pathname.endsWith('/')) throw new Error();
  } catch {
    fail('published deployment base URL must be an https URL ending in /');
  }
  if (!Number.isInteger(attempts) || attempts < 1 || attempts > 4) fail('published deployment attempts must be between 1 and 4');
  if (!Number.isInteger(requestTimeoutMs) || requestTimeoutMs < 1 || requestTimeoutMs > 30_000) {
    fail('published deployment request timeout must be between 1 and 30000 milliseconds');
  }
  if (typeof timeoutSignal !== 'function') fail('published deployment timeout signal must be a function');
  return validateWithReader(options, async (contract) => {
    let metadata = { contentType: 'unknown', status: 'unavailable' };
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      let signal;
      try {
        const url = new URL(contract.urlPath, origin);
        if (releaseSha) url.searchParams.set('release', releaseSha);
        url.searchParams.set('attempt', String(attempt));
        signal = timeoutSignal(requestTimeoutMs);
        const response = await fetchImpl(url, { redirect: 'error', signal });
        metadata = {
          contentType: response.headers.get('content-type') || 'unknown',
          status: String(response.status)
        };
        const content = await response.text();
        if (response.ok && content.includes(contract.marker) && hasExpectedContentType(contract.kind, metadata.contentType)) {
          return { content, metadata };
        }
      } catch {
        metadata = { contentType: 'unknown', status: signal?.aborted ? 'timeout' : 'request-failed' };
      }
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, 3000));
    }
    failure(contract, metadata, 'response did not satisfy the required marker and content type');
  });
}

function parseArguments(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index];
    const value = args[index + 1];
    if (!name?.startsWith('--') || value === undefined || value.startsWith('--')) fail('invalid command arguments');
    const key = name.slice(2);
    if (!['directory', 'base-url', 'release-sha', 'analytics-mode', 'analytics-provider', 'package-version', 'provider-fingerprint'].includes(key)
      || key in options) fail('unknown or duplicate command argument');
    options[key] = value;
  }
  return options;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const shared = {
    analyticsMode: options['analytics-mode'],
    analyticsProvider: options['analytics-provider'],
    packageVersion: options['package-version'],
    providerFingerprint: options['provider-fingerprint']
  };
  if (options.directory && Object.keys(options).length === 5) {
    await validateDeploymentArtifact({ directory: options.directory, ...shared });
    return;
  }
  if (options['base-url'] && options['release-sha'] && Object.keys(options).length === 6) {
    await validatePublishedDeployment({ baseUrl: options['base-url'], releaseSha: options['release-sha'], ...shared });
    return;
  }
  fail('provide either --directory or --base-url with --release-sha and all shared smoke arguments');
}

const scriptPath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
