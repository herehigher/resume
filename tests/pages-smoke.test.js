import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { DEPLOYMENT_PATH_CONTRACTS } from '../scripts/deployment-path-contract.mjs';
import { prepareArtifact } from '../scripts/prepare-site-artifact.mjs';
import { CLOUDFLARE_BEACON_URL } from '../scripts/cloudflare-analytics.mjs';
import { validateDeploymentArtifact, validatePublishedDeployment } from '../scripts/validate-pages-smoke.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const source = path.join(root, 'site');
const packageVersion = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const productionOrigin = 'https://rs.herehigher.com/';

function temporaryDirectory(t) {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'resume-pages-smoke-'));
  t.after(() => rmSync(directory, { force: true, recursive: true }));
  return directory;
}

async function validate(directory, overrides = {}) {
  return validateDeploymentArtifact({
    directory,
    packageVersion,
    ...overrides
  });
}

async function preparedArtifact(directory) {
  const output = `${directory}-prepared`;
  await prepareArtifact({
    outputDirectory: output,
    sourceDirectory: directory
  });
  return output;
}

test('semantic smoke accepts a prepared site artifact with legal extra attributes', async (t) => {
  const temporary = temporaryDirectory(t);
  const candidate = path.join(temporary, 'artifact');
  cpSync(source, candidate, { recursive: true });
  const prepared = await preparedArtifact(candidate);
  for (const file of ['index.html', 'ja/index.html', 'zh-cn/index.html', 'en/index.html', 'editor/index.html']) {
    const fullPath = path.join(prepared, file);
    writeFileSync(fullPath, readFileSync(fullPath, 'utf8').replace('<html ', '<html data-release-check="local" '));
  }
  const result = await validate(prepared);
  assert.equal(result.packageVersion, packageVersion);
});

test('semantic smoke detects language, legacy app state, app-owned beacon, and origin regressions', async (t) => {
  const temporary = temporaryDirectory(t);
  const cases = [
    ['language', 'en/index.html', (html) => html.replace('lang="en"', 'lang="ja"'), /language is invalid/],
    ['legacy app state', 'ja/index.html', (html) => html.replace('<html ', '<html data-analytics-mode="disabled" '), /legacy application analytics state/],
    ['legacy canonical', 'ja/index.html', (html) => html.replace('https://rs.herehigher.com/', 'https://example.invalid/'), /canonical URL/],
    ['legacy hreflang', 'ja/index.html', (html) => html.replace('</head>', '<link rel="alternate" hreflang="ja" href="https://herehigher.github.io/resume/">\n</head>'), /must not join the public hreflang cluster/],
    ['ja alternate', 'index.html', (html) => html.replace('hreflang="ja" href="https://rs.herehigher.com/"', 'hreflang="ja" href="https://example.invalid/"'), /ja alternate URL/],
    ['unexpected alternate', 'index.html', (html) => html.replace('</head>', '<link rel="alternate" hreflang="fr" href="https://example.invalid/">\n</head>'), /alternate URL set is invalid/],
    ['canonical', 'zh-cn/index.html', (html) => html.replace(
      '<link rel="canonical" href="https://rs.herehigher.com/zh-cn/">',
      '<link rel="canonical" href="https://example.invalid/">'
    ), /canonical URL/],
    ['editor', 'editor/index.html', (html) => html.replace('noindex,follow', 'index,follow'), /editor\/ \[artifact=editor\/index\.html; status=local; content-type=text\/html\]: must be noindex,follow/],
    ['schema identity', 'schema/resume-studio-web-v4.schema.json', (schema) => schema.replace('https://rs.herehigher.com/schema/', 'https://example.invalid/'), /identity or title is invalid/],
    ['import version', 'schema/resume-studio-web-v4.example.json', (example) => example.replace('"version": 4', '"version": 3'), /version is invalid/],
    ['version', 'assets/js/config.js', (config) => config.replace(`APP_VERSION = '${packageVersion}'`, "APP_VERSION = '9.9.9'"), /APP_VERSION/],
    ['application beacon', 'index.html', (html) => `${html}<script src="${CLOUDFLARE_BEACON_URL}"></script>`, /application analytics runtime/]
  ];
  for (const [name, file, mutate, expected] of cases) {
    const artifact = path.join(temporary, name);
    cpSync(source, artifact, { recursive: true });
    const target = path.join(artifact, file);
    writeFileSync(target, mutate(readFileSync(target, 'utf8')));
    await assert.rejects(validate(artifact), expected);
  }

});

test('published smoke fetches custom-domain root paths and tolerates host-injected Analytics', async () => {
  const requests = [];
  const contentTypeFor = (kind) => {
    if (kind === 'html') return 'text/html; charset=utf-8';
    if (kind === 'xml') return 'application/xml; charset=utf-8';
    if (kind === 'javascript') return 'text/javascript; charset=utf-8';
    return 'application/json; charset=utf-8';
  };
  const fetchImpl = async (url) => {
    const request = new URL(url);
    requests.push(request.pathname);
    const relativePath = request.pathname.slice(1);
    const artifactPath = relativePath === '' ? 'index.html'
      : relativePath.endsWith('/') ? `${relativePath}index.html` : relativePath;
    const contract = DEPLOYMENT_PATH_CONTRACTS.find((candidate) => candidate.artifactPath === artifactPath);
    if (!contract) return new Response('not found', { status: 404 });
    let content = readFileSync(path.join(source, contract.artifactPath), 'utf8');
    if (contract.kind === 'html') {
      content = content.replace('</body>', '<script src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon="hosting-managed"></script></body>');
    }
    return new Response(content, {
      headers: { 'content-type': contentTypeFor(contract.kind) },
      status: 200
    });
  };
  await validatePublishedDeployment({
    baseUrl: productionOrigin,
    fetchImpl,
    packageVersion,
    releaseSha: 'a'.repeat(40)
  });
  assert.deepEqual(requests, DEPLOYMENT_PATH_CONTRACTS.map((contract) => new URL(contract.urlPath, productionOrigin).pathname));

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
    attempts: 1,
    baseUrl: productionOrigin,
    fetchImpl: missingEditor,
    packageVersion,
  }), /editor\/ \[artifact=editor\/index\.html; status=404; content-type=text\/html; charset=utf-8\]/);
});

test('published smoke rejects the retired GitHub Pages origin and mounted paths', async () => {
  for (const baseUrl of ['https://herehigher.github.io/resume/', 'https://rs.herehigher.com/resume/']) {
    await assert.rejects(validatePublishedDeployment({
      attempts: 1,
      baseUrl,
      fetchImpl: async () => { throw new Error('fetch must not run for a legacy or mounted base URL'); },
      packageVersion
    }), /https origin root/);
  }
});

test('published smoke bounds every request with an injectable timeout signal', async () => {
  const timeoutCalls = [];
  const timeoutSignal = (milliseconds) => {
    timeoutCalls.push(milliseconds);
    return AbortSignal.abort(new Error('simulated timeout'));
  };
  await assert.rejects(validatePublishedDeployment({
    attempts: 1,
    baseUrl: productionOrigin,
    fetchImpl: async (_url, { signal }) => {
      assert.equal(signal.aborted, true);
      throw signal.reason;
    },
    packageVersion,
    requestTimeoutMs: 25,
    timeoutSignal
  }), /\/ \[artifact=index\.html; status=timeout; content-type=unknown\]/);
  assert.deepEqual(timeoutCalls, [25]);
});
