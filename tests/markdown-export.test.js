import assert from 'node:assert/strict';
import test from 'node:test';
import { createDefaultState, createJapaneseCareer } from '../site/assets/js/state/defaults.js';
import { exportMarkdown } from '../site/assets/js/utils/markdown-export.js';
import { exportLimitedMarkdown, renderLimitedMarkdown } from '../site/assets/js/utils/limited-markdown.js';
import { markdownLink, markdownParagraph, markdownText } from '../site/assets/js/utils/markdown-text.js';

function fictionalState(locale = 'ja') {
  const state = createDefaultState(locale);
  Object.assign(state.profile.fields, {
    fullName: 'Fictional Person', birthDate: '1990-02-03', gender: 'female', nationality: 'Fictionland',
    postalCode: '12345', address: 'Private Fictional Address', phone: '0000000000', email: 'fictional@example.com',
    links: ['https://example.com/second', 'javascript:alert(1)', 'https://example.com/first']
  });
  state.profile.photo = 'PHOTO_SENTINEL';
  state.documents.ja.fields.motivation = 'JAPANESE_RESUME_ONLY';
  state.documents.ja.fields.careerSummary = 'JAPANESE_CAREER_ONLY';
  state.documents.en.resume.summary = 'ENGLISH_ONLY';
  state.documents['zh-CN'].resume.summary = 'CHINESE_ONLY';
  return state;
}

function inOrder(text, values) {
  let previous = -1;
  for (const value of values) {
    const index = text.indexOf(value);
    assert.ok(index > previous, `${value} follows the preceding item`);
    previous = index;
  }
}

test('all four document exports use the current locale/document and never mutate state or emit layout data', () => {
  for (const [locale, type, includes, excludes] of [
    ['ja', 'resume', 'JAPANESE_RESUME_ONLY', ['JAPANESE_CAREER_ONLY', 'CHINESE_ONLY', 'ENGLISH_ONLY']],
    ['ja', 'career', 'JAPANESE_CAREER_ONLY', ['JAPANESE_RESUME_ONLY', 'CHINESE_ONLY', 'ENGLISH_ONLY']],
    ['zh-CN', 'resume', 'CHINESE_ONLY', ['JAPANESE_RESUME_ONLY', 'JAPANESE_CAREER_ONLY', 'ENGLISH_ONLY']],
    ['en', 'resume', 'ENGLISH_ONLY', ['JAPANESE_RESUME_ONLY', 'JAPANESE_CAREER_ONLY', 'CHINESE_ONLY']]
  ]) {
    const state = fictionalState(locale);
    state.documents[locale].activeDocument = type;
    const snapshot = structuredClone(state);
    const result = exportMarkdown(state);
    assert.equal(result.filename, `resume-studio-${locale}-${type}.md`);
    assert.ok(result.text.includes(includes.replaceAll('_', '\\_')));
    for (const excluded of [...excludes, 'PHOTO_SENTINEL', 'pageBreaks', 'pageSize', 'LETTER', 'version']) assert.ok(!result.text.includes(excluded.replaceAll('_', '\\_')));
    assert.deepEqual(state, snapshot);
    assert.ok(result.text.endsWith('\n'));
  }
});

test('English optional information and Japanese career contact scope match the current templates', () => {
  const state = fictionalState('en');
  state.documents.en.resume.location = 'Visible Fictional City';
  let text = exportMarkdown(state).text;
  for (const hidden of ['1990', 'Female', 'Fictionland', 'Private Fictional Address', '12345']) assert.ok(!text.includes(hidden), hidden);
  assert.ok(text.includes('Visible Fictional City'));
  assert.ok(text.includes('fictional&#64;example\\.com'));
  state.documents.en.resume.showOptionalPersonalDetails = true;
  text = exportMarkdown(state).text;
  for (const visible of ['1990', 'Female', 'Fictionland', 'Private Fictional Address', '12345']) assert.ok(text.includes(visible), visible);
  state.documents.ja.activeDocument = 'career';
  Object.assign(state.documents.ja.fields, { residenceStatus: 'Fictional Status', workRestriction: 'restricted', residenceExpiryDate: '2030-02-03', nameKana: 'HIDDEN_KANA' });
  text = exportMarkdown(state, 'ja').text;
  for (const hidden of ['1990', '女性', 'Private Fictional Address', '12345', '0000000000', 'fictional&#64;', 'HIDDEN']) assert.ok(!text.includes(hidden), hidden);
  for (const visible of ['Fictional Person', 'Fictionland', 'Fictional Status', 'あり', '2030年2月3日', 'example.com/second']) assert.ok(text.includes(visible.replaceAll('.', '\\.')), visible);
});

test('Japanese resume exports filled fields and history arrays in saved order, omitting empty items and career-only text', () => {
  const state = fictionalState();
  Object.assign(state.documents.ja.fields, { nameKana: 'ふりがな架空', addressKana: 'じゅうしょ架空', createdDate: '2026-10-21', motivation: '**志望**\n次の行', requests: '希望文' });
  state.documents.ja.education = [{ date: '2025-09', detail: 'Later school' }, { date: '', detail: '' }, { date: '2020-04', detail: 'Earlier school' }];
  state.documents.ja.employment = [{ date: '2026-01', detail: 'Fictional employment' }];
  state.documents.ja.qualification = [{ date: '', detail: '', url: 'https://example.com/certificate' }];
  const { text } = exportMarkdown(state);
  inOrder(text, ['学歴', 'Later school', 'Earlier school', '職歴', 'Fictional employment', '免許・資格', 'certificate', '志望動機', '本人希望']);
  for (const visible of ['ふりがな架空', 'じゅうしょ架空', '満36歳', '2026年10月21日', '女性', '希望文', '**志望**  \n次の行']) assert.ok(text.includes(visible), visible);
  assert.ok(!text.includes('未入力'));
  assert.ok(!text.includes('false'));
});

test('Japanese careers and nested detail sections retain array order while title-only sections are omitted', () => {
  const state = fictionalState();
  state.documents.ja.activeDocument = 'career';
  const career = (company, title) => ({ ...createJapaneseCareer(), company, role: 'Fictional role', startDate: '2024-01', companyInfo: '**Company text**', detailSections: [{ title, content: 'Actual detail' }, { title: 'EMPTY TITLE ONLY', content: '' }, { title: 'Second title', content: '- Last detail' }] });
  state.documents.ja.careers = [career('Second company', 'Second company title'), createJapaneseCareer(), career('First company', 'First company title')];
  const { text } = exportMarkdown(state);
  inOrder(text, ['Second company', 'Second company title', 'Last detail', 'First company', 'First company title']);
  assert.ok(!text.includes('EMPTY TITLE ONLY'));
  assert.ok(text.includes('2024年 1月 〜 現在'));
  assert.ok(text.includes('**Company text**'));
});

for (const locale of ['en', 'zh-CN']) {
  test(`${locale} exports every international list in array order and preserves plain text rather than interpreting limited markup`, () => {
    const state = fictionalState(locale);
    const resume = state.documents[locale].resume;
    resume.headline = 'Fictional headline';
    resume.skills = '**literal**\n# literal heading';
    for (const key of ['experience', 'projects', 'education', 'certifications']) {
      const entry = (prefix) => ({ id: `${prefix}-id`, startDate: '2024-03', endDate: '', date: '2023-02', company: `${prefix} company`, role: `${prefix} role`, name: `${prefix} name`, school: `${prefix} school`, degree: `${prefix} degree`, details: `${prefix} detail\n• Another detail`, url: 'https://example.com/a(b)?x=1&y=2' });
      resume[key] = [entry(`${key}Second`), {}, entry(`${key}First`)];
    }
    const { text } = exportMarkdown(state);
    inOrder(text, ['experienceSecond', 'experienceFirst', 'projectsSecond', 'projectsFirst', 'educationSecond', 'educationFirst', 'certificationsSecond', 'certificationsFirst']);
    assert.ok(text.includes('\\*\\*literal\\*\\*  \n\\# literal heading'));
    assert.ok(text.includes('(<https://example.com/a%28b%29?x=1&amp;y=2>)'));
    assert.ok(!text.includes('false'));
    assert.ok(!text.includes('[object Object]'));
  });
}

test('empty documents omit empty sections and placeholder text', () => {
  for (const locale of ['ja', 'en', 'zh-CN']) {
    const state = createDefaultState(locale);
    state.documents.ja.fields.createdDate = '';
    const { text } = exportMarkdown(state);
    assert.equal(text.split('\n').filter(Boolean).length, 1);
    state.documents.ja.activeDocument = 'career';
    if (locale === 'ja') assert.equal(exportMarkdown(state).text, '# 職務経歴書\n');
  }
  assert.throws(() => exportMarkdown(createDefaultState(), 'xx'), /Unsupported/);
});

test('plain text protects multiline headings, references, HTML, images, links, tables and autolinks', () => {
  const source = 'First\r\n===\n# Heading\n[ref]: javascript:alert(1)\n![image](https://example.com/x)\n<script>alert(1)</script>\n    indented\nhttps://example.com\nfictional@example.com\n| table |';
  const text = markdownParagraph(source);
  assert.ok(text.includes('First  \n\\=\\=\\='));
  assert.ok(text.includes('  \n\\# Heading'));
  assert.ok(text.includes('&#32;&#32;&#32;&#32;indented'));
  assert.ok(text.includes('&lt;script&gt;'));
  assert.ok(text.includes('https&#58;//example\\.com'));
  assert.ok(text.includes('fictional&#64;example\\.com'));
  assert.ok(!text.includes('&\\#'));
  assert.equal(markdownText('&amp;'), '&amp;amp;');
  assert.equal(markdownLink('entity query', 'https://example.com/?x=&copy;'), '[entity query](<https://example.com/?x=&amp;copy;>)');
});

test('only explicit valid HTTP(S) destinations become links, preserving unsafe source as readable text', () => {
  for (const value of ['javascript:alert(1)', 'data:text/html,x', 'mailto:fictional@example.com', '//example.com', 'https://user:pass@example.com', 'https://example.com/a\nb', 'https://', 'https://example.com/a b']) {
    assert.equal(markdownLink(value, value), markdownText(value));
  }
  assert.equal(markdownLink('A [label]', 'https://example.com/a(b)?x=1&y=2'), '[A \\[label\\]](<https://example.com/a%28b%29?x=1&amp;y=2>)');
});

test('limited Markdown exports exactly the supported grammar, escaping unsupported syntax and nested markup', () => {
  const source = '# literal\n===\n**bold** *italic* `a\\`b` [label](https://example.com/a?x=1&y=2)\n\n3. third\n  - child\n9. fourth\n\n![image](https://example.com/x)\n[x](javascript:alert(1))\n[ref]: https://example.com\n~~strike~~\n**outer *inner* [x](https://example.com)**';
  const text = exportLimitedMarkdown(source);
  assert.ok(text.startsWith('\\# literal  \n\\=\\=\\='));
  assert.ok(text.includes('**bold** *italic* `` a\\`b `` [label](<https://example.com/a?x=1&amp;y=2>)'));
  assert.ok(text.includes('3. third\n   - child\n4. fourth'));
  assert.ok(text.includes('\\!\\[image\\]'));
  assert.ok(text.includes('\\[x\\]\\(javascript&#58;alert\\(1\\)\\)'));
  assert.ok(text.includes('**outer \\*inner\\* \\[x\\]\\(https&#58;//example\\.com\\)**'));
  assert.equal(renderLimitedMarkdown('one\ntwo'), '<p>one<br>two</p>');
});
