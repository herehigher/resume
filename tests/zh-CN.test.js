import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createDefaultState } from '../site/assets/js/state/defaults.js';
import { createChineseSampleState } from '../site/assets/js/state/zh-CN.js';
import { validateState } from '../site/assets/js/state/schema.js';
import { loadStoredState } from '../site/assets/js/state/storage.js';
import { createStore } from '../site/assets/js/state/store.js';
import {
  calculateChineseCompletion,
  createChineseItem,
  protectChineseDraftBeforeSample,
  renderChineseEditorShell
} from '../site/assets/js/ui/chinese-editor.js';
import {
  formatChineseDate,
  formatChineseMonth,
  formatChineseRange,
  newestFirst,
  renderChineseResume
} from '../site/assets/js/templates/zh-CN.js';

function createMemoryStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    }
  };
}

test('Chinese dates use local notation and an explicit current-employment label', () => {
  assert.equal(formatChineseMonth('2026-09'), '2026.09');
  assert.equal(formatChineseDate('2026-09-01'), '2026年9月1日');
  assert.equal(formatChineseRange('2024-03', ''), '2024.03 — 至今');
  assert.equal(formatChineseRange('2020-01', '2023-12'), '2020.01 — 2023.12');
  assert.equal(formatChineseRange('', ''), '');
});

test('Chinese education and work histories sort newest first without mutating state', () => {
  const items = [
    { startDate: '2018-01', endDate: '2020-01', company: '较早' },
    { startDate: '2023-01', endDate: '', company: '在职' },
    { startDate: '2021-01', endDate: '2022-01', company: '较新' }
  ];
  const sorted = newestFirst(items);

  assert.deepEqual(sorted.map((item) => item.company), ['在职', '较新', '较早']);
  assert.deepEqual(items.map((item) => item.company), ['较早', '在职', '较新']);
});

test('empty optional sensitive fields do not reserve markup in the Chinese template', () => {
  const html = renderChineseResume(createDefaultState('zh-CN'));

  assert.doesNotMatch(html, /has-photo|zh-profile-photo|出生日期：|性别：|zh-optional-details/);
  assert.match(html, /zh-resume-document/);
});

test('Chinese template escapes text and only makes HTTP(S) profile links clickable', () => {
  const state = createDefaultState('zh-CN');
  state.profile.fields.fullName = '<img src=x onerror=alert(1)>';
  state.profile.fields.github = 'javascript:alert(1)';
  state.profile.fields.portfolio = 'https://example.com/me?x=1&y=2';
  state.documents['zh-CN'].resume.summary = '<script>alert(1)</script>';
  const html = renderChineseResume(state);

  assert.doesNotMatch(html, /<script>|<img src=x/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /<span class="zh-link">GitHub<\/span>/);
  assert.doesNotMatch(html, /href="javascript:/);
  assert.doesNotMatch(html, /href="mailto:/);
  assert.match(html, /href="https:\/\/example\.com\/me\?x=1&amp;y=2"/);
});

test('Chinese sample is schema-valid and covers every major resume section', () => {
  const source = createDefaultState('zh-CN');
  const sample = createChineseSampleState(source);
  const resume = sample.documents['zh-CN'].resume;

  assert.equal(validateState(sample).valid, true);
  assert.equal(source.profile.fields.fullName, '');
  assert.ok(sample.profile.fields.fullName);
  assert.ok(resume.headline);
  assert.ok(resume.summary);
  assert.ok(resume.experience.length >= 2);
  assert.ok(resume.projects.length >= 2);
  assert.ok(resume.education[0].school);
  assert.ok(resume.skills);
  assert.ok(resume.certifications.length >= 2);
  assert.equal(calculateChineseCompletion(sample), 100);
});

test('opening the Chinese sample protects the existing persisted draft', () => {
  const storage = createMemoryStorage();
  const store = createStore({ storage, initialState: createDefaultState('zh-CN') });
  store.update((state) => {
    state.profile.fields.fullName = '需要保留的姓名';
    state.documents['zh-CN'].resume.summary = '需要保留的概述';
  });
  const snapshot = protectChineseDraftBeforeSample(store, true);
  store.replace(createChineseSampleState(store.getState()), { type: 'zh-sample' });

  assert.equal(loadStoredState(storage).profile.fields.fullName, '需要保留的姓名');
  assert.equal(loadStoredState(storage).documents['zh-CN'].resume.summary, '需要保留的概述');
  assert.equal(snapshot.profile.fields.fullName, '需要保留的姓名');
});

test('Chinese sample renders current experience first and valid PDF links', () => {
  const html = renderChineseResume(createChineseSampleState(createDefaultState('zh-CN')));

  assert.ok(html.indexOf('星河数字科技有限公司') < html.indexOf('云启科技有限公司'));
  assert.match(html, /2022\.04 — 至今/);
  assert.match(html, /href="https:\/\/example\.com\/projects\/analytics"/);
  assert.match(html, /rel="noopener noreferrer"/);
  assert.match(html, /<ul class="zh-achievement-list">/);
  assert.match(html, /<li>主导企业分析产品的年度路线图与核心指标设计<\/li>/);
  assert.doesNotMatch(html, /<li>•/);
});

test('Chinese editor exposes all state-backed sections and accessible controls', () => {
  const shell = renderChineseEditorShell();

  for (const label of ['基本信息', '个人概述', '工作经历', '项目经历', '教育经历', '专业技能', '证书与资质']) {
    assert.match(shell, new RegExp(label));
  }
  assert.match(shell, /aria-label="中文简历填写表单"/);
  assert.match(shell, /aria-label="缩小预览"/);
  assert.match(shell, /data-profile="birthDate"/);
  assert.match(shell, /选填/);
});

test('Chinese repeating-item factories match the persisted state model', () => {
  assert.deepEqual(createChineseItem('experience'), {
    startDate: '', endDate: '', company: '', role: '', details: ''
  });
  assert.deepEqual(createChineseItem('projects'), {
    startDate: '', endDate: '', name: '', role: '', details: '', url: ''
  });
  assert.throws(() => createChineseItem('unknown'), /Unsupported Chinese resume item/);
});

test('Chinese A4 styles allow long content to paginate without clipping', () => {
  const css = readFileSync(new URL('../site/assets/css/templates/zh-CN.css', import.meta.url), 'utf8');

  assert.match(css, /\.zh-resume-document\s*\{/);
  assert.match(css, /overflow-wrap:\s*anywhere/);
  assert.match(css, /@page chinese-a4\s*\{[^}]*margin:\s*13mm 15mm 14mm;[^}]*size:\s*A4 portrait;/s);
  assert.match(css, /@media print/);
  assert.match(css, /min-height:\s*0/);
  assert.match(css, /height:\s*auto/);
  assert.match(css, /overflow:\s*visible/);
  assert.match(css, /page:\s*chinese-a4/);
});
