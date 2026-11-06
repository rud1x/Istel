import test from 'node:test';
import assert from 'node:assert';
import { decideActivityPush, artworkKey, shouldPrimeArtwork } from './discordSync.mjs';

// ---- B4: lastSyncAt must advance when we push, not only on key change ----

test('decideActivityPush pushes on a new track', () => {
  const r = decideActivityPush({ key: 'a|b|Playing', lastKey: 'x|y|Playing', lastSyncAt: 0, now: 1000, isPlaying: true });
  assert.strictEqual(r.push, true);
  assert.strictEqual(r.nextSyncAt, 1000);
});

test('decideActivityPush skips an unchanged track inside the resync window', () => {
  const r = decideActivityPush({ key: 'a|b|Playing', lastKey: 'a|b|Playing', lastSyncAt: 1000, now: 5000, isPlaying: true, resyncMs: 10000 });
  assert.strictEqual(r.push, false);
  assert.strictEqual(r.nextSyncAt, 1000, 'nextSyncAt must stay unchanged');
});

test('decideActivityPush re-syncs an unchanged playing track after the window', () => {
  const r = decideActivityPush({ key: 'a|b|Playing', lastKey: 'a|b|Playing', lastSyncAt: 1000, now: 12000, isPlaying: true, resyncMs: 10000 });
  assert.strictEqual(r.push, true);
  assert.strictEqual(r.nextSyncAt, 12000, 'nextSyncAt must advance on push');
});

test('decideActivityPush does not re-sync a paused track', () => {
  const r = decideActivityPush({ key: 'a|b|Paused', lastKey: 'a|b|Paused', lastSyncAt: 1000, now: 60000, isPlaying: false, resyncMs: 10000 });
  assert.strictEqual(r.push, false);
});

// ---- B5: artwork key is stable and independent of activity key ----

test('artworkKey is stable for the same track', () => {
  assert.strictEqual(artworkKey('Song', 'Artist'), artworkKey('Song', 'Artist'));
});

test('artworkKey differs across tracks', () => {
  assert.notStrictEqual(artworkKey('A', 'B'), artworkKey('A', 'C'));
  assert.notStrictEqual(artworkKey('A', 'B'), artworkKey('C', 'B'));
});

test('artworkKey tolerates null title/artist', () => {
  assert.strictEqual(artworkKey(null, undefined), '|');
});

// ---- artwork priming: cover should upload immediately on track change ----

test('shouldPrimeArtwork primes a fresh base64 artwork', () => {
  assert.strictEqual(shouldPrimeArtwork({ artwork: 'A'.repeat(500), cached: false, uploading: false }), true);
});

test('shouldPrimeArtwork skips when a valid URL is cached', () => {
  assert.strictEqual(shouldPrimeArtwork({ artwork: 'A'.repeat(500), cached: true, uploading: false }), false);
});

test('shouldPrimeArtwork skips when an upload is already in flight', () => {
  assert.strictEqual(shouldPrimeArtwork({ artwork: 'A'.repeat(500), cached: false, uploading: true }), false);
});

test('shouldPrimeArtwork never primes the __same__ sentinel', () => {
  assert.strictEqual(shouldPrimeArtwork({ artwork: '__same__', cached: false, uploading: false }), false);
});

test('shouldPrimeArtwork ignores missing/short artwork', () => {
  assert.strictEqual(shouldPrimeArtwork({ artwork: null, cached: false, uploading: false }), false);
  assert.strictEqual(shouldPrimeArtwork({ artwork: 'tiny', cached: false, uploading: false }), false);
});
