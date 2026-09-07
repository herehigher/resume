import test from 'node:test';
import assert from 'node:assert/strict';

import { createDefaultState } from '../site/assets/js/state/defaults.js';
import { PAGE_BREAK_LABELS, SECTION_REGISTRY, getPageBreaks, validatePageBreaks } from '../site/assets/js/page-breaks.js';
import { renderEnglishDocument } from '../site/assets/js/templates/en.js';
import { renderChineseDocument } from '../site/assets/js/templates/zh-CN.js';
import { renderJapaneseDocument } from '../site/assets/js/templates/ja.js';

test('section registry is the shared bounded source of saved page-break targets', () => {
  const state = createDefaultState();
  assert.deepEqual(SECTION_REGISTRY.ja.resume, ['identity', 'history', 'qualifications', 'motivation', 'requests']);
  assert.deepEqual(SECTION_REGISTRY.ja.career, ['identity', 'summary', 'skills', 'career-history', 'self-promotion']);
  assert.deepEqual(getPageBreaks(state, 'en', 'A4', 'resume'), []);
  state.settings.pageBreaks.en.A4.resume = ['projects', 'projects'];
  assert.match(validatePageBreaks(state.settings.pageBreaks).join(' '), /duplicates/);
  state.settings.pageBreaks.en.A4.resume = ['identity'];
  assert.match(validatePageBreaks(state.settings.pageBreaks).join(' '), /unsupported section key/);
});

test('desktop page-break actions use the compact localized add and remove pairs', () => {
  assert.deepEqual([PAGE_BREAK_LABELS.ja.add, PAGE_BREAK_LABELS.ja.remove], ['追加', '解除']);
  assert.deepEqual([PAGE_BREAK_LABELS['zh-CN'].add, PAGE_BREAK_LABELS['zh-CN'].remove], ['分页', '取消']);
  assert.deepEqual([PAGE_BREAK_LABELS.en.add, PAGE_BREAK_LABELS.en.remove], ['Add', 'Remove']);
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
