import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createDefaultState, createJapaneseSampleState } from '../site/assets/js/state/defaults.js';
import { renderJapaneseDocument } from '../site/assets/js/templates/ja.js';
import { calculateAge, formatJapaneseDate, formatJapaneseMonth } from '../site/assets/js/utils/date.js';

test('Japanese document renderer switches between resume and career templates', () => {
  const state = createDefaultState('ja');
  state.profile.fields.fullName = '山田 花子';

  assert.match(renderJapaneseDocument(state), /履 歴 書/);
  assert.doesNotMatch(renderJapaneseDocument(state), /<h2>職務経歴書<\/h2>/);

  state.documents.ja.activeDocument = 'career';
  assert.match(renderJapaneseDocument(state), /<h2>職務経歴書<\/h2>/);
  assert.doesNotMatch(renderJapaneseDocument(state), /履 歴 書/);
});

test('Japanese template renders photos only from an explicit display URL', () => {
  const state = createDefaultState('ja');
  state.profile.photo = 'data:image/png;base64,private-photo-bytes';

  assert.doesNotMatch(renderJapaneseDocument(state), /data:image|<img/);
  const html = renderJapaneseDocument(state, { photoUrl: 'blob:https://example.test/photo-id' });
  assert.match(html, /<img src="blob:https:\/\/example\.test\/photo-id" alt="">/);
  assert.doesNotMatch(html, /data:image/);
});

test('Japanese dates, age, and current employment use conventional labels', () => {
  assert.equal(formatJapaneseMonth('2026-09'), '2026年 9月');
  assert.equal(formatJapaneseDate('2026-09-01'), '2026年9月1日');
  assert.equal(calculateAge('2000-09-02', '2026-09-01'), '25歳');

  const state = createDefaultState('ja');
  state.documents.ja.activeDocument = 'career';
  state.documents.ja.careers = [{
    company: '株式会社テスト',
    role: '',
    startDate: '2024-04',
    endDate: '',
    companyInfo: '',
    detailSections: []
  }];

  assert.match(renderJapaneseDocument(state), /2024年 4月 〜 現在/);
});

test('Japanese PDF output omits blank rows and empty career entries', () => {
  const state = createDefaultState('ja');
  state.documents.ja.education = [
    { date: '  ', detail: '\n' },
    { date: '2020-04', detail: '○○大学 入学' },
    { date: ' ', detail: '○○大学 卒業' },
    { date: 'invalid-date', detail: '○○大学 修了' }
  ];
  state.documents.ja.employment = [{ date: '', detail: '   ' }];
  state.documents.ja.qualification = [
    { date: '', detail: '', url: '  ' },
    { date: '2025-05', detail: '日本語能力試験 N1', url: '' }
  ];
  let html = renderJapaneseDocument(state);

  assert.match(html, /○○大学 入学/);
  assert.match(html, /○○大学 卒業/);
  assert.match(html, /○○大学 修了/);
  assert.match(html, /日本語能力試験 N1/);
  assert.doesNotMatch(html, /NaN/);
  assert.doesNotMatch(html, />職歴<\/div>/);
  assert.equal((html.match(/class="paper-table-row"/g) || []).length, 4);

  state.documents.ja.activeDocument = 'career';
  state.documents.ja.careers = [{
    company: ' ',
    role: '',
    startDate: '',
    endDate: '',
    companyInfo: '',
    detailSections: [{ title: ' \n', content: '' }]
  }];
  html = renderJapaneseDocument(state);
  assert.doesNotMatch(html, /class="career-company"/);
});

test('Japanese career detail sections render non-empty content in order, preserve body-only values, and escape input', () => {
  const state = createDefaultState('ja');
  state.documents.ja.activeDocument = 'career';
  state.documents.ja.careers = [{
    company: '架空株式会社',
    role: '検証担当',
    startDate: '',
    endDate: '',
    companyInfo: '',
    detailSections: [
      { title: 'プロジェクト概要', content: '最初の内容' },
      { title: '  ', content: '本文だけ' },
      { title: '成果', content: '   ' },
      { title: '空項目', content: '' },
      { title: '<img src=x onerror=alert(1)>', content: '<script>alert(1)</script>' },
      { title: '長文タイトル<script>', content: Array.from({ length: 13 }, (_, index) => `行 ${index + 1}`).join('\n') }
    ]
  }];

  const html = renderJapaneseDocument(state);
  assert.ok(html.indexOf('プロジェクト概要') < html.indexOf('項目名未入力'));
  assert.match(html, /<div>項目名未入力<\/div><div>本文だけ<\/div>/);
  assert.doesNotMatch(html, /<div>成果<\/div>|空項目/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>|<img src=x/);
  assert.match(html, /職務経歴（続き） · 架空株式会社 · 検証担当 · 長文タイトル&lt;script&gt;/);
});

test('Japanese career preview and PDF markup omit default detail sections without body content', () => {
  const state = createDefaultState('ja');
  state.documents.ja.activeDocument = 'career';
  state.documents.ja.careers[0].company = '架空株式会社';

  const html = renderJapaneseDocument(state);
  assert.match(html, /架空株式会社/);
  assert.doesNotMatch(html, /担当業務|実績・成果|項目名未入力/);
});

test('Japanese profile and credential links only activate HTTP URLs', () => {
  const state = createDefaultState('ja');
  state.profile.fields.links = ['https://github.com/example', 'javascript:alert(1)'];
  state.documents.ja.qualification = [{
    date: '2026-01',
    detail: '認定資格',
    url: 'https://example.com/credentials/123'
  }];
  const html = renderJapaneseDocument(state);

  assert.match(html, /href="https:\/\/github\.com\/example"/);
  assert.match(html, /href="https:\/\/example\.com\/credentials\/123"/);
  assert.doesNotMatch(html, /href="javascript:/);
  assert.match(html, /Website · javascript:alert\(1\)/);
});

test('Japanese resume prints local link icons and repeated semantic history headings', () => {
  const state = createJapaneseSampleState(createDefaultState('ja'));
  const html = renderJapaneseDocument(state);

  assert.match(html, /class="resume-links" aria-label="Links"/);
  assert.match(html, /profile-link-icon--github/);
  assert.match(html, /Website · example\.com/);
  const japaneseCss = readFileSync(new URL('../site/assets/css/templates/ja.css', import.meta.url), 'utf8');
  assert.match(japaneseCss, /\.resume-links \{[^}]*margin:\s*0 0 16px/s);
  assert.match(html, /<table class="paper-history-table"><thead><tr class="paper-table-header"><th>年月<\/th><th>履歴書 · 山田 太郎 · 学歴<\/th>/);
  assert.match(html, /<table class="paper-history-table"><thead><tr class="paper-table-header"><th>年月<\/th><th>履歴書 · 山田 太郎 · 職歴<\/th>/);
  assert.match(html, /<tr class="paper-table-row"><td class="paper-table-date">/);
});

test('Japanese resume uses unified personal-information borders and a fixed photo frame', () => {
  const state = createDefaultState('ja');
  const html = renderJapaneseDocument(state);
  const japaneseCss = readFileSync(new URL('../site/assets/css/templates/ja.css', import.meta.url), 'utf8');

  assert.match(japaneseCss, /--ja-key-column:\s*88px/);
  assert.match(japaneseCss, /\.resume-profile\s*\{[^}]*border:\s*\.75pt solid var\(--ja-line-strong\);[^}]*grid-template-columns:\s*minmax\(0, 1fr\) auto/s);
  assert.match(japaneseCss, /\.profile-text\s*\{[^}]*display:\s*grid;[^}]*grid-template-rows:\s*minmax\(38px, auto\) minmax\(68px, auto\) minmax\(38px, auto\);[^}]*min-height:\s*40mm/s);
  assert.match(japaneseCss, /\.profile-text \.paper-label\s*\{[^}]*align-self:\s*stretch;[^}]*border-right:\s*\.5pt solid var\(--ja-line-default\)/s);
  assert.match(japaneseCss, /\.profile-photo-column\s*\{[^}]*align-self:\s*stretch;[^}]*border-left:\s*\.5pt solid var\(--ja-line-default\);[^}]*display:\s*flex/s);
  assert.match(japaneseCss, /\.profile-photo\s*\{[^}]*flex:\s*0 0 auto;[^}]*height:\s*40mm;[^}]*width:\s*30mm;/s);
  assert.match(html, /<div class="profile-photo-column"><div class="profile-photo">/);
  assert.match(japaneseCss, /\.resume-contact > div\s*\{[^}]*grid-template-columns:\s*var\(--ja-key-column\) minmax\(0, 1fr\)/s);
  assert.match(japaneseCss, /\.resume-contact \.paper-value\s*\{[^}]*min-width:\s*0;[^}]*overflow-wrap:\s*anywhere;/s);
  assert.match(japaneseCss, /\.paper-history-table\s*\{[^}]*table-layout:\s*fixed;/s);
  assert.match(japaneseCss, /\.paper-table-date\s*\{[^}]*vertical-align:\s*top;/s);
});

test('Japanese resume flows every section in one printable document and wraps unbroken input', () => {
  const state = createDefaultState('ja');
  const longUrl = `https://example.invalid/${'longpath'.repeat(50)}`;
  state.documents.ja.fields.motivation = longUrl;
  const html = renderJapaneseDocument(state);
  const japaneseCss = readFileSync(new URL('../site/assets/css/templates/ja.css', import.meta.url), 'utf8');

  assert.equal((html.match(/<article class="document-page resume-document">/g) || []).length, 1);
  assert.equal((html.match(/longpath/g) || []).length, 50);
  for (const [before, after] of [
    ['学歴・職歴', '免許・資格'],
    ['免許・資格', '志望動機・自己PRなど'],
    ['志望動機・自己PRなど', '本人希望記入欄']
  ]) {
    assert.ok(html.indexOf(before) < html.indexOf(after), `${before} should precede ${after}`);
  }
  assert.match(japaneseCss, /\.paper-text-content\s*\{[^}]*overflow-wrap:\s*anywhere;/s);
  assert.match(japaneseCss, /\.career-body\s*\{[^}]*min-width:\s*0;[^}]*overflow-wrap:\s*anywhere;/s);
  assert.match(japaneseCss, /\.career-company-grid\s*\{[^}]*grid-template-columns:\s*105px minmax\(0, 1fr\)/s);
  assert.match(japaneseCss, /\.career-company-grid > div\s*\{[^}]*min-width:\s*0;[^}]*overflow-wrap:\s*anywhere;/s);
});

test('Japanese sample data is isolated from the current draft', () => {
  const draft = createDefaultState('ja');
  draft.profile.fields.fullName = '保存中の氏名';
  draft.documents.ja.fields.motivation = '保存中の志望動機';

  const sample = createJapaneseSampleState(draft);
  sample.profile.fields.fullName = '編集した入力例';

  assert.equal(draft.profile.fields.fullName, '保存中の氏名');
  assert.equal(draft.documents.ja.fields.motivation, '保存中の志望動機');
  assert.notEqual(sample.documents.ja.fields.motivation, draft.documents.ja.fields.motivation);
});

test('Japanese template keeps A4 print dimensions without clipping long content', () => {
  const japaneseCss = readFileSync(new URL('../site/assets/css/templates/ja.css', import.meta.url), 'utf8');
  const printCss = readFileSync(new URL('../site/assets/css/print.css', import.meta.url), 'utf8');

  assert.doesNotMatch(japaneseCss, /@page|[;{]\s*page\s*:/);
  assert.doesNotMatch(printCss, /@page|[;{]\s*page\s*:/);
  assert.match(printCss, /\.document-page\s*\{[^}]*height:\s*auto;[^}]*min-height:\s*0;[^}]*overflow:\s*visible;[^}]*padding:\s*0;[^}]*width:\s*auto;/s);
  const documentPageRule = printCss.match(/\.document-page\s*\{([^}]*)\}/s)?.[1] || '';
  assert.doesNotMatch(documentPageRule, /(?:^|;)\s*(?:height:\s*297mm|overflow:\s*hidden)/s);
  assert.match(japaneseCss, /#japaneseWorkspace \.document-page\s*\{[^}]*height:\s*auto;[^}]*overflow:\s*visible;/s);
  assert.match(japaneseCss, /\.paper-history-table,[\s\S]*\.career-company\s*\{\s*break-inside:\s*auto;/);
  assert.match(japaneseCss, /\.paper-history-table thead\s*\{\s*display:\s*table-header-group;/);
  assert.match(japaneseCss, /\.paper-text-section\s*\{\s*break-inside:\s*auto;/);
  assert.match(japaneseCss, /#japaneseWorkspace \.empty-preview\s*\{\s*display:\s*none;/s);
});
