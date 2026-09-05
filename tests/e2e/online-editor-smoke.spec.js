import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

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
