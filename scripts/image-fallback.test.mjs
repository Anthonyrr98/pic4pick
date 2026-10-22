import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceImageFallback } from '../src/utils/imageFallback.js';

test('a failed responsive image advances once, clears srcset and stops when candidates are exhausted', () => {
  const image = { dataset: {}, currentSrc: 'bad.webp', src: 'bad.webp', srcset: 'bad.webp 900w', sizes: '50vw' };
  const candidates = ['bad.webp', 'fallback.jpg', 'original.jpg'];
  assert.equal(advanceImageFallback(image, candidates), true);
  assert.equal(image.src, 'fallback.jpg');
  assert.equal(image.srcset, '');
  assert.equal(image.sizes, '');
  image.currentSrc = image.src;
  assert.equal(advanceImageFallback(image, candidates), true);
  assert.equal(image.src, 'original.jpg');
  image.currentSrc = image.src;
  assert.equal(advanceImageFallback(image, candidates), false);
  assert.equal(image.src, 'original.jpg');
});

test('empty fallback candidates leave the image and caller-owned error state untouched', () => {
  const image = { dataset: {}, currentSrc: '', src: 'failed.jpg', srcset: 'failed.jpg 900w', sizes: '50vw' };
  assert.equal(advanceImageFallback(image, []), false);
  assert.equal(image.srcset, 'failed.jpg 900w');
});
