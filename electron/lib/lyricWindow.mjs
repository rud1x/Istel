// Lyric pagination helpers.
//
// A lyric line that does not fit in the pill is split into pages by character
// budget. While the line is being sung we show the page that contains the
// currently-sung part: the first page is clipped on the right (…), later pages
// are clipped on the left (…). The page switches only when the sung part moves
// into the next page — the text does NOT slide word by word.

/**
 * Split a line into pages that each fit within `maxChars`.
 * Words are never broken; a single word longer than the budget is kept whole.
 *
 * @param {string} text
 * @param {number} maxChars
 * @returns {string[]} pages (at least one)
 */
export function splitLyricIntoPages(text, maxChars) {
  const src = String(text || '').trim();
  if (!src) return [''];
  const limit = Math.max(8, Number(maxChars) || 40);
  if (src.length <= limit) return [src];

  const words = src.split(/\s+/).filter(Boolean);
  const pages = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= limit) {
      current = candidate;
    } else {
      if (current) pages.push(current);
      // Keep an over-long single word as its own page rather than breaking it.
      current = word;
    }
  }
  if (current) pages.push(current);
  return pages.length ? pages : [src];
}

/**
 * Pick which page to show for a given line progress (0..1).
 * Pages are distributed by their character length so the switch happens when
 * the sung text actually reaches the page boundary.
 *
 * @param {string[]} pages
 * @param {number} progress 0..1 across the whole line
 * @returns {{ pageIndex: number, leftEllipsis: boolean, rightEllipsis: boolean }}
 */
export function pageForProgress(pages, progress) {
  const list = Array.isArray(pages) && pages.length ? pages : [''];
  if (list.length === 1) {
    return { pageIndex: 0, leftEllipsis: false, rightEllipsis: false };
  }
  const total = list.reduce((a, p) => a + p.length, 0) || 1;
  const clamped = Math.max(0, Math.min(0.999999, Number(progress) || 0));
  const target = clamped * total;

  let acc = 0;
  let pageIndex = list.length - 1;
  for (let i = 0; i < list.length; i++) {
    acc += list[i].length;
    if (target < acc) { pageIndex = i; break; }
  }
  return {
    pageIndex,
    leftEllipsis: pageIndex > 0,
    rightEllipsis: pageIndex < list.length - 1,
  };
}
