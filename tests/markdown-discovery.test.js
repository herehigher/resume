import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { assertPagesContentHeaders, CONTENT_SIGNAL } from '../scripts/content-policy-contract.mjs';
import { DEPLOYMENT_PATH_CONTRACTS, publicDocumentContracts } from '../scripts/deployment-path-contract.mjs';
import { assertHtmlDiscovery, discoveryLinkHeader } from '../scripts/markdown-discovery-contract.mjs';
import { prepareArtifact } from '../scripts/prepare-site-artifact.mjs';
import { validatePreparedDeployment, validatePublishedDeployment } from '../scripts/validate-deployment-smoke.mjs';

const source = fileURLToPath(new URL('../site/', import.meta.url));
const markdownContracts = DEPLOYMENT_PATH_CONTRACTS.filter((contract) => contract.semantic === 'static-markdown');
const version = '0.4.4';

function sourceCopy(t) {
  const temporary = mkdtempSync(path.join(os.tmpdir(), 'resume-markdown-contract-'));
  t.after(() => rmSync(temporary, { force: true, recursive: true }));
  const directory = path.join(temporary, 'site');
  cpSync(source, directory, { recursive: true });
  return { directory, outputDirectory: path.join(temporary, 'artifact') };
}

function publishedResponse(url) {
  const pathname = new URL(url).pathname;
  const contract = DEPLOYMENT_PATH_CONTRACTS.find((candidate) => `/${candidate.urlPath}` === pathname);
  if (!contract) return new Response(readFileSync(path.join(source, '404.html')), {
    status: 404, headers: { 'content-type': 'text/html', 'content-signal': CONTENT_SIGNAL }
  });
  const types = { html: 'text/html', markdown: 'text/markdown', text: 'text/plain', json: 'application/json',
    xml: 'application/xml', javascript: 'text/javascript', css: 'text/css' };
  let content = readFileSync(path.join(source, contract.artifactPath), 'utf8');
  if (contract.semantic === 'version-config') content = content.replace(/APP_VERSION = '[^']+'/u, `APP_VERSION = '${version}'`);
  return new Response(content, { headers: {
    'content-type': types[contract.kind], 'content-signal': CONTENT_SIGNAL,
    ...(discoveryLinkHeader(contract) ? { link: discoveryLinkHeader(contract) } : {}),
    ...(contract.semantic === 'static-markdown' ? { 'content-language': contract.lang } : {}),
    ...(contract.semantic === 'editor-document' ? { 'x-robots-tag': 'noindex,follow' } : {})
  } });
}

test('three localized static guides link only to real public resources and the matching editor', () => {
  assert.deepEqual(markdownContracts.map(({ urlPath, lang }) => [urlPath, lang]), [
    ['index.md', 'ja'], ['zh-cn/index.md', 'zh-CN'], ['en/index.md', 'en']
  ]);
  for (const contract of markdownContracts) {
    const content = readFileSync(path.join(source, contract.artifactPath), 'utf8');
    for (const [, target] of content.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
      if (target.startsWith('https://')) continue;
      const pathname = new URL(target, 'https://fixture.invalid/').pathname.slice(1);
      const artifactPath = pathname.endsWith('/') || !pathname ? `${pathname}index.html` : pathname;
      assert.ok(existsSync(path.join(source, artifactPath)), `${contract.lang}: ${target}`);
    }
    assert.ok(content.includes(`/editor/?lang=${contract.lang}`));
    assert.ok(content.includes('x-resume-studio-uniqueBy: "id"'));
    assert.ok(content.includes('Accept: text/markdown'));
    assert.doesNotMatch(content, /ai-train=no|mailto:|data:image/);
  }
  for (const contract of publicDocumentContracts()) {
    assertHtmlDiscovery(readFileSync(path.join(source, contract.artifactPath), 'utf8'), contract);
  }
  for (const artifactPath of ['ja/index.html', 'editor/index.html', '404.html']) {
    assert.doesNotMatch(readFileSync(path.join(source, artifactPath), 'utf8'), /type="text\/markdown"/);
  }
});

test('artifact preparation rejects missing Markdown, crossed languages, and incorrectly scoped discovery headers', async (t) => {
  for (const defect of ['missing', 'language', 'editor', 'schema', 'applicator', 'header-language', 'header-scope', 'content-type', 'html-discovery']) {
    const { directory, outputDirectory } = sourceCopy(t);
    const markdown = path.join(directory, 'en/index.md');
    const headers = path.join(directory, '_headers');
    if (defect === 'missing') rmSync(markdown);
    if (defect === 'language') writeFileSync(markdown, readFileSync(path.join(directory, 'index.md'), 'utf8'));
    if (defect === 'editor') writeFileSync(markdown, readFileSync(markdown, 'utf8').replace('?lang=en', '?lang=ja'));
    if (defect === 'applicator') writeFileSync(markdown, readFileSync(markdown, 'utf8').replace('x-resume-studio-uniqueBy', 'unknown-keyword'));
    if (defect === 'schema') writeFileSync(markdown, readFileSync(markdown, 'utf8').replaceAll('web-v4.schema', 'web-v3.schema'));
    if (defect === 'header-language') writeFileSync(headers, readFileSync(headers, 'utf8').replace('Content-Language: en', 'Content-Language: ja'));
    if (defect === 'header-scope') writeFileSync(headers, `${readFileSync(headers, 'utf8')}\n/editor/\n  Link: </index.md>; rel="alternate"\n`);
    if (defect === 'content-type') writeFileSync(headers, readFileSync(headers, 'utf8').replace('text/markdown; charset=utf-8', 'text/plain; charset=utf-8'));
    if (defect === 'html-discovery') {
      const html = path.join(directory, 'en/index.html');
      writeFileSync(html, readFileSync(html, 'utf8').replace('href="/en/index.md"', 'href="/index.md"'));
    }
    await assert.rejects(prepareArtifact({ sourceDirectory: directory, outputDirectory }), /ENOENT|artifact file is unavailable|static Markdown|Pages headers|HTML discovery/, defect);
    await assert.rejects(validatePreparedDeployment({ directory, packageVersion: version }), /ENOENT|artifact file is unavailable|static Markdown|Pages headers|HTML discovery/, defect);
  }
});

test('Pages discovery declares matching alternate, Schema describedby, and sitemap relations', () => {
  const headers = readFileSync(path.join(source, '_headers'), 'utf8');
  assertPagesContentHeaders(headers);
  const routes = [...headers.matchAll(/^(\/[^\n]*)\n((?: {2}[^\n]+\n?)+)/gm)];
  const discoveryRoutes = routes.filter(([, , values]) => values.includes('  Link:')).map(([, route]) => route);
  assert.deepEqual(discoveryRoutes, ['/', '/index.html', '/zh-cn/', '/zh-cn/index.html', '/en/', '/en/index.html',
    '/index.md', '/zh-cn/index.md', '/en/index.md']);
  for (const [, route, values] of routes.filter(([, route]) => route.endsWith('.md'))) {
    assert.match(values, /Content-Type: text\/markdown; charset=utf-8/);
    assert.doesNotMatch(values, /Vary:|Content-Signal:/);
    assert.ok(values.includes('rel="describedby"; type="application/json"'));
    assert.ok(values.includes('</sitemap.xml>; rel="sitemap"'));
    assert.ok(!values.includes(`<${route}>; rel="alternate"`));
  }
});

test('published static Markdown checks actual response headers and language without requiring Vary Accept', async () => {
  for (const contract of markdownContracts) {
    for (const defect of ['', 'content-type', 'content-language', 'missing-link', 'link-language', 'link-relation', 'signal', 'body-language']) {
      let reached = false;
      const promise = validatePublishedDeployment({ attempts: 1, packageVersion: version, baseUrl: 'https://preview.example.test/',
        fetchImpl: async (url) => {
          const response = publishedResponse(url);
          if (new URL(url).pathname !== `/${contract.urlPath}`) return response;
          reached = true;
          assert.equal(response.headers.has('vary'), false);
          if (defect === 'content-type') response.headers.set('content-type', 'text/plain');
          if (defect === 'content-language') response.headers.set('content-language', contract.lang === 'en' ? 'ja' : 'en');
          if (defect === 'missing-link') response.headers.delete('link');
          if (defect === 'link-language') response.headers.set('link', response.headers.get('link').replace(`hreflang="${contract.lang}"`, 'hreflang="fr"'));
          if (defect === 'link-relation') response.headers.set('link', response.headers.get('link').replace('rel="sitemap"', 'rel="alternate"'));
          if (defect === 'signal') response.headers.set('content-signal', 'search=yes, ai-input=yes, ai-train=no');
          if (defect === 'body-language') return new Response('# wrong language', { headers: response.headers });
          return response;
        }
      });
      if (defect) await assert.rejects(promise, /unexpected content type|Content-Language|discovery Link|Content-Signal|required marker/, `${contract.lang}: ${defect}`);
      else await promise;
      assert.equal(reached, true);
    }
  }
});

test('published HTML rejects missing, crossed-language, and misrelated discovery headers', async () => {
  for (const contract of publicDocumentContracts()) {
    for (const defect of ['missing', 'language', 'relation']) {
      await assert.rejects(validatePublishedDeployment({ attempts: 1, packageVersion: version, baseUrl: 'https://preview.example.test/',
        fetchImpl: async (url) => {
          const response = publishedResponse(url);
          if (new URL(url).pathname === `/${contract.urlPath}`) {
            const link = response.headers.get('link');
            response.headers.set('link', defect === 'missing' ? '' : defect === 'language'
              ? link.replace(`hreflang="${contract.lang}"`, 'hreflang="fr"') : link.replace('rel="describedby"', 'rel="alternate"'));
          }
          return response;
        }
      }), /discovery Link/);
    }
  }
});
