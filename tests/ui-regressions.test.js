import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import en from '../site/assets/js/i18n/en.js';
import ja from '../site/assets/js/i18n/ja.js';
import zhCN from '../site/assets/js/i18n/zh-CN.js';
import { APP_VERSION, REPOSITORY_URL, STATE_VERSION } from '../site/assets/js/config.js';

const packageJson = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8')
);

test('print styles never reveal a hidden locale workspace', () => {
  const printCss = readFileSync(new URL('../site/assets/css/print.css', import.meta.url), 'utf8');

  assert.match(printCss, /\.workspace\[hidden\]\s*\{\s*display:\s*none\s*!important;/);
  assert.match(printCss, /\.locale-pending,\s*\.workspace\[hidden\]/);
});

test('every locale has distinct import, export, and locale-save error messages', () => {
  for (const messages of [ja, zhCN, en]) {
    assert.ok(messages.brandHome);
    assert.ok(messages.exportError);
    assert.ok(messages.localeSaveError);
    assert.ok(messages.printDocument);
    assert.notEqual(messages.exportError, messages.importError);
  }
});

test('public application version matches package metadata without changing the state format', () => {
  assert.equal(APP_VERSION, packageJson.version);
  assert.equal(STATE_VERSION, 1);
  assert.equal(REPOSITORY_URL, 'https://github.com/herehigher/resume');
});

test('privacy and security copy has the same complete key set in every locale', () => {
  const keySets = [ja, zhCN, en].map((copy) => Object.keys(copy.privacySecurity).sort());
  assert.deepEqual(keySets[1], keySets[0]);
  assert.deepEqual(keySets[2], keySets[0]);

  for (const copy of [ja, zhCN, en]) {
    for (const value of Object.values(copy.privacySecurity)) assert.ok(value.trim());
  }
});

test('all locale editors and template styles are connected to the page', () => {
  const html = readFileSync(new URL('../site/index.html', import.meta.url), 'utf8');
  const main = readFileSync(new URL('../site/assets/js/main.js', import.meta.url), 'utf8');
  const localeController = readFileSync(
    new URL('../site/assets/js/ui/locale-controller.js', import.meta.url),
    'utf8'
  );

  assert.match(html, /assets\/css\/templates\/zh-CN\.css/);
  assert.match(html, /assets\/css\/templates\/en\.css/);
  assert.match(html, /id="chineseWorkspace" hidden/);
  assert.match(main, /initChineseEditor\(store\)/);
  assert.match(main, /initEnglishEditor\(store\)/);
  assert.match(main, /renderEnglishWorkspace\(\)/);
  assert.match(main, /japaneseEditor\.refresh\(\)/);
  assert.match(localeController, /'zh-CN': document\.getElementById\('chineseWorkspace'\)/);
  assert.match(localeController, /en: document\.querySelector\('\[data-english-editor\]'\)/);
});

test('tagged Pages releases depend on the reusable quality workflow', () => {
  const quality = readFileSync(new URL('../.github/workflows/quality.yml', import.meta.url), 'utf8');
  const deploy = readFileSync(new URL('../.github/workflows/deploy-pages.yml', import.meta.url), 'utf8');

  assert.match(quality, /workflow_call:/);
  assert.match(deploy, /tags:\s*\n\s*- 'v\*'/);
  assert.match(deploy, /quality:\s*\n\s*uses: \.\/\.github\/workflows\/quality\.yml/);
  assert.match(deploy, /deploy:\s*\n\s*needs: quality/);
  assert.match(deploy, /git merge-base --is-ancestor "\$GITHUB_SHA" origin\/main/);
  assert.match(deploy, /package_version="\$\(node -p "require\('\.\/package\.json'\)\.version"\)"/);
  assert.match(deploy, /test "\$GITHUB_REF_NAME" = "v\$\{package_version\}"/);
  assert.match(deploy, /uses: actions\/deploy-pages@v4/);
});
