import test from 'node:test';
import assert from 'node:assert';
import { compareVersions } from './versionCompare.mjs';

test('equal versions compare to 0', () => {
  assert.strictEqual(compareVersions('1.0.1', '1.0.1'), 0);
});

test('strips a leading v', () => {
  assert.strictEqual(compareVersions('v1.0.1', '1.0.1'), 0);
  assert.strictEqual(compareVersions('v1.0.2', '1.0.1'), 1);
});

test('higher patch wins', () => {
  assert.strictEqual(compareVersions('1.0.1', '1.0.0'), 1);
  assert.strictEqual(compareVersions('1.0.0', '1.0.1'), -1);
});

test('higher minor wins over patch', () => {
  assert.strictEqual(compareVersions('1.2.0', '1.1.9'), 1);
});

test('higher major wins', () => {
  assert.strictEqual(compareVersions('2.0.0', '1.9.9'), 1);
});

test('missing segments default to 0', () => {
  assert.strictEqual(compareVersions('1.1', '1.1.0'), 0);
  assert.strictEqual(compareVersions('1.1.1', '1.1'), 1);
});
