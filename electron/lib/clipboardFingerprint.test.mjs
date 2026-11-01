import test from 'node:test';
import assert from 'node:assert';
import { cheapImageSignature, imageChanged } from './clipboardFingerprint.mjs';

function fakeImage(width, height, len) {
  return {
    isEmpty: () => false,
    getSize: () => ({ width, height }),
    toBitmap: () => Buffer.alloc(len),
  };
}

test('cheapImageSignature encodes length and dimensions', () => {
  const sig = cheapImageSignature(fakeImage(1920, 1080, 4 * 1920 * 1080));
  assert.strictEqual(sig, `${4 * 1920 * 1080}:1920x1080`);
});

test('cheapImageSignature returns null for empty image', () => {
  assert.strictEqual(cheapImageSignature({ isEmpty: () => true, getSize: () => ({ width: 0, height: 0 }) }), null);
});

test('cheapImageSignature returns null for null image', () => {
  assert.strictEqual(cheapImageSignature(null), null);
});

test('imageChanged reports new image when signature differs', () => {
  assert.strictEqual(imageChanged('100:10x10', '200:20x20'), true);
});

test('imageChanged reports unchanged when signature matches', () => {
  assert.strictEqual(imageChanged('100:10x10', '100:10x10'), false);
});

test('imageChanged never flags an empty image as changed', () => {
  assert.strictEqual(imageChanged(null, 'x'), false);
});
