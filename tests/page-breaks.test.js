import test from 'node:test';
import assert from 'node:assert/strict';

import { createDefaultState } from '../site/assets/js/state/defaults.js';
import { PAGE_BREAK_LABELS, SECTION_REGISTRY, SEMANTIC_BOUNDARY_REGISTRY, describePageBreak, describePageBreakCandidate, getBoundaryCandidates, getPageBreaks, getVisibleSectionKeys, validatePageBreaks } from '../site/assets/js/page-breaks.js';
import { renderEnglishDocument } from '../site/assets/js/templates/en.js';
import { renderChineseDocument } from '../site/assets/js/templates/zh-CN.js';
import { renderJapaneseDocument } from '../site/assets/js/templates/ja.js';

test('section registry is the shared bounded source of saved page-break targets', () => {
  const state = createDefaultState();
  assert.deepEqual(SECTION_REGISTRY.ja.resume.map((section) => section.key), ['identity', 'history', 'qualifications', 'motivation', 'requests']);
  assert.deepEqual(SECTION_REGISTRY.ja.career.map((section) => section.key), ['identity', 'summary', 'skills', 'career-history', 'self-promotion']);
  assert.deepEqual(getPageBreaks(state, 'en', 'A4', 'resume'), []);
  state.settings.pageBreaks.en.A4.resume.sections = ['projects', 'projects'];
  assert.match(validatePageBreaks(state.settings.pageBreaks).join(' '), /duplicates/);
  state.settings.pageBreaks.en.A4.resume.sections = ['identity'];
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

test('pagination rail candidates expose position, target, state, and total in every locale', () => {
  assert.equal(describePageBreakCandidate('ja', 4, 12, { label: 'B社' }, false), '位置 4 / 12、B社の前、未設定');
  assert.equal(describePageBreakCandidate('zh-CN', 4, 12, { label: 'B 公司' }, true), '位置 4 / 12、B 公司之前、已设置');
  assert.equal(describePageBreakCandidate('en', 4, 12, { label: 'Company B' }, false), 'Position 4 of 12, before Company B, Not set');
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

function fakeElement({ order, selectors, recordId = '', text = 'Visible content' }) {
  return {
    dataset: recordId ? { recordId } : {},
    hidden: false,
    selectors,
    textContent: text,
    getAttribute: () => null,
    closest: () => null,
    matches: () => false,
    querySelector: () => null,
    compareDocumentPosition(other) { return order < other.order ? 4 : 2; }
  };
}

function fakePreview(elements) {
  return {
    querySelector(selector) { return elements.find((element) => element.selectors.includes(selector)) || null; },
    querySelectorAll(selector) { return elements.filter((element) => element.selectors.includes(selector)); }
  };
}

test('semantic boundary registry centralizes three-language record DOM mappings', () => {
  const jaRecord = SEMANTIC_BOUNDARY_REGISTRY.ja.career.find((item) => item.level === 'record');
  const zhRecord = SEMANTIC_BOUNDARY_REGISTRY['zh-CN'].resume.find((item) => item.level === 'record');
  const enRecord = SEMANTIC_BOUNDARY_REGISTRY.en.resume.find((item) => item.level === 'record');
  assert.deepEqual([jaRecord.parent, zhRecord.parent, enRecord.parent], ['career-history', 'experience', 'experience']);
  assert.match(jaRecord.dom.selector, /career-company/);
  assert.match(zhRecord.dom.selector, /zh-timeline-item/);
  assert.match(enRecord.dom.selector, /en-experience-entry/);
});

test('record boundaries follow rendered order and retain stable IDs independently from their section', () => {
  const state = createDefaultState('en');
  state.documents.en.resume.experience = [
    { id: 'record_old', company: 'Older fictional employer', role: '', startDate: '2020-01', endDate: '2021-01', details: '' },
    { id: 'record_new', company: 'Newer fictional employer', role: '', startDate: '2023-01', endDate: '', details: '' }
  ];
  const selectors = {
    identity: '[data-section-key="identity"]',
    experience: '[data-section-key="experience"]',
    records: '[data-section-key="experience"] .en-experience-entry[data-record-id]'
  };
  const preview = fakePreview([
    fakeElement({ order: 1, selectors: [selectors.identity] }),
    fakeElement({ order: 2, selectors: [selectors.experience] }),
    fakeElement({ order: 3, selectors: [selectors.records], recordId: 'record_new' }),
    fakeElement({ order: 4, selectors: [selectors.records], recordId: 'record_old' }),
    fakeElement({ order: 5, selectors: [selectors.records], recordId: 'record_hidden', text: '' })
  ]);
  const candidates = getBoundaryCandidates({ state, locale: 'en', documentType: 'resume', preview });
  const experience = candidates.find((candidate) => candidate.key === 'experience');
  assert.deepEqual(candidates.map((candidate) => candidate.key), ['experience', 'record:record_old']);
  assert.equal(experience.hasRedundantFirstRecordBinding, true);
  assert.deepEqual(experience.bindings.map((target) => target.key), ['experience', 'record_new']);
  assert.equal(candidates.some((candidate) => candidate.key === 'record:record_new'), false);
  assert.equal(candidates.find((candidate) => candidate.key === 'record:record_old').previous.bindings.some((target) => target.key === experience.key), true);
  assert.equal(candidates.find((candidate) => candidate.key === 'record:record_old').visualPrevious.element.dataset.recordId, 'record_new');
});
