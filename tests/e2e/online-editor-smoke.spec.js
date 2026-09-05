import { createReadStream, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

import { checkOnlineEditor } from '../../scripts/check-online-editor.mjs';
import { CLOUDFLARE_PROVIDER, OFFICIAL_REPOSITORY, prepareArtifact } from '../../scripts/prepare-pages-artifact.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const sourceSite = path.join(root, 'site');
const contentTypes = new Map([
  ['.css', 'text/css; charset=utf-8'], ['.html', 'text/html; charset=utf-8'], ['.js', 'text/javascript; charset=utf-8'], ['.json', 'application/json; charset=utf-8']
]);

test('online editor smoke runs its real CLI against the served site', async ({ baseURL }) => {
  const result = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [
      fileURLToPath(new URL('../../scripts/check-online-editor.mjs', import.meta.url)),
      '--base-url', `${baseURL}/`
    ], { stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { output += chunk; });
    child.once('error', reject);
    child.once('close', (code) => resolve({ code, output }));
  });
  expect(result.code, result.output).toBe(0);
});

test('online editor smoke permits only a blocked fixed beacon in an enabled artifact', async () => {
  const temporary = mkdtempSync(path.join(os.tmpdir(), 'resume-online-enabled-'));
  const output = path.join(temporary, 'site');
  const manifestPath = path.join(temporary, 'manifest.json');
  let server;
  try {
    writeFileSync(manifestPath, `${JSON.stringify({ analyticsMode: 'enabled', analyticsProvider: CLOUDFLARE_PROVIDER, schemaVersion: 2 })}\n`);
    await prepareArtifact({ manifestPath, outputDirectory: output, repository: OFFICIAL_REPOSITORY, sourceDirectory: sourceSite, token: 'c'.repeat(32) });
    server = createServer(async (request, response) => {
      const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
      const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\//, '').replace(/\/$/, '/index.html');
      const target = path.resolve(output, relative);
      if (target !== output && !target.startsWith(`${output}${path.sep}`)) return response.writeHead(403).end();
      try {
        const metadata = await stat(target);
        if (!metadata.isFile()) throw new Error('not a file');
        response.writeHead(200, { 'Content-Type': contentTypes.get(path.extname(target)) || 'application/octet-stream' });
        createReadStream(target).pipe(response);
      } catch {
        response.writeHead(404).end();
      }
    });
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    await checkOnlineEditor(`http://127.0.0.1:${server.address().port}/`);
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    rmSync(temporary, { force: true, recursive: true });
  }
});
