import assert from 'node:assert/strict';
import test from 'node:test';

import { createEmbeddedPhotoUrl } from '../site/assets/js/utils/embedded-photo-url.js';

const FIRST_PHOTO = 'data:image/png;base64,iVBORw0KGgo=';
const SECOND_PHOTO = 'data:image/jpeg;base64,/9j/2Q==';

test('embedded photo URLs are reused and revoked when the source changes or clears', () => {
  const created = [];
  const revoked = [];
  const photoUrl = createEmbeddedPhotoUrl({
    createObjectURL(blob) {
      created.push(blob);
      return `blob:https://example.test/${created.length}`;
    },
    revokeObjectURL(url) {
      revoked.push(url);
    }
  });

  assert.equal(photoUrl.resolve(FIRST_PHOTO), 'blob:https://example.test/1');
  assert.equal(photoUrl.resolve(FIRST_PHOTO), 'blob:https://example.test/1');
  assert.equal(created.length, 1);
  assert.equal(created[0].type, 'image/png');
  assert.deepEqual(revoked, []);

  assert.equal(photoUrl.resolve(SECOND_PHOTO), 'blob:https://example.test/2');
  assert.deepEqual(revoked, ['blob:https://example.test/1']);
  assert.equal(created[1].type, 'image/jpeg');

  assert.equal(photoUrl.resolve(''), '');
  assert.deepEqual(revoked, [
    'blob:https://example.test/1',
    'blob:https://example.test/2'
  ]);
  assert.equal(photoUrl.resolve(''), '');
  assert.equal(revoked.length, 2);
});

test('invalid embedded photo data fails closed without retaining an old object URL', () => {
  const revoked = [];
  const photoUrl = createEmbeddedPhotoUrl({
    createObjectURL: () => 'blob:https://example.test/photo',
    revokeObjectURL: (url) => revoked.push(url)
  });

  assert.equal(photoUrl.resolve(FIRST_PHOTO), 'blob:https://example.test/photo');
  assert.equal(photoUrl.resolve('data:image/png;base64,%%%'), '');
  assert.deepEqual(revoked, ['blob:https://example.test/photo']);
});
