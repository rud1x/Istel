import test from 'node:test';
import assert from 'node:assert';
import { splitLyricIntoPages, pageForProgress } from './lyricWindow.mjs';

test('short line stays one page', () => {
  assert.deepStrictEqual(splitLyricIntoPages('hello world', 40), ['hello world']);
});

test('long line splits into pages that fit the budget', () => {
  const text = 'one two three four five six seven eight nine ten';
  const pages = splitLyricIntoPages(text, 20);
  assert.ok(pages.length > 1);
  for (const p of pages) assert.ok(p.length <= 20, `page too long: ${p}`);
  assert.strictEqual(pages.join(' '), text);
});

test('over-long single word is kept whole', () => {
  const pages = splitLyricIntoPages('abcdefghijklmnopqrstuvwxyz', 10);
  assert.deepStrictEqual(pages, ['abcdefghijklmnopqrstuvwxyz']);
});

test('empty text returns a single empty page', () => {
  assert.deepStrictEqual(splitLyricIntoPages('', 20), ['']);
});

test('single page has no ellipses', () => {
  const r = pageForProgress(['hello'], 0.5);
  assert.strictEqual(r.pageIndex, 0);
  assert.strictEqual(r.leftEllipsis, false);
  assert.strictEqual(r.rightEllipsis, false);
});

test('early progress shows the first page, clipped on the right only', () => {
  const pages = ['aaaaaaaaaa', 'bbbbbbbbbb', 'cccccccccc'];
  const r = pageForProgress(pages, 0.05);
  assert.strictEqual(r.pageIndex, 0);
  assert.strictEqual(r.leftEllipsis, false);
  assert.strictEqual(r.rightEllipsis, true);
});

test('late progress shows the last page, clipped on the left only', () => {
  const pages = ['aaaaaaaaaa', 'bbbbbbbbbb', 'cccccccccc'];
  const r = pageForProgress(pages, 0.99);
  assert.strictEqual(r.pageIndex, 2);
  assert.strictEqual(r.leftEllipsis, true);
  assert.strictEqual(r.rightEllipsis, false);
});

test('middle progress shows a middle page, clipped on both sides', () => {
  const pages = ['aaaaaaaaaa', 'bbbbbbbbbb', 'cccccccccc'];
  const r = pageForProgress(pages, 0.5);
  assert.strictEqual(r.pageIndex, 1);
  assert.strictEqual(r.leftEllipsis, true);
  assert.strictEqual(r.rightEllipsis, true);
});

test('page switch is stable inside one page (no sliding)', () => {
  const pages = ['aaaaaaaaaa', 'bbbbbbbbbb'];
  // Any progress strictly inside the first page must stay on page 0.
  assert.strictEqual(pageForProgress(pages, 0.1).pageIndex, 0);
  assert.strictEqual(pageForProgress(pages, 0.4).pageIndex, 0);
  assert.strictEqual(pageForProgress(pages, 0.49).pageIndex, 0);
});

test('progress is clamped to [0, 1)', () => {
  const pages = ['aaaa', 'bbbb'];
  assert.strictEqual(pageForProgress(pages, -5).pageIndex, 0);
  assert.strictEqual(pageForProgress(pages, 99).pageIndex, 1);
});
