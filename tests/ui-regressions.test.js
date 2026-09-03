import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

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
  const html = readFileSync(new URL('../site/editor/index.html', import.meta.url), 'utf8');
  const main = readFileSync(new URL('../site/assets/js/main.js', import.meta.url), 'utf8');
  const localeController = readFileSync(
    new URL('../site/assets/js/ui/locale-controller.js', import.meta.url),
    'utf8'
  );

  assert.match(html, /assets\/css\/templates\/zh-CN\.css/);
  assert.match(html, /assets\/css\/templates\/en\.css/);
  assert.match(html, /id="chineseWorkspace" hidden/);
  assert.match(main, /const embeddedPhotoUrl = createEmbeddedPhotoUrl\(\)/);
  assert.match(main, /initJapaneseEditor\(store, \{ embeddedPhotoUrl \}\)/);
  assert.match(main, /initChineseEditor\(store, \{ embeddedPhotoUrl \}\)/);
  assert.match(main, /initEnglishEditor\(store\)/);
  assert.match(main, /renderEnglishWorkspace\(\)/);
  assert.match(main, /japaneseEditor\.refresh\(\)/);
  assert.match(localeController, /'zh-CN': document\.getElementById\('chineseWorkspace'\)/);
  assert.match(localeController, /en: document\.querySelector\('\[data-english-editor\]'\)/);
});

test('Pages releases use the validated commit and cannot bypass the reusable quality workflow', () => {
  const quality = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
  const deploy = readFileSync(new URL('../.github/workflows/deploy-pages.yml', import.meta.url), 'utf8');

  assert.match(quality, /name: Quality/);
  assert.match(quality, /pull_request:/);
  assert.match(quality, /push:\s*\n\s*branches:\s*\n\s*- main/);
  assert.match(quality, /workflow_call:/);
  assert.match(quality, /checkout_ref:\s*\n\s*description:[^\n]+\n\s*required: true\s*\n\s*type: string/);
  assert.match(quality, /ref: \$\{\{ inputs\.checkout_ref \|\| github\.sha \}\}/);
  assert.match(quality, /permissions: \{\}/);
  assert.match(quality, /quality:\s*\n\s*runs-on:[\s\S]*?permissions:\s*\n\s*contents: read/);

  assert.match(deploy, /tags:\s*\n\s*- 'v\*\.\*\.\*'/);
  assert.match(deploy, /workflow_dispatch:\s*\n\s*inputs:\s*\n\s*release_tag:/);
  assert.doesNotMatch(deploy, /^\s+branches:/m);
  assert.match(deploy, /permissions: \{\}/);
  assert.match(deploy, /group: pages-production\s*\n\s*cancel-in-progress: false/);
  assert.match(deploy, /run: node scripts\/validate-release-ref\.mjs/);
  assert.match(deploy, /quality:\s*\n\s*needs: validate\s*\n\s*uses: \.\/\.github\/workflows\/ci\.yml/);
  assert.match(deploy, /checkout_ref: \$\{\{ needs\.validate\.outputs\.release_sha \}\}/);
  assert.match(deploy, /artifact:\s*\n\s*needs: \[validate, quality\]/);
  assert.match(deploy, /ref: \$\{\{ needs\.validate\.outputs\.release_sha \}\}/);
  assert.match(deploy, /Validate tagged Pages manifest without provider token[\s\S]*?id: manifest[\s\S]*?prepare-pages-artifact\.mjs validate/);
  assert.match(deploy, /github\.repository != 'herehigher\/resume'.*analytics_mode == 'enabled'[\s\S]*?exit 1/);
  assert.match(deploy, /github\.repository == 'herehigher\/resume'.*analytics_mode == 'enabled'.*cloudflare-web-analytics[\s\S]*?CLOUDFLARE_WEB_ANALYTICS_TOKEN: \$\{\{ vars\.CLOUDFLARE_WEB_ANALYTICS_TOKEN \}\}/);
  assert.equal((deploy.match(/vars\.CLOUDFLARE_WEB_ANALYTICS_TOKEN/g) || []).length, 1);
  assert.match(deploy, /Prepare analytics-disabled artifact[\s\S]*?analytics_mode == 'disabled'.*analytics_provider == 'none'/);
  assert.match(deploy, /git diff --exit-code -- site[\s\S]*?status --porcelain=v1 --untracked-files=all -- site/);
  assert.match(deploy, /Verify final artifact digest[\s\S]*?prepare-pages-artifact\.mjs verify[\s\S]*?uses: actions\/upload-pages-artifact@v5\s*\n\s*with:\s*\n\s*path: \$\{\{ runner\.temp \}\}\/resume-pages-site/);
  assert.match(deploy, /deploy:\s*\n\s*needs: \[validate, artifact\]/);
  assert.match(deploy, /name: github-pages\s*\n\s*url: \$\{\{ steps\.deployment\.outputs\.page_url \}\}/);
  assert.match(deploy, /id-token: write\s*\n\s*pages: write/);
  assert.match(deploy, /uses: actions\/configure-pages@v6/);
  assert.match(deploy, /uses: actions\/deploy-pages@v5/);
  assert.match(deploy, /smoke:\s*\n\s*needs: \[validate, artifact, deploy\][\s\S]*?permissions: \{\}/);
  assert.match(deploy, /REPOSITORY: \$\{\{ github\.repository \}\}/);
  assert.match(deploy, /base_url.*!= https:\/\/\*[\s\S]*?page_authority.*== \*'@'\*[\s\S]*?unsafe deployment URL/);
  assert.match(deploy, /if \[\[ "\$REPOSITORY" == 'herehigher\/resume' \]\]; then\s*\n\s*test "\$base_url" = "\$EXPECTED_PAGE_URL"/);
  assert.match(deploy, /node scripts\/validate-pages-smoke\.mjs[\s\S]*?--analytics-mode "\$ANALYTICS_MODE"[\s\S]*?--provider-fingerprint "\$PROVIDER_FINGERPRINT"/);
  assert.doesNotMatch(deploy, /check_analytics\(/);
  assert.match(deploy, /local attempts=4[\s\S]*?for \(\(attempt = 1; attempt <= attempts; attempt \+= 1\)\); do/);
  assert.match(deploy, /if response_metadata="\$\(curl[\s\S]*?if grep --fixed-strings --quiet[\s\S]*?return 0/);
  assert.match(deploy, /if \(\(attempt < attempts\)\); then\s*\n\s*sleep 3/);
  assert.match(deploy, /Pages smoke failed for[\s\S]*?return 1/);
  assert.doesNotMatch(deploy, /--retry(?:\s|$)/);
  for (const publicPath of [
    "fetch_and_check '' root.html",
    "fetch_and_check 'ja/'",
    "fetch_and_check 'zh-cn/'",
    "fetch_and_check 'en/'",
    "fetch_and_check 'sitemap.xml'",
    "fetch_and_check 'schema/resume-studio-web-v1.schema.json'",
    "fetch_and_check 'schema/resume-studio-web-v1.example.json'",
    "fetch_and_check 'assets/js/config.js'"
  ]) assert.match(deploy, new RegExp(publicPath.replaceAll('.', '\\.')));
  assert.match(deploy, /mkdir -p "\$smoke_dir\/ja" "\$smoke_dir\/zh-cn" "\$smoke_dir\/en" "\$smoke_dir\/assets\/js"/);
  for (const relocation of [
    'mv "$smoke_dir/root.html" "$smoke_dir/index.html"',
    'mv "$smoke_dir/ja.html" "$smoke_dir/ja/index.html"',
    'mv "$smoke_dir/zh-cn.html" "$smoke_dir/zh-cn/index.html"',
    'mv "$smoke_dir/en.html" "$smoke_dir/en/index.html"',
    'mv "$smoke_dir/config.js" "$smoke_dir/assets/js/config.js"'
  ]) assert.ok(deploy.includes(relocation), `${relocation} is missing`);
  assert.match(deploy, /validate-pages-smoke\.mjs[\s\S]*?--directory "\$smoke_dir"[\s\S]*?--package-version "\$PACKAGE_VERSION"/);
});
