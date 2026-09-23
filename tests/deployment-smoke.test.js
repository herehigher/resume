import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { DEPLOYMENT_PATH_CONTRACTS } from '../scripts/deployment-path-contract.mjs';
import { prepareArtifact } from '../scripts/prepare-site-artifact.mjs';
import { validatePreparedDeployment, validatePublishedDeployment } from '../scripts/validate-deployment-smoke.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const source = path.join(root, 'site');
const packageVersion = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const smokeScript = fileURLToPath(new URL('../scripts/validate-deployment-smoke.mjs', import.meta.url));

function temporaryDirectory(t) {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'resume-deployment-smoke-'));
  t.after(() => rmSync(directory, { force: true, recursive: true }));
  return directory;
}

async function prepare(sourceDirectory, outputDirectory) {
  await prepareArtifact({ outputDirectory, sourceDirectory });
  return validatePreparedDeployment({ directory: outputDirectory, packageVersion });
}

function contentTypeFor(kind) {
  if (kind === 'html') return 'text/html; charset=utf-8';
  if (kind === 'xml') return 'application/xml; charset=utf-8';
  if (kind === 'javascript') return 'text/javascript; charset=utf-8';
  return 'application/json; charset=utf-8';
}

function contractAtPath(pathname) {
  const relativePath = pathname.slice(1);
  const artifactPath = relativePath === '' ? 'index.html'
    : relativePath.endsWith('/') ? `${relativePath}index.html` : relativePath;
  return DEPLOYMENT_PATH_CONTRACTS.find((candidate) => candidate.artifactPath === artifactPath);
}

function publishedFixture(directory, { mutateHtml = (html) => html } = {}) {
  return async (url) => {
    const request = new URL(url);
    const contract = contractAtPath(request.pathname);
    if (!contract) return new Response('not found', { status: 404 });
    let content = readFileSync(path.join(directory, contract.artifactPath), 'utf8');
    if (contract.kind === 'html') content = mutateHtml(content);
    return new Response(content, {
      headers: { 'content-type': contentTypeFor(contract.kind) },
      status: 200
    });
  };
}

test('prepared artifact validates its paths, language metadata, Schema, and version contract', async (t) => {
  const temporary = temporaryDirectory(t);
  const candidate = path.join(temporary, 'source-copy');
  const prepared = path.join(temporary, 'prepared');
  cpSync(source, candidate, { recursive: true });
  await prepareArtifact({ outputDirectory: prepared, sourceDirectory: candidate });

  for (const file of ['index.html', 'ja/index.html', 'zh-cn/index.html', 'en/index.html', 'editor/index.html']) {
    const fullPath = path.join(prepared, file);
    writeFileSync(fullPath, readFileSync(fullPath, 'utf8').replace('<html ', '<html data-release-check="local" '));
  }
  const result = await validatePreparedDeployment({ directory: prepared, packageVersion });
  assert.equal(result.packageVersion, packageVersion);
  const cli = spawnSync(process.execPath, [smokeScript, '--directory', prepared, '--package-version', packageVersion], {
    encoding: 'utf8'
  });
  assert.equal(cli.status, 0, cli.stderr);
});

test('prepared deployment smoke detects locale, URL, indexability, sitemap, Schema, and version regressions', async (t) => {
  const temporary = temporaryDirectory(t);
  const cases = [
    ['locale', 'en/index.html', (content) => content.replace('lang="en"', 'lang="ja"'), /language is invalid/],
    ['canonical', 'index.html', (content) => content.replace(
      '<link rel="canonical" href="https://rs.herehigher.com/">',
      '<link rel="canonical" href="https://example.invalid/">'
    ), /canonical URL is invalid/],
    ['hreflang cluster', 'index.html', (content) => content.replace(
      '</head>', '<link rel="alternate" hreflang="fr" href="https://example.invalid/">\n</head>'
    ), /alternate URL set is invalid/],
    ['compatibility hreflang', 'ja/index.html', (content) => content.replace(
      '</head>', '<link rel="alternate" hreflang="ja" href="https://rs.herehigher.com/ja/">\n</head>'
    ), /must not join the public hreflang cluster/],
    ['editor indexability', 'editor/index.html', (content) => content.replace('noindex,follow', 'index,follow'), /must be noindex,follow/],
    ['sitemap canonical URLs', 'sitemap.xml', (content) => content.replace(
      '<loc>https://rs.herehigher.com/en/</loc>', '<loc>https://example.invalid/en/</loc>'
    ), /does not match public document canonical URLs/],
    ['Schema identity', 'schema/resume-studio-web-v4.schema.json', (content) => content.replace(
      'https://rs.herehigher.com/schema/', 'https://example.invalid/schema/'
    ), /identity or title is invalid/],
    ['example version', 'schema/resume-studio-web-v4.example.json', (content) => content.replace(
      '"version": 4', '"version": 3'
    ), /version is invalid/],
    ['APP_VERSION', 'assets/js/config.js', (content) => content.replace(
      `APP_VERSION = '${packageVersion}'`, "APP_VERSION = '9.9.9'"
    ), /APP_VERSION does not match package version/]
  ];

  for (const [name, artifactPath, mutate, expected] of cases) {
    const candidate = path.join(temporary, `${name}-source`);
    const prepared = path.join(temporary, `${name}-prepared`);
    cpSync(source, candidate, { recursive: true });
    await prepareArtifact({ outputDirectory: prepared, sourceDirectory: candidate });
    const target = path.join(prepared, artifactPath);
    writeFileSync(target, mutate(readFileSync(target, 'utf8')));
    await assert.rejects(validatePreparedDeployment({ directory: prepared, packageVersion }), expected, name);
  }
});

test('prepared and published deployment use the same semantic contract on custom and pages.dev roots', async (t) => {
  const temporary = temporaryDirectory(t);
  const candidate = path.join(temporary, 'source-copy');
  const prepared = path.join(temporary, 'prepared');
  cpSync(source, candidate, { recursive: true });
  await prepare(candidate, prepared);

  const origins = ['https://resume-staging.pages.dev/', 'https://preview.example.test/'];
  for (const baseUrl of origins) {
    const requests = [];
    const fetchImpl = async (url) => {
      const request = new URL(url);
      requests.push(`${request.origin}${request.pathname}`);
      return publishedFixture(prepared, {
        mutateHtml: (html) => html.replace('</head>', '<meta name="host-generated" content="edge-adjusted"></head>')
      })(url);
    };
    await validatePublishedDeployment({ baseUrl, fetchImpl, packageVersion, releaseSha: 'a'.repeat(40) });
    assert.deepEqual(requests, DEPLOYMENT_PATH_CONTRACTS.map((contract) => {
      const url = new URL(contract.urlPath, baseUrl);
      return `${url.origin}${url.pathname}`;
    }));
  }
});

test('published smoke fails closed on HTTP errors, content type, marker, and metadata mismatches', async () => {
  const baseUrl = 'https://resume-staging.pages.dev/';
  const htmlContract = DEPLOYMENT_PATH_CONTRACTS[0];
  const validHtml = readFileSync(path.join(source, htmlContract.artifactPath), 'utf8');

  await assert.rejects(validatePublishedDeployment({
    attempts: 1,
    baseUrl,
    fetchImpl: async () => new Response('missing', { status: 404, headers: { 'content-type': 'text/html' } }),
    packageVersion
  }), /HTTP response was not successful/);

  const malformedContentTypes = [
    ['index.html', 'text/htmlx; charset=utf-8', /unexpected content type for html/],
    ['sitemap.xml', 'application/xmlp', /unexpected content type for xml/],
    ['assets/js/config.js', 'text/javascript-malformed', /unexpected content type for javascript/],
    ['schema/resume-studio-web-v4.schema.json', 'application/jsonp; charset=utf-8', /unexpected content type for json/]
  ];
  for (const [artifactPath, contentType, expected] of malformedContentTypes) {
    const fetchImpl = async (url) => {
      const contract = contractAtPath(new URL(url).pathname);
      const content = readFileSync(path.join(source, contract.artifactPath), 'utf8');
      return new Response(content, {
        headers: { 'content-type': contract.artifactPath === artifactPath ? contentType : contentTypeFor(contract.kind) },
        status: 200
      });
    };
    await assert.rejects(validatePublishedDeployment({ attempts: 1, baseUrl, fetchImpl, packageVersion }), expected);
  }

  await assert.rejects(validatePublishedDeployment({
    attempts: 1,
    baseUrl,
    fetchImpl: async () => new Response('not the expected page', { headers: { 'content-type': 'text/html' } }),
    packageVersion
  }), /required marker was not found/);

  await assert.rejects(validatePublishedDeployment({
    attempts: 1,
    baseUrl,
    fetchImpl: async () => new Response(validHtml.replace('lang="ja"', 'lang="en"'), {
      headers: { 'content-type': 'text/html' }
    }),
    packageVersion
  }), /language is invalid/);
});

test('published smoke rejects redirects and mounted base URLs', async () => {
  const baseUrl = 'https://resume-staging.pages.dev/';
  const requestedUrl = new URL('/', baseUrl).href;
  await assert.rejects(validatePublishedDeployment({
    attempts: 1,
    baseUrl,
    fetchImpl: async (_url, options) => {
      assert.equal(options.redirect, 'error');
      return {
        headers: new Headers({ 'content-type': 'text/html' }),
        ok: true,
        redirected: true,
        status: 200,
        text: async () => readFileSync(path.join(source, 'index.html'), 'utf8'),
        url: `${requestedUrl}redirected/`
      };
    },
    packageVersion
  }), /response was redirected/);

  await assert.rejects(validatePublishedDeployment({
    attempts: 1,
    baseUrl: 'https://preview.example.test/resume/',
    fetchImpl: async () => { throw new Error('fetch must not run for a mounted base URL'); },
    packageVersion
  }), /https origin root/);
});

test('published smoke bounds requests with an injectable timeout signal', async () => {
  const timeoutCalls = [];
  const timeoutSignal = (milliseconds) => {
    timeoutCalls.push(milliseconds);
    return AbortSignal.abort(new Error('simulated timeout'));
  };
  await assert.rejects(validatePublishedDeployment({
    attempts: 1,
    baseUrl: 'https://resume-staging.pages.dev/',
    fetchImpl: async (_url, { signal }) => {
      assert.equal(signal.aborted, true);
      throw signal.reason;
    },
    packageVersion,
    requestTimeoutMs: 25,
    timeoutSignal
  }), /status=timeout/);
  assert.deepEqual(timeoutCalls, [25]);
});
