import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import en from '../site/assets/js/i18n/en.js';
import ja from '../site/assets/js/i18n/ja.js';
import zhCN from '../site/assets/js/i18n/zh-CN.js';
import { APP_VERSION, REPOSITORY_URL, STATE_VERSION } from '../site/assets/js/config.js';
import { DraftStorageError, getDraftStorageCapabilityError } from '../site/assets/js/state/storage.js';
import { messageForDraftStorageError } from '../site/assets/js/ui/draft-storage-error.js';

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
    assert.ok(messages.brandEntry);
    assert.ok(messages.exportError);
    assert.ok(messages.localeSaveError);
    assert.ok(messages.printDocument);
    assert.ok(messages.backupMenuLabel);
    assert.ok(messages.backupMenuShortLabel);
    assert.match(messages.draftStorageCompatibilityError, /https:\/\/|http:\/\/localhost/);
    assert.notEqual(messages.exportError, messages.importError);
  }
});

test('draft storage compatibility failures use one actionable message per locale', () => {
  const unavailable = getDraftStorageCapabilityError({ crypto: {}, isSecureContext: false });
  assert.ok(unavailable instanceof DraftStorageError);
  assert.equal(unavailable.code, 'crypto-unavailable');
  assert.equal(getDraftStorageCapabilityError({ crypto: { subtle: {} }, isSecureContext: true }), null);
  for (const [locale, messages] of [['ja', ja], ['zh-CN', zhCN], ['en', en]]) {
    assert.equal(messageForDraftStorageError(unavailable, locale, 'fallback'), messages.draftStorageCompatibilityError);
    assert.equal(messageForDraftStorageError(new DraftStorageError('decrypt-failed'), locale, 'fallback'), 'fallback');
  }
});

test('public application version matches package metadata without changing the state format', () => {
  assert.equal(APP_VERSION, packageJson.version);
  assert.equal(STATE_VERSION, 4);
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

test('the editor loads existing local stylesheets and module entry points', () => {
  const entry = new URL('../site/editor/index.html', import.meta.url);
  const html = readFileSync(entry, 'utf8');
  const resources = { stylesheet: [], module: [] };
  for (const [tag] of html.matchAll(/<(?:link|script)\b[^>]*>/g)) {
    const attributes = Object.fromEntries([...tag.matchAll(/\b([\w-]+)=(['"])(.*?)\2/g)]
      .map(([, name, , value]) => [name, value]));
    if (tag.startsWith('<link') && attributes.rel?.split(/\s+/).includes('stylesheet')) {
      resources.stylesheet.push(attributes.href);
    }
    if (tag.startsWith('<script') && attributes.type === 'module') resources.module.push(attributes.src);
  }
  for (const [kind, urls] of Object.entries(resources)) {
    assert.ok(urls.length > 0, `missing ${kind} entry`);
    for (const source of urls) {
      assert.ok(source, `${kind} must reference a resource`);
      const resource = new URL(source, entry);
      assert.equal(resource.protocol, 'file:', `${kind} must stay local`);
      assert.ok(existsSync(resource), `missing ${kind}: ${source}`);
    }
  }
});
