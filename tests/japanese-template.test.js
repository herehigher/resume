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
    responsibilities: '',
    achievements: ''
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
    responsibilities: '\n',
    achievements: ''
  }];
  html = renderJapaneseDocument(state);
  assert.doesNotMatch(html, /class="career-company"/);
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
  const japaneseCss = readFileSync(new URL('../site/assets/css/templates/ja.css', import.meta.url), 'utf8');

  assert.match(japaneseCss, /--ja-key-column:\s*88px/);
  assert.match(japaneseCss, /\.resume-profile\s*\{[^}]*border:\s*\.75pt solid var\(--ja-line-strong\);[^}]*grid-template-columns:\s*minmax\(0, 1fr\) 30mm/s);
  assert.match(japaneseCss, /\.profile-photo\s*\{[^}]*height:\s*40mm;[^}]*width:\s*30mm;/s);
  assert.match(japaneseCss, /\.resume-contact > div\s*\{[^}]*grid-template-columns:\s*var\(--ja-key-column\) minmax\(0, 1fr\)/s);
  assert.match(japaneseCss, /\.resume-contact \.paper-value\s*\{[^}]*min-width:\s*0;[^}]*overflow-wrap:\s*anywhere;/s);
  assert.match(japaneseCss, /\.paper-history-table\s*\{[^}]*table-layout:\s*fixed;/s);
  assert.match(japaneseCss, /\.paper-table-date\s*\{[^}]*vertical-align:\s*top;/s);
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

  assert.match(japaneseCss, /@page japanese-a4\s*\{[^}]*margin:\s*14mm 15mm;[^}]*size:\s*A4 portrait;/s);
  assert.match(printCss, /@page\s*\{[^}]*margin:\s*14mm 15mm;[^}]*\}/s);
  assert.doesNotMatch(printCss, /@page\s*\{[^}]*size:/s);
  assert.match(printCss, /\.document-page\s*\{[^}]*height:\s*auto;[^}]*min-height:\s*0;[^}]*overflow:\s*visible;[^}]*padding:\s*0;[^}]*width:\s*auto;/s);
  const documentPageRule = printCss.match(/\.document-page\s*\{([^}]*)\}/s)?.[1] || '';
  assert.doesNotMatch(documentPageRule, /(?:^|;)\s*(?:height:\s*297mm|overflow:\s*hidden)/s);
  assert.match(japaneseCss, /#japaneseWorkspace \.document-page\s*\{[^}]*height:\s*auto;[^}]*overflow:\s*visible;[^}]*page:\s*japanese-a4;/s);
  assert.match(japaneseCss, /\.paper-history-table,[\s\S]*\.career-company\s*\{\s*break-inside:\s*auto;/);
  assert.match(japaneseCss, /\.paper-history-table thead\s*\{\s*display:\s*table-header-group;/);
  assert.match(japaneseCss, /\.paper-text-section\s*\{\s*break-inside:\s*auto;/);
  assert.match(japaneseCss, /#japaneseWorkspace \.empty-preview\s*\{\s*display:\s*none;/s);
});
