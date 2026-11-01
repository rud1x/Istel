import test from 'node:test';
import assert from 'node:assert';
import { mergeConfig, parseConfigText, tempConfigPath, corruptBackupPath } from './configIO.mjs';

test('mergeConfig overlays user values over defaults', () => {
  const out = mergeConfig({ a: 1, b: 2 }, { b: 20, c: 30 });
  assert.deepStrictEqual(out, { a: 1, b: 20, c: 30 });
});

test('mergeConfig returns defaults copy when user json is null', () => {
  const defaults = { a: 1 };
  const out = mergeConfig(defaults, null);
  assert.deepStrictEqual(out, { a: 1 });
  assert.notStrictEqual(out, defaults, 'must not mutate/return the same object');
});

test('parseConfigText detects valid JSON', () => {
  const r = parseConfigText('{"x":1}');
  assert.strictEqual(r.corrupt, false);
  assert.deepStrictEqual(r.parsed, { x: 1 });
});

test('parseConfigText flags invalid JSON as corrupt', () => {
  const r = parseConfigText('{not json');
  assert.strictEqual(r.corrupt, true);
  assert.strictEqual(r.parsed, null);
});

test('parseConfigText flags non-object JSON as corrupt', () => {
  assert.strictEqual(parseConfigText('[]').corrupt, true);
  assert.strictEqual(parseConfigText('42').corrupt, true);
  assert.strictEqual(parseConfigText('null').corrupt, true);
});

test('parseConfigText treats empty text as not corrupt and empty', () => {
  const r = parseConfigText('   ');
  assert.strictEqual(r.corrupt, false);
  assert.strictEqual(r.parsed, null);
});

test('tempConfigPath appends .tmp', () => {
  assert.strictEqual(tempConfigPath('/x/config.json'), '/x/config.json.tmp');
});

test('corruptBackupPath includes timestamp and .bak', () => {
  const p = corruptBackupPath('/x/config.json', 1234567890);
  assert.strictEqual(p, '/x/config.json.corrupt.1234567890.bak');
});
