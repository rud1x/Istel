import test from 'node:test';
import assert from 'node:assert';
import { isPartialDownload, fileSignature, classifyDownloadObservation } from './downloadSnapshot.mjs';

test('isPartialDownload flags in-progress extensions', () => {
  assert.strictEqual(isPartialDownload('file.crdownload'), true);
  assert.strictEqual(isPartialDownload('file.part'), true);
  assert.strictEqual(isPartialDownload('file.tmp'), true);
  assert.strictEqual(isPartialDownload('file.download'), true);
});

test('isPartialDownload accepts finished files', () => {
  assert.strictEqual(isPartialDownload('photo.jpg'), false);
  assert.strictEqual(isPartialDownload('archive.zip'), false);
  assert.strictEqual(isPartialDownload(null), false);
});

test('fileSignature combines size and rounded mtime', () => {
  assert.strictEqual(fileSignature({ size: 100, mtimeMs: 1234.7 }), '100:1235');
});

test('classifyDownloadObservation seeds on the first pass', () => {
  assert.strictEqual(classifyDownloadObservation({ signature: 's', previous: undefined, seeding: true, now: 1000, mtimeMs: 900 }), 'seed');
});

test('classifyDownloadObservation ignores unchanged files', () => {
  assert.strictEqual(classifyDownloadObservation({ signature: 's', previous: 's', seeding: false, now: 1000, mtimeMs: 900 }), 'ignore');
});

test('classifyDownloadObservation announces a fresh changed file', () => {
  assert.strictEqual(classifyDownloadObservation({ signature: 's2', previous: 's1', seeding: false, now: 1000, mtimeMs: 990 }), 'announce');
});

test('classifyDownloadObservation ignores files older than the recency window', () => {
  assert.strictEqual(classifyDownloadObservation({ signature: 's2', previous: 's1', seeding: false, now: 100000, mtimeMs: 1000 }), 'ignore');
});
