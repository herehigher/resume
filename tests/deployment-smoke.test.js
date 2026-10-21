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
  if (kind === 'text') return 'text/plain; charset=utf-8';
  if (kind === 'css') return 'text/css; charset=utf-8';
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
    if (!contract) return new Response(readFileSync(path.join(directory, '404.html'), 'utf8'), {
      headers: { 'content-type': 'text/html; charset=utf-8' }, status: 404
    });
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
    ['retired canonical mount', 'index.html', (content) => content.replace(
      '<link rel="canonical" href="https://rs.herehigher.com/">',
      '<link rel="canonical" href="https://herehigher.github.io/resume/">'
    ), /canonical URL is invalid/],
    ['hreflang cluster', 'index.html', (content) => content.replace(
      '</head>', '<link rel="alternate" hreflang="fr" href="https://example.invalid/">\n</head>'
    ), /alternate URL set is invalid/],
    ['compatibility hreflang', 'ja/index.html', (content) => content.replace(
      '</head>', '<link rel="alternate" hreflang="ja" href="https://rs.herehigher.com/ja/">\n</head>'
    ), /must not join the public hreflang cluster/],
    ['robots blocks editor', 'robots.txt', (content) => content.replace('Allow: /', 'Disallow: /editor/'), /robots rules must allow crawling/],
    ['robots sitemap', 'robots.txt', (content) => content.replace('https://rs.herehigher.com/', 'https://example.invalid/'), /robots rules must allow crawling/],
    ['implicit AI policy', 'robots.txt', (content) => `${content}Content-Signal: ai-train=no\n`, /robots rules must allow crawling/],
    ['error page home link', '404.html', (content) => content.replace('href="/en/"', 'href="../en/"'), /en home link is missing/],
    ['error page homepage fallback', '404.html', () => readFileSync(path.join(source, 'index.html'), 'utf8'), /required marker was not found/],
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
    const successContracts = DEPLOYMENT_PATH_CONTRACTS.filter((contract) => contract.semantic !== 'not-found-document');
    assert.deepEqual(requests.slice(0, successContracts.length), successContracts.map((contract) => {
      const url = new URL(contract.urlPath, baseUrl);
      return `${url.origin}${url.pathname}`;
    }));
    const missingRequests = requests.slice(successContracts.length + 3);
    assert.equal(missingRequests.length, 6);
    assert.match(missingRequests[0], /\/__not-found-[a-f0-9-]+$/);
    assert.match(missingRequests[1], /\/missing-[a-f0-9-]+\/nested\/page$/);
    assert.deepEqual(missingRequests.slice(2), ['llms.txt', '.well-known/ai-plugin.json',
      'schema/__not-found.schema.json', 'assets/__not-found.js'].map((pathname) => new URL(pathname, baseUrl).href));
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
  }), /HTTP response must be 200/);

  const malformedContentTypes = [
    ['assets/css/not-found.css', 'text/html; charset=utf-8', /unexpected content type for css/],
    ['robots.txt', 'text/html; charset=utf-8', /unexpected content type for text/],
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


test('published smoke rejects soft 404s, wrong error bodies/types, and non-200 successful responses', async () => {
  const baseUrl = 'https://resume-staging.pages.dev/';
  const fixture = publishedFixture(source);
  const errorHtml = readFileSync(path.join(source, '404.html'), 'utf8');
  const homeHtml = readFileSync(path.join(source, 'index.html'), 'utf8');
  const cases = [
    ['homepage soft 404', 200, 'text/html', homeHtml, /HTTP response must be 404/],
    ['error page soft 404', 200, 'text/html', errorHtml, /HTTP response must be 404/],
    ['homepage with 404 status', 404, 'text/html', homeHtml, /required marker was not found/],
    ['plain text error', 404, 'text/plain', errorHtml, /unexpected content type for html/],
    ['missing error body', 404, 'text/html', 'Not found', /required marker was not found/]
  ];
  // Each negative route is checked independently, so a single passing route cannot hide another soft 404.
  for (const target of ['random', 'nested', 'llms.txt', '.well-known/ai-plugin.json',
    'schema/__not-found.schema.json', 'assets/__not-found.js']) {
    for (const [name, status, contentType, content, expected] of cases) {
      let reachedTarget = false;
      const fetchImpl = async (url) => {
        const pathname = new URL(url).pathname.slice(1);
        const matches = target === 'random' ? pathname.startsWith('__not-found-')
          : target === 'nested' ? pathname.startsWith('missing-') : pathname === target;
        if (!matches) return fixture(url);
        reachedTarget = true;
        return new Response(content, { status, headers: { 'content-type': contentType } });
      };
      await assert.rejects(validatePublishedDeployment({ attempts: 1, baseUrl, fetchImpl, packageVersion }), expected, `${target}: ${name}`);
      assert.equal(reachedTarget, true);
    }
  }
  await assert.rejects(validatePublishedDeployment({ attempts: 1, baseUrl, packageVersion,
    fetchImpl: async () => new Response(homeHtml, { status: 201, headers: { 'content-type': 'text/html' } })
  }), /HTTP response must be 200/);
});

test('published smoke preserves the editor locale queries and cache-busting identity', async () => {
  const locales = [];
  const releaseSha = 'b'.repeat(40);
  await validatePublishedDeployment({ attempts: 1, baseUrl: 'https://resume-staging.pages.dev/', packageVersion, releaseSha,
    fetchImpl: async (url) => {
      const request = new URL(url);
      assert.equal(request.searchParams.get('release'), releaseSha);
      assert.equal(request.searchParams.get('attempt'), '1');
      if (request.pathname === '/editor/' && request.searchParams.has('lang')) locales.push(request.searchParams.get('lang'));
      return publishedFixture(source)(url);
    }
  });
  assert.deepEqual(locales, ['ja', 'zh-CN', 'en']);
});
