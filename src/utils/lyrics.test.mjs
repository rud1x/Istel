import test from 'node:test';
import assert from 'node:assert';
import { findActiveLineIndex, formatClockTime, formatClock, parseLrc } from './lyrics.mjs';

test('findActiveLineIndex returns -1 for empty', () => {
  assert.strictEqual(findActiveLineIndex([], 5), -1);
  assert.strictEqual(findActiveLineIndex(null, 5), -1);
});

test('findActiveLineIndex finds the active line', () => {
  const lines = [
    { start_ms: 0, end_ms: 1000 },
    { start_ms: 1000, end_ms: 2000 },
    { start_ms: 2000, end_ms: 3000 },
  ];
  assert.strictEqual(findActiveLineIndex(lines, 0.5), 0);
  assert.strictEqual(findActiveLineIndex(lines, 1.5), 1);
  assert.strictEqual(findActiveLineIndex(lines, 2.9), 2);
});

test('findActiveLineIndex holds the last sung line in a gap', () => {
  const lines = [
    { start_ms: 0, end_ms: 1000 },
    { start_ms: 3000, end_ms: 4000 },
  ];
  assert.strictEqual(findActiveLineIndex(lines, 2), 0);
});

test('findActiveLineIndex before first line returns -1', () => {
  const lines = [{ start_ms: 5000, end_ms: 6000 }];
  assert.strictEqual(findActiveLineIndex(lines, 1), -1);
});

test('formatClockTime', () => {
  assert.strictEqual(formatClockTime(0), '0:00');
  assert.strictEqual(formatClockTime(65), '1:05');
  assert.strictEqual(formatClockTime(599), '9:59');
  assert.strictEqual(formatClockTime(-1), '0:00');
});

test('parseLrc parses timed lines and fills end_ms', () => {
  const lines = parseLrc('[00:08.63] Hello\n[00:09.99] World');
  assert.ok(Array.isArray(lines));
  assert.strictEqual(lines.length, 2);
  assert.strictEqual(lines[0].text, 'Hello');
  assert.strictEqual(lines[0].start_ms, 8630);
  assert.strictEqual(lines[0].end_ms, 9990);
  assert.strictEqual(lines[1].start_ms, 9990);
  assert.ok(lines[1].end_ms > lines[1].start_ms);
});

test('parseLrc ignores lines without tags', () => {
  const lines = parseLrc('no tag here\n[00:01.00] Yes');
  assert.strictEqual(lines.length, 1);
  assert.strictEqual(lines[0].text, 'Yes');
});

test('parseLrc returns null for empty/invalid', () => {
  assert.strictEqual(parseLrc(''), null);
  assert.strictEqual(parseLrc(null), null);
  assert.strictEqual(parseLrc('no tags at all'), null);
});

test('formatClock pads hours and minutes', () => {
  const d = new Date(2026, 0, 1, 9, 5);
  assert.strictEqual(formatClock(d), '09:05');
});
