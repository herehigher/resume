import { readdirSync, readFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve('site');
const failures = [];

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

export function findExternalRuntimeAssets(html) {
  const externalElements = [...html.matchAll(/<(?:script|img)\b[^>]*\b(?:src|href)=(?:(["'])https?:\/\/[^"']+\1|https?:\/\/[^\s>]+)[^>]*>/gi)];
  const externalLinks = [...html.matchAll(/<link\b[^>]*\bhref=(?:(["'])https?:\/\/[^"']+\1|https?:\/\/[^\s>]+)[^>]*>/gi)]
    .filter(([tag]) => {
      const relationMatch = tag.match(/\brel=(?:(["'])([^"']*)\1|([^\s>]+))/i);
      const relation = (relationMatch?.[2] || relationMatch?.[3] || '').trim().toLowerCase();
      return !['alternate', 'canonical'].includes(relation);
    });
  return [...externalElements, ...externalLinks];
}

const files = walk(root);
const javascriptFiles = files.filter((file) => extname(file) === '.js');

javascriptFiles.forEach((file) => {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) failures.push(`${file}: ${result.stderr.trim()}`);
  const source = readFileSync(file, 'utf8');
  if (/\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon)\b/.test(source)) {
    failures.push(`${file}: network APIs are not allowed`);
  }
  if (source.includes('resume-studio-data-v1')) {
    failures.push(`${file}: legacy storage data must not be read or modified`);
  }
});

const indexPath = join(root, 'editor/index.html');
const html = readFileSync(indexPath, 'utf8');
if (/<style(?:\s|>)/i.test(html)) failures.push('site/editor/index.html must not contain inline style blocks');
if (/<script(?![^>]*\bsrc=)[^>]*>/i.test(html)) failures.push('site/editor/index.html must not contain inline scripts');
if (!html.includes('type="module" src="../assets/js/main.js"')) failures.push('site/editor/index.html must load the main ES Module');

const referencedAssets = [...html.matchAll(/(?:href|src)="(\.\.\/assets\/[^"]+)"/g)]
  .map((match) => resolve(root, 'editor', match[1]));
referencedAssets.forEach((file) => {
  if (!files.includes(file)) failures.push(`Missing referenced asset: ${file}`);
});

files.filter((file) => extname(file) === '.html').forEach((file) => {
  const pageHtml = readFileSync(file, 'utf8');
  if (findExternalRuntimeAssets(pageHtml).length) {
    failures.push(`${file}: external runtime assets are not allowed`);
  }
  if (!pageHtml.includes('data-analytics-mode="disabled" data-analytics-provider="none"')) {
    failures.push(`${file}: source analytics status must be disabled/none`);
  }
  if (/data-cf-beacon|cloudflareinsights\.com/i.test(pageHtml)) {
    failures.push(`${file}: source pages must not contain analytics runtime code`);
  }
});

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log(`Checked ${javascriptFiles.length} JavaScript modules and ${referencedAssets.length} page assets.`);
