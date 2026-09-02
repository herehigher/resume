import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createEnglishSampleState } from '../site/assets/js/data/en-sample.js';
import { createDefaultState } from '../site/assets/js/state/defaults.js';
import {
  formatEnglishDateRange,
  formatEnglishMonth,
  renderEnglishResume,
  sortEnglishEntriesDescending
} from '../site/assets/js/templates/en.js';
import { createEnglishItem, renderEnglishWorkspace } from '../site/assets/js/ui/english-editor.js';

test('English dates use an unambiguous Month YYYY format', () => {
  assert.equal(formatEnglishMonth('2025-01'), 'January 2025');
  assert.equal(formatEnglishMonth('2025-13'), '');
  assert.equal(formatEnglishDateRange('2021-06', ''), 'June 2021 – Present');
  assert.equal(formatEnglishDateRange('2019-02', '2021-05'), 'February 2019 – May 2021');
});

test('English resume follows the natural ATS reading order and omits empty sections', () => {
  const emptyHtml = renderEnglishResume(createDefaultState('en'));
  for (const heading of ['Summary', 'Experience', 'Projects', 'Education', 'Skills', 'Certifications']) {
    assert.doesNotMatch(emptyHtml, new RegExp(`>${heading}<`));
  }

  const html = renderEnglishResume(createEnglishSampleState(createDefaultState('en')));
  const headings = ['Summary', 'Experience', 'Projects', 'Education', 'Skills', 'Certifications'];
  let previousIndex = -1;
  for (const heading of headings) {
    const index = html.indexOf(`>${heading}<`);
    assert.ok(index > previousIndex, `${heading} should follow the previous section`);
    previousIndex = index;
  }
});

test('experience entries render in reverse chronological order without changing state order', () => {
  const state = createDefaultState('en');
  state.documents.en.resume.experience = [
    { startDate: '2018-01', endDate: '2020-12', company: 'Earlier Co', role: 'Analyst', details: 'Earlier work' },
    { startDate: '2020-01', endDate: '', company: 'Earlier Current Co', role: 'Advisor', details: 'Ongoing work' },
    { startDate: '2023-01', endDate: '', company: 'Current Co', role: 'Lead', details: 'Current work' },
    { startDate: '2021-01', endDate: '2022-12', company: 'Middle Co', role: 'Manager', details: 'Middle work' }
  ];

  const sorted = sortEnglishEntriesDescending(state.documents.en.resume.experience, 'experience');
  assert.deepEqual(sorted.map((item) => item.company), ['Current Co', 'Earlier Current Co', 'Middle Co', 'Earlier Co']);
  assert.equal(state.documents.en.resume.experience[0].company, 'Earlier Co');

  const html = renderEnglishResume(state);
  assert.ok(html.indexOf('Current Co') < html.indexOf('Middle Co'));
  assert.ok(html.indexOf('Earlier Current Co') < html.indexOf('Middle Co'));
  assert.ok(html.indexOf('Middle Co') < html.indexOf('Earlier Co'));
});

test('English template excludes sensitive profile fields and only links HTTP(S) URLs', () => {
  const state = createEnglishSampleState(createDefaultState('en'));
  state.profile.fields.birthDate = '1980-01-01';
  state.profile.fields.gender = 'PRIVATE-GENDER';
  state.profile.fields.postalCode = 'PRIVATE-POSTAL';
  state.profile.fields.address = 'PRIVATE-FULL-ADDRESS';
  state.profile.fields.links[1] = 'javascript:alert(1)';
  state.documents.en.resume.projects[0].url = 'https://example.com/a-very-long-project-url-that-remains-clickable';

  const html = renderEnglishResume(state);
  assert.doesNotMatch(html, /1980-01-01|PRIVATE-GENDER|PRIVATE-POSTAL|PRIVATE-FULL-ADDRESS/);
  assert.match(html, /Location:<\/span> Seattle, WA \/ United States/);
  assert.doesNotMatch(html, /href="javascript:/);
  assert.match(html, /href="https:\/\/example\.com\/a-very-long-project-url-that-remains-clickable"/);
});

test('English page-size setting selects an A4 or US Letter document class', () => {
  const state = createDefaultState('en');
  assert.match(renderEnglishResume(state), /en-page-size-letter[^>]+data-page-size="LETTER"/);
  state.settings.pageSizeByLocale.en = 'A4';
  assert.match(renderEnglishResume(state), /en-page-size-a4[^>]+data-page-size="A4"/);
});

test('English sample and editor cover all ATS sections without private-profile controls', () => {
  const state = createEnglishSampleState(createDefaultState('ja'));
  assert.equal(state.settings.locale, 'en');
  assert.equal(state.profile.fields.birthDate, '');
  assert.equal(state.profile.fields.gender, '');
  assert.equal(state.profile.fields.address, '');
  assert.ok(state.documents.en.resume.experience.length >= 2);

  const editor = renderEnglishWorkspace();
  for (const label of ['City, State / Country', 'Professional summary', 'Experience', 'Projects', 'Education', 'Skills and certifications', 'US Letter', 'A4']) {
    assert.match(editor, new RegExp(label));
  }
  assert.doesNotMatch(editor, /Birth date|Gender|Full address|Photo/);
  assert.deepEqual(createEnglishItem('certifications'), { date: '', name: '', url: '' });
  assert.equal(createEnglishItem('unknown'), null);
});

test('English responsibilities render as semantic achievement bullets', () => {
  const state = createDefaultState('en');
  state.documents.en.resume.experience = [{
    startDate: '2024-01',
    endDate: '',
    company: 'Example Co',
    role: 'Lead',
    details: '• Increased conversion by 20%\n- Reduced support volume by 15%'
  }];

  const html = renderEnglishResume(state);
  assert.match(html, /<ul class="en-achievement-list">/);
  assert.match(html, /<li>Increased conversion by 20%<\/li>/);
  assert.match(html, /<li>Reduced support volume by 15%<\/li>/);
  assert.doesNotMatch(html, /<li>[•-]/);
});

test('English print CSS defines both paper sizes and wraps long content', () => {
  const css = readFileSync(new URL('../site/assets/css/templates/en.css', import.meta.url), 'utf8');
  assert.match(css, /@page english-a4[\s\S]*size:\s*A4 portrait/);
  assert.match(css, /@page english-letter[\s\S]*size:\s*Letter portrait/);
  assert.match(css, /overflow-wrap:\s*anywhere/);
  assert.match(css, /\.document-page\.english-document\.en-page-size-letter/);
});
