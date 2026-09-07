import test from 'node:test';
import assert from 'node:assert/strict';

import { createDefaultState } from '../site/assets/js/state/defaults.js';
import { PAGE_BREAK_LABELS, SECTION_REGISTRY, describePageBreak, getPageBreaks, getVisibleSectionKeys, validatePageBreaks } from '../site/assets/js/page-breaks.js';
import { renderEnglishDocument } from '../site/assets/js/templates/en.js';
import { renderChineseDocument } from '../site/assets/js/templates/zh-CN.js';
import { renderJapaneseDocument } from '../site/assets/js/templates/ja.js';

test('section registry is the shared bounded source of saved page-break targets', () => {
  const state = createDefaultState();
  assert.deepEqual(SECTION_REGISTRY.ja.resume.map((section) => section.key), ['identity', 'history', 'qualifications', 'motivation', 'requests']);
  assert.deepEqual(SECTION_REGISTRY.ja.career.map((section) => section.key), ['identity', 'summary', 'skills', 'career-history', 'self-promotion']);
  assert.deepEqual(getPageBreaks(state, 'en', 'A4', 'resume'), []);
  state.settings.pageBreaks.en.A4.resume = ['projects', 'projects'];
  assert.match(validatePageBreaks(state.settings.pageBreaks).join(' '), /duplicates/);
  state.settings.pageBreaks.en.A4.resume = ['identity'];
  assert.match(validatePageBreaks(state.settings.pageBreaks).join(' '), /unsupported section key/);
});

test('registry derives visible sections from state before preview controls map to the DOM', () => {
  const state = createDefaultState('en');
  assert.deepEqual(getVisibleSectionKeys(state, 'en', 'resume'), ['identity']);
  state.documents.en.resume.summary = 'Fictional summary';
  state.documents.en.resume.experience[0].company = 'Fictional company';
  assert.deepEqual(getVisibleSectionKeys(state, 'en', 'resume'), ['identity', 'summary', 'experience']);
  assert.equal(getVisibleSectionKeys(state, 'ja', 'resume').length, 5);
});

test('desktop page-break actions use the compact localized add and remove pairs', () => {
  assert.deepEqual([PAGE_BREAK_LABELS.ja.add, PAGE_BREAK_LABELS.ja.remove], ['改頁', '解除']);
  assert.deepEqual([PAGE_BREAK_LABELS['zh-CN'].add, PAGE_BREAK_LABELS['zh-CN'].remove], ['分页', '取消']);
  assert.deepEqual([PAGE_BREAK_LABELS.en.add, PAGE_BREAK_LABELS.en.remove], ['Add', 'Remove']);
});

test('accessible names describe both adjacent sections and the page-break action', () => {
  const previous = { label: '基本情報' };
  const target = { label: '学歴・職歴' };
  assert.equal(describePageBreak('ja', previous, target, false), '基本情報の後、学歴・職歴の前に改ページを追加');
  assert.equal(describePageBreak('ja', previous, target, true), '基本情報の後、学歴・職歴の前に改ページを解除');
  assert.equal(describePageBreak('zh-CN', { label: '基本信息' }, { label: '个人概述' }, false), '基本信息之后、个人概述之前添加分页');
  assert.equal(describePageBreak('en', { label: 'Contact information' }, { label: 'Summary' }, true), 'Remove page break between Contact information and Summary');
});

test('renderers expose semantic sections for legal visible-boundary controls', () => {
  const state = createDefaultState();
  state.documents.en.resume.summary = 'Fictional summary';
  state.documents['zh-CN'].resume.summary = '虚构概述';
  const english = renderEnglishDocument(state);
  const chinese = renderChineseDocument(state);
  const japaneseResume = renderJapaneseDocument(state);
  state.documents.ja.activeDocument = 'career';
  const japaneseCareer = renderJapaneseDocument(state);
  assert.match(english, /data-section-key="identity"/);
  assert.match(english, /data-section-key="summary"/);
  assert.match(chinese, /data-section-key="identity"/);
  assert.match(chinese, /data-section-key="summary"/);
  assert.match(japaneseResume, /data-section-key="requests"/);
  assert.match(japaneseCareer, /data-section-key="career-history"/);
});
