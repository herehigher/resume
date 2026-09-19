import assert from 'node:assert/strict';
import test from 'node:test';

import { createProfilePhotoDataUrl, isAcceptedProfilePhoto } from '../site/assets/js/utils/profile-photo.js';

function createPhotoProcessor({ alpha }) {
  const calls = { drawImage: [], encoded: [], revoked: [] };
  class FakeImage {
    constructor() {
      this.width = 800;
      this.height = 600;
    }

    set src(value) {
      this.source = value;
      queueMicrotask(() => this.onload());
    }
  }
  const context = {
    drawImage(...args) {
      calls.drawImage.push(args);
    },
    getImageData() {
      return { data: Uint8ClampedArray.from([0, 0, 0, alpha]) };
    }
  };
  const canvas = {
    getContext: () => context,
    toDataURL(type, quality) {
      calls.encoded.push({ quality, type });
      return `data:${type};base64,fixture`;
    }
  };
  return {
    calls,
    dependencies: {
      ImageConstructor: FakeImage,
      createCanvas: () => canvas,
      createObjectURL: () => 'blob:fictional-photo',
      revokeObjectURL: (url) => calls.revoked.push(url)
    }
  };
}

test('profile photo processing preserves alpha as PNG after its centered crop', async () => {
  const processor = createPhotoProcessor({ alpha: 0 });
  const result = await createProfilePhotoDataUrl({ type: 'image/png' }, processor.dependencies);

  assert.equal(result, 'data:image/png;base64,fixture');
  assert.deepEqual(processor.calls.encoded, [{ type: 'image/png', quality: undefined }]);
  assert.deepEqual(processor.calls.drawImage[0].slice(1), [160, 0, 480, 600, 0, 0, 480, 600]);
  assert.deepEqual(processor.calls.revoked, ['blob:fictional-photo']);
});

test('profile photo processing keeps fully opaque images as JPEG at the existing quality', async () => {
  const processor = createPhotoProcessor({ alpha: 255 });
  const result = await createProfilePhotoDataUrl({ type: 'image/jpeg' }, processor.dependencies);

  assert.equal(result, 'data:image/jpeg;base64,fixture');
  assert.deepEqual(processor.calls.encoded, [{ type: 'image/jpeg', quality: .84 }]);
  assert.deepEqual(processor.calls.revoked, ['blob:fictional-photo']);
});

test('only supported photo formats enter the browser-only processing path', async () => {
  assert.equal(isAcceptedProfilePhoto({ type: 'image/png' }), true);
  assert.equal(isAcceptedProfilePhoto({ type: 'image/gif' }), false);
  assert.equal(await createProfilePhotoDataUrl({ type: 'image/gif' }), '');
});
