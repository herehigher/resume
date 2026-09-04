import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { DEPLOYMENT_PATH_CONTRACTS } from '../scripts/deployment-path-contract.mjs';
import {
  CLOUDFLARE_PROVIDER,
  OFFICIAL_REPOSITORY,
  computeTreeDigest,
  deriveCloudflareArtifact,
  prepareArtifact
} from '../scripts/prepare-pages-artifact.mjs';
import { validateDeploymentArtifact, validatePublishedDeployment } from '../scripts/validate-pages-smoke.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const source = path.join(root, 'site');
const token = 'a'.repeat(32);
const fingerprint = createHash('sha256').update(token).digest('hex');
const packageVersion = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).version;

function temporaryDirectory(t) {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'resume-pages-smoke-'));
  t.after(() => rmSync(directory, { force: true, recursive: true }));
  return directory;
}

async function validate(directory, overrides = {}) {
  return validateDeploymentArtifact({
    directory,
    analyticsMode: 'disabled',
    analyticsProvider: 'none',
    packageVersion,
    providerFingerprint: 'none',
    ...overrides
  });
}

async function enabledArtifact(directory) {
  const derived = await deriveCloudflareArtifact({ sourceDirectory: directory, token });
  const manifest = {
    analyticsMode: 'enabled',
    analyticsProvider: CLOUDFLARE_PROVIDER,
    artifactTreeSha256: derived.final_digest,
    providerTokenSha256: fingerprint,
    schemaVersion: 1,
    sourceTreeSha256: await computeTreeDigest(directory)
  };
  const manifestPath = path.join(path.dirname(directory), `${path.basename(directory)}.manifest.json`);
  writeFileSync(manifestPath, `${JSON.stringify(manifest)}\n`);
  const output = `${directory}-prepared`;
  await prepareArtifact({
    manifestPath,
    outputDirectory: output,
    repository: OFFICIAL_REPOSITORY,
    sourceDirectory: directory,
    token
  });
  return { directory: output, fingerprint: derived.provider_fingerprint };
}

async function disabledArtifact(directory) {
  const sourceDigest = await computeTreeDigest(directory);
  const manifestPath = path.join(path.dirname(directory), `${path.basename(directory)}.manifest.json`);
  writeFileSync(manifestPath, `${JSON.stringify({
    analyticsMode: 'disabled',
    analyticsProvider: 'none',
    artifactTreeSha256: sourceDigest,
    providerTokenSha256: null,
    schemaVersion: 1,
    sourceTreeSha256: sourceDigest
  })}\n`);
  const output = `${directory}-prepared`;
  await prepareArtifact({
    manifestPath,
    outputDirectory: output,
    repository: 'fork/example',
    sourceDirectory: directory
  });
  return output;
}

test('semantic smoke accepts disabled and enabled prepared artifacts with legal extra attributes', async (t) => {
  const temporary = temporaryDirectory(t);
  const disabledSource = path.join(temporary, 'disabled');
  cpSync(source, disabledSource, { recursive: true });
  const disabled = await disabledArtifact(disabledSource);
  const disabledHtml = path.join(disabled, 'ja/index.html');
  writeFileSync(disabledHtml, readFileSync(disabledHtml, 'utf8').replace('<html ', '<html data-release-check="local" '));
  await validate(disabled);

  const enabled = path.join(temporary, 'enabled');
  cpSync(source, enabled, { recursive: true });
  const prepared = await enabledArtifact(enabled);
  for (const file of ['index.html', 'ja/index.html', 'zh-cn/index.html', 'en/index.html']) {
    const fullPath = path.join(prepared.directory, file);
    writeFileSync(fullPath, readFileSync(fullPath, 'utf8').replace('<html ', '<html data-release-check="local" '));
  }
  await validate(prepared.directory, {
    analyticsMode: 'enabled',
    analyticsProvider: CLOUDFLARE_PROVIDER,
    providerFingerprint: prepared.fingerprint
  });
});

test('semantic smoke detects language, analytics tuple, beacon duplication, and token mismatch', async (t) => {
  const temporary = temporaryDirectory(t);
  const cases = [
    ['language', 'en/index.html', (html) => html.replace('lang="en"', 'lang="ja"'), /language is invalid/],
    ['tuple', 'ja/index.html', (html) => html.replace('data-analytics-provider="none"', 'data-analytics-provider="other"'), /analytics tuple/],
    ['duplicate tuple', 'ja/index.html', (html) => html.replace('<html ', '<html data-analytics-mode="disabled" '), /must appear exactly once/],
    ['legacy canonical', 'ja/index.html', (html) => html.replace('https://herehigher.github.io/resume/', 'https://example.invalid/'), /canonical URL/],
    ['legacy hreflang', 'ja/index.html', (html) => html.replace('</head>', '<link rel="alternate" hreflang="ja" href="https://herehigher.github.io/resume/">\n</head>'), /must not join the public hreflang cluster/],
    ['ja alternate', 'index.html', (html) => html.replace('hreflang="ja" href="https://herehigher.github.io/resume/"', 'hreflang="ja" href="https://example.invalid/"'), /ja alternate URL/],
    ['unexpected alternate', 'index.html', (html) => html.replace('</head>', '<link rel="alternate" hreflang="fr" href="https://example.invalid/">\n</head>'), /alternate URL set is invalid/],
    ['canonical', 'zh-cn/index.html', (html) => html.replace('https://herehigher.github.io/resume/zh-cn/', 'https://example.invalid/'), /canonical URL/],
    ['editor', 'editor/index.html', (html) => html.replace('noindex,follow', 'index,follow'), /editor\/ \[artifact=editor\/index\.html; status=local; content-type=text\/html\]: must be noindex,follow/],
    ['schema identity', 'schema/resume-studio-web-v1.schema.json', (schema) => schema.replace('https://herehigher.github.io/resume/schema/', 'https://example.invalid/'), /identity or title is invalid/],
    ['import version', 'schema/resume-studio-web-v1.example.json', (example) => example.replace('"version": 1', '"version": 2'), /version is invalid/],
    ['version', 'assets/js/config.js', (config) => config.replace(`APP_VERSION = '${packageVersion}'`, "APP_VERSION = '9.9.9'"), /APP_VERSION/],
    ['beacon', 'index.html', (html) => `${html}<script data-cf-beacon="{}"></script>`, /analytics runtime/]
  ];
  for (const [name, file, mutate, expected] of cases) {
    const artifact = path.join(temporary, name);
    cpSync(source, artifact, { recursive: true });
    const target = path.join(artifact, file);
    writeFileSync(target, mutate(readFileSync(target, 'utf8')));
    await assert.rejects(validate(artifact), expected);
  }

  const enabled = path.join(temporary, 'enabled');
  cpSync(source, enabled, { recursive: true });
  const prepared = await enabledArtifact(enabled);
  const target = path.join(prepared.directory, 'en/index.html');
  writeFileSync(target, readFileSync(target, 'utf8').replace(token, 'b'.repeat(32)));
  await assert.rejects(validate(prepared.directory, {
    analyticsMode: 'enabled',
    analyticsProvider: CLOUDFLARE_PROVIDER,
    providerFingerprint: fingerprint
  }), /fingerprint/);

  for (const [name, mutate, expected] of [
    ['missing-beacon', (html) => html.replace(/\s*<script[^>]*data-cf-beacon[^>]*><\/script>/, ''), /must contain one analytics beacon/],
    ['duplicate-beacon', (html) => {
      const beacon = html.match(/<script[^>]*data-cf-beacon[^>]*><\/script>/)?.[0] || '';
      return html.replace('</body>', `${beacon}</body>`);
    }, /must contain one analytics beacon/]
  ]) {
    const sourceArtifact = path.join(temporary, `${name}-source`);
    cpSync(source, sourceArtifact, { recursive: true });
    const artifact = await enabledArtifact(sourceArtifact);
    const file = path.join(artifact.directory, 'index.html');
    writeFileSync(file, mutate(readFileSync(file, 'utf8')));
    await assert.rejects(validate(artifact.directory, {
      analyticsMode: 'enabled',
      analyticsProvider: CLOUDFLARE_PROVIDER,
      providerFingerprint: fingerprint
    }), expected);
  }
});

test('published smoke fetches every authoritative path and reports editor response metadata', async () => {
  const requests = [];
  const contentTypeFor = (kind) => {
    if (kind === 'html') return 'text/html; charset=utf-8';
    if (kind === 'xml') return 'application/xml; charset=utf-8';
    if (kind === 'javascript') return 'text/javascript; charset=utf-8';
    return 'application/json; charset=utf-8';
  };
  const fetchImpl = async (url) => {
    const request = new URL(url);
    const urlPath = request.pathname.replace('/resume/', '');
    requests.push(urlPath);
    const contract = DEPLOYMENT_PATH_CONTRACTS.find((candidate) => candidate.urlPath === urlPath);
    if (!contract) return new Response('not found', { status: 404 });
    return new Response(readFileSync(path.join(source, contract.artifactPath), 'utf8'), {
      headers: { 'content-type': contentTypeFor(contract.kind) },
      status: 200
    });
  };
  await validatePublishedDeployment({
    analyticsMode: 'disabled',
    analyticsProvider: 'none',
    baseUrl: 'https://example.test/resume/',
    fetchImpl,
    packageVersion,
    providerFingerprint: 'none',
    releaseSha: 'a'.repeat(40)
  });
  assert.deepEqual(requests, DEPLOYMENT_PATH_CONTRACTS.map((contract) => contract.urlPath));

  const missingEditor = async (url) => {
    const request = new URL(url);
    if (request.pathname.endsWith('/editor/')) {
      return new Response('not found', {
        headers: { 'content-type': 'text/html; charset=utf-8' },
        status: 404
      });
    }
    return fetchImpl(url);
  };
  await assert.rejects(validatePublishedDeployment({
    analyticsMode: 'disabled',
    analyticsProvider: 'none',
    attempts: 1,
    baseUrl: 'https://example.test/resume/',
    fetchImpl: missingEditor,
    packageVersion,
    providerFingerprint: 'none'
  }), /editor\/ \[artifact=editor\/index\.html; status=404; content-type=text\/html; charset=utf-8\]/);
});

test('published smoke bounds every request with an injectable timeout signal', async () => {
  const timeoutCalls = [];
  const timeoutSignal = (milliseconds) => {
    timeoutCalls.push(milliseconds);
    return AbortSignal.abort(new Error('simulated timeout'));
  };
  await assert.rejects(validatePublishedDeployment({
    analyticsMode: 'disabled',
    analyticsProvider: 'none',
    attempts: 1,
    baseUrl: 'https://example.test/resume/',
    fetchImpl: async (_url, { signal }) => {
      assert.equal(signal.aborted, true);
      throw signal.reason;
    },
    packageVersion,
    providerFingerprint: 'none',
    requestTimeoutMs: 25,
    timeoutSignal
  }), /\/ \[artifact=index\.html; status=timeout; content-type=unknown\]/);
  assert.deepEqual(timeoutCalls, [25]);
});
