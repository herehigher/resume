import test from 'node:test';
import assert from 'node:assert/strict';
import { japanesePdfViolations } from './helpers/japanese-pdf.js';

const item = (str, y = 100, x = 50, width = 20) => ({ str, transform: [1, 0, 0, 10, x, y], height: 10, width });
const page = (...items) => ({ items, size: { width: 595, height: 842 } });
const bodyPage = page(item('FIRST'));
const lastPage = page(item('LAST'), item('以上', 80, 525));
const expectedLines = ['FIRST', 'LAST'];

test('Japanese PDF checker rejects an inserted blank or duplicated body page', () => {
  assert.deepEqual(japanesePdfViolations([bodyPage, lastPage], { expectedLines }), []);
  assert.match(japanesePdfViolations([bodyPage, page(), lastPage], { expectedLines }).join('\n'), /Page 2 is empty/);
  assert.match(japanesePdfViolations([bodyPage, bodyPage, lastPage], { expectedLines }).join('\n'), /expected 1 occurrences, got 2/);
  assert.match(japanesePdfViolations([lastPage], { expectedLines: ['FIRST'] }).join('\n'), /expected 1 occurrences, got 0/);
});

test('Japanese PDF checker permits intentional identical pages and repeated input', () => {
  assert.deepEqual(japanesePdfViolations([bodyPage, bodyPage, lastPage], {
    expectedLines: ['FIRST', 'FIRST', 'LAST']
  }), []);
});

test('Japanese PDF checker allows recurring headings with an explicit input inventory', () => {
  const first = page(item('HEADING', 300), item('FIRST'));
  const last = page(item('HEADING', 300), item('LAST'), item('以上', 80, 525));
  assert.deepEqual(japanesePdfViolations([first, last], { expectedLines: ['FIRST', 'LAST'] }), []);
  assert.match(japanesePdfViolations([first, first, last], { expectedLines: ['FIRST', 'LAST'] }).join('\n'), /expected 1 occurrences, got 2/);
});

test('Japanese PDF checker aggregates geometry failures without per-character assertions', () => {
  const invalid = page(item('FIRST', 20), item('LAST', 40), item('以上', 40, 100));
  const errors = japanesePdfViolations([invalid], { expectedLines });
  assert.equal(errors.length, 3);
  assert.match(errors.join('\n'), /vertical bounds/);
  assert.match(errors.join('\n'), /next body line/);
  assert.match(errors.join('\n'), /right aligned/);
});
