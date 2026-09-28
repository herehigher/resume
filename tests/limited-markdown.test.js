import test from 'node:test';
import assert from 'node:assert/strict';

import { renderLimitedMarkdown } from '../site/assets/js/utils/limited-markdown.js';

test('limited Markdown renders paragraphs, soft breaks, and normalized CRLF without changing the source', () => {
  const source = '第一行\r\n第二行\r\n\r\n\r\n新しい段落';
  const html = renderLimitedMarkdown(source);

  assert.equal(html, '<p>第一行<br>第二行</p><p>新しい段落</p>');
  assert.equal(source, '第一行\r\n第二行\r\n\r\n\r\n新しい段落');
});

test('unordered markers mix and ordered lists preserve their first number', () => {
  assert.equal(
    renderLimitedMarkdown('- 一つ\n* 二つ\n+ 三つ'),
    '<ul><li>一つ</li><li>二つ</li><li>三つ</li></ul>'
  );
  assert.equal(
    renderLimitedMarkdown('3. 三番\n9. 次の項目'),
    '<ol start="3"><li>三番</li><li>次の項目</li></ol>'
  );
  assert.equal(
    renderLimitedMarkdown('1. 最初\n- 箇条書き\n2. 新しい番号付き'),
    '<ol><li>最初</li></ol><ul><li>箇条書き</li></ul><ol start="2"><li>新しい番号付き</li></ol>'
  );
});

test('list indentation supports only the first two levels and promotes a parentless child', () => {
  assert.equal(
    renderLimitedMarkdown('- 親\n  - 子\n    1. さらに深い字下げ\n        * さらに深い字下げ'),
    '<ul><li>親<ul><li>子</li></ul><ol><li>さらに深い字下げ</li></ol><ul><li>さらに深い字下げ</li></ul></li></ul>'
  );
  assert.equal(renderLimitedMarkdown('  2. 親なし'), '<ol start="2"><li>親なし</li></ol>');
  assert.equal(renderLimitedMarkdown(' - 一つ\n   - 三つ\n\t- tab\n+81-12'), '<p> - 一つ<br>   - 三つ<br>\t- tab<br>+81-12</p>');
  assert.equal(renderLimitedMarkdown('***\n---\n+++\n・日本語の項目'), '<p>***<br>---<br>+++<br>・日本語の項目</p>');
});

test('inline emphasis, code, and safe links render without nesting their contents', () => {
  const html = renderLimitedMarkdown('前**太字**後 *斜体* `JavaScript` [表示名](https://example.com/a?b=1&c=2)');

  assert.equal(
    html,
    '<p>前<strong>太字</strong>後 <em>斜体</em> <code>JavaScript</code> <a href="https://example.com/a?b=1&amp;c=2" target="_blank" rel="noopener noreferrer">表示名</a></p>'
  );
  assert.equal(
    renderLimitedMarkdown('**outer *inner* `code` [label](https://example.com)**'),
    '<p><strong>outer *inner* `code` [label](https://example.com)</strong></p>'
  );
});

test('escapes decode only the documented characters and malformed delimiters stay visible', () => {
  assert.equal(
    renderLimitedMarkdown('\\- list にしない\n\\**太字にしない**\n\\[link にしない](https://example.com)\n\\x'),
    '<p>- list にしない<br>**太字にしない**<br>[link にしない](https://example.com)<br>\\x</p>'
  );
  assert.equal(renderLimitedMarkdown('**未閉じ *未閉じ `未閉じ'), '<p>**未閉じ *未閉じ `未閉じ</p>');
  assert.equal(renderLimitedMarkdown('** 前後に空白 ** * 前後に空白 *'), '<p>** 前後に空白 ** * 前後に空白 *</p>');
  assert.equal(renderLimitedMarkdown('`  ` ``code`` ```fence```'), '<p><code>  </code> ``code`` ```fence```</p>');
});

test('malformed and disallowed links remain plain text', () => {
  const sources = [
    '[relative](example.com)',
    '[protocol relative](//example.com/path)',
    '[javascript](javascript:alert(1))',
    '[data](data:text/html,hello)',
    '[mailto](mailto:test@example.com)',
    '[credentials](https://user:pass@example.com/path)',
    '[space](https://example.com/a b)',
    '[parenthesis](https://example.com/a(b))',
    '[missing close](https://example.com',
    '[missing URL]()',
    '[**unsafe label**](javascript:alert(1))'
  ];

  for (const source of sources) {
    const html = renderLimitedMarkdown(source);
    assert.doesNotMatch(html, /<a\b|<strong>/, source);
    assert.ok(html.includes(source.replaceAll('&', '&amp;')), source);
  }
});

test('raw HTML, images, and unsupported block syntax are downgraded safely', () => {
  const html = renderLimitedMarkdown([
    '<script>alert(1)</script>',
    '![portrait](https://example.com/image.png)',
    '# **見出し**',
    '> *引用記法は通常文*',
    '| 表 | column |',
    '---',
    '```html',
    '<svg onload=alert(1)></svg>',
    '```',
    '- [ ] 未対応タスクリスト'
  ].join('\n'));

  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /!\[portrait\]\(https:\/\/example\.com\/image\.png\)/);
  assert.match(html, /# <strong>見出し<\/strong>/);
  assert.match(html, /&gt; <em>引用記法は通常文<\/em>/);
  assert.match(html, /&lt;svg onload=alert\(1\)&gt;&lt;\/svg&gt;/);
  assert.match(html, /<ul><li>\[ \] 未対応タスクリスト<\/li><\/ul>/);
  assert.doesNotMatch(html, /<script|<img|<svg|<blockquote|<table|<hr|<input|<h1|<a\b/);
});

test('renderer emits only the fixed element and attribute allowlist for long malformed input', () => {
  const html = renderLimitedMarkdown(`${'[*'.repeat(10000)}終わり`);
  const allowedElements = new Set(['p', 'br', 'ul', 'ol', 'li', 'strong', 'em', 'code', 'a']);
  const allowedAttributes = new Set(['href', 'target', 'rel', 'start']);

  for (const [, tag, attributes] of html.matchAll(/<\/?([a-z]+)([^>]*)>/g)) {
    assert.ok(allowedElements.has(tag), tag);
    for (const [, attribute] of attributes.matchAll(/\s([a-z-]+)=/g)) {
      assert.ok(allowedAttributes.has(attribute), attribute);
    }
  }
  assert.ok(html.includes('終わり'));
  assert.doesNotMatch(html, /onclick=|style=|class=|id=|data-/);
});
