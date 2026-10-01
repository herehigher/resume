import assert from 'node:assert/strict';
import test from 'node:test';
import { createListFoldState } from '../site/assets/js/ui/list-fold-state.js';

function values(folds, length) { return Array.from({ length }, (_, index) => folds.get(index)); }

test('anonymous folds follow positions through moves, insertion and removal, including identical text', () => {
  const folds = createListFoldState();
  folds.sync([null, null, null]); folds.set(1, true);
  folds.move(1, 2);
  folds.sync([null, null, null]);
  assert.deepEqual(values(folds, 3), [false, false, true]);
  folds.sync([null, null, null, null], { type: 'insert', index: 1 });
  assert.deepEqual(values(folds, 4), [false, false, false, true]);
  folds.sync([null, null, null], { type: 'remove', index: 0 });
  assert.deepEqual(values(folds, 3), [false, false, true]);
  folds.sync([null, null], { type: 'remove', index: 2 });
  assert.deepEqual(values(folds, 2), [false, false]);
});

test('ID folds preserve existing records on reorder/add/delete and expand new companies', () => {
  const folds = createListFoldState();
  folds.sync(['record_fictional-a', 'record_fictional-b']); folds.set(0, true);
  folds.sync(['record_fictional-b', 'record_fictional-c', 'record_fictional-a']);
  assert.deepEqual(values(folds, 3), [false, false, true]);
  folds.sync(['record_fictional-c', 'record_fictional-a']);
  assert.deepEqual(values(folds, 2), [false, true]);
  assert.throws(() => folds.sync(['same', 'same']), TypeError);
});

test('unknown structural changes and replacement reset anonymous identity rather than matching contents', () => {
  const folds = createListFoldState();
  folds.sync([null, null]); folds.setAll(true);
  folds.sync([null, null, null]);
  assert.deepEqual(values(folds, 3), [false, false, false]);
  folds.setAll(true); folds.sync([null, null, null], { type: 'unknown' });
  assert.deepEqual(values(folds, 3), [false, false, false]);
  folds.setAll(true); folds.reset(); folds.sync([null, null, null]);
  assert.deepEqual(values(folds, 3), [false, false, false]);
});

test('invalid/boundary moves leave temporary state unchanged and ID and anonymous modes stay separate', () => {
  const folds = createListFoldState();
  folds.sync([null, null]); folds.set(0, true);
  for (const [from, to] of [[0, 0], [-1, 1], [0, 2], [0.5, 1], [0, '1']]) {
    assert.equal(folds.move(from, to), false);
    assert.deepEqual(values(folds, 2), [true, false]);
  }
  folds.sync(['record_fictional-a', 'record_fictional-b']);
  assert.deepEqual(values(folds, 2), [false, false]);
  folds.setAll(true); folds.sync([null, null]);
  assert.deepEqual(values(folds, 2), [false, false]);
});


test('date-sort permutations retain anonymous folds and reject incomplete or duplicate positions', () => {
  const folds = createListFoldState();
  folds.sync([null, null, null]); folds.set(0, true);
  folds.reorder([2, 0, 1]);
  assert.deepEqual(values(folds, 3), [false, true, false]);
  for (const permutation of [[1, 0], [0, 0, 1], [0, 1, 3], [0, 1, '2']]) {
    assert.throws(() => folds.reorder(permutation), TypeError);
    assert.deepEqual(values(folds, 3), [false, true, false]);
  }
});
