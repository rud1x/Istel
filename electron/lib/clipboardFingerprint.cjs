'use strict';
// CommonJS mirror of ./clipboardFingerprint.mjs (kept in sync; tested via the
// .mjs version). Electron main is CommonJS.

function cheapImageSignature(img) {
  if (!img || (img.isEmpty && img.isEmpty())) return null;
  try {
    const size = img.getSize();
    const bitmap = img.toBitmap ? img.toBitmap() : null;
    const len = bitmap ? bitmap.length : 0;
    return `${len}:${size.width}x${size.height}`;
  } catch {
    return null;
  }
}

function imageChanged(cheap, prevCheap) {
  if (cheap == null) return false;
  return cheap !== prevCheap;
}

module.exports = { cheapImageSignature, imageChanged };
