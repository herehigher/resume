import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

import { checkOnlineEditor } from '../../scripts/check-online-editor.mjs';

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

test('online editor smoke validates the provider-neutral source site', async ({ baseURL }) => {
  await checkOnlineEditor(`${baseURL}/`);
});

test('online editor smoke CLI rejects legacy mounted production bases', async () => {
  const script = fileURLToPath(new URL('../../scripts/check-online-editor.mjs', import.meta.url));
  for (const baseUrl of [
    'https://herehigher.github.io/resume/',
    'https://rs.herehigher.com/resume/',
    'http://127.0.0.1:4173/resume/'
  ]) {
    const result = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [script, '--base-url', baseUrl], { stdio: ['ignore', 'pipe', 'pipe'] });
      let output = '';
      child.stdout.on('data', (chunk) => { output += chunk; });
      child.stderr.on('data', (chunk) => { output += chunk; });
      child.once('error', reject);
      child.once('close', (code) => resolve({ code, output }));
    });
    expect(result.code, `${baseUrl}: ${result.output}`).not.toBe(0);
    expect(result.output).toContain('HTTPS origin root');
  }
});
