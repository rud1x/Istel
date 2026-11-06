// Pure clipboard fingerprinting helpers. The B8 fix replaces the
// per-poll full-buffer MD5 with cheap size+dimension sampling that only
// hashes when the cheap signature actually changes.

/**
 * Cheap signature for an Electron NativeImage.
 * @param {{toBitmap?:function,getSize:function,isEmpty?:function}} img
 * @returns {string|null}
 */
export function cheapImageSignature(img) {
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

/**
 * Decide whether an image changed, given a cheap signature and a cached
 * previous signature. When the cheap signature matches, we assume no
 * change (the whole point of the cheap path — no full hash every poll).
 *
 * @param {string|null} cheap
 * @param {string|null} prevCheap
 * @returns {boolean}
 */
export function imageChanged(cheap, prevCheap) {
  if (cheap == null) return false;
  return cheap !== prevCheap;
}
