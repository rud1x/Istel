import test from 'node:test';
import assert from 'node:assert';
import {
  RESPONSE_PREFIX, encodeRequest, encodeCall, parseResponseLine, splitLines, nextRestartDelay,
} from './psProtocol.mjs';

const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');

test('encodeRequest produces one tab-separated line with base64 payload', () => {
  const line = encodeRequest(7, 'def', 'media', 'function A {\n\t"x"\n}');
  assert.ok(line.endsWith('\n'));
  const parts = line.slice(0, -1).split('\t');
  assert.deepStrictEqual(parts.slice(0, 3), ['7', 'def', 'media']);
  assert.strictEqual(Buffer.from(parts[3], 'base64').toString('utf8'), 'function A {\n\t"x"\n}');
  assert.strictEqual(line.split('\n').length, 2, 'payload newlines must not leak into framing');
});

test('encodeRequest strips framing characters from the name', () => {
  const parts = encodeRequest(1, 'call', 'a\tb\nc', '').slice(0, -1).split('\t');
  assert.strictEqual(parts.length, 4);
  assert.strictEqual(parts[2], 'a b c');
});

test('encodeCall serializes args as a JSON array', () => {
  const parts = encodeCall(3, 'IslandMediaSeek', [12.5]).slice(0, -1).split('\t');
  assert.strictEqual(parts[1], 'call');
  assert.deepStrictEqual(JSON.parse(Buffer.from(parts[3], 'base64').toString('utf8')), [12.5]);
  const single = encodeCall(4, 'F', true).slice(0, -1).split('\t');
  assert.deepStrictEqual(JSON.parse(Buffer.from(single[3], 'base64').toString('utf8')), [true]);
});

test('parseResponseLine decodes ok and error responses, including unicode', () => {
  assert.deepStrictEqual(parseResponseLine(`${RESPONSE_PREFIX}5\t1\t${b64('Привет\nмир')}`), { id: 5, ok: true, out: 'Привет\nмир' });
  assert.deepStrictEqual(parseResponseLine(`${RESPONSE_PREFIX}6\t0\t${b64('boom')}\r`), { id: 6, ok: false, out: 'boom' });
  assert.deepStrictEqual(parseResponseLine(`${RESPONSE_PREFIX}8\t1\t`), { id: 8, ok: true, out: '' });
});

test('parseResponseLine ignores stray host output', () => {
  assert.strictEqual(parseResponseLine('WARNING: something'), null);
  assert.strictEqual(parseResponseLine(''), null);
  assert.strictEqual(parseResponseLine(`${RESPONSE_PREFIX}x\t1\t`), null);
  assert.strictEqual(parseResponseLine(`${RESPONSE_PREFIX}1`), null);
  assert.strictEqual(parseResponseLine(undefined), null);
});

test('splitLines keeps the incomplete tail for the next chunk', () => {
  assert.deepStrictEqual(splitLines('a\nb\nc'), { lines: ['a', 'b'], rest: 'c' });
  assert.deepStrictEqual(splitLines('a\n'), { lines: ['a'], rest: '' });
  assert.deepStrictEqual(splitLines('partial'), { lines: [], rest: 'partial' });
});

test('nextRestartDelay backs off for crash loops and resets after a healthy run', () => {
  assert.strictEqual(nextRestartDelay(0, 500), 1000);
  assert.strictEqual(nextRestartDelay(1000, 500), 2000);
  assert.strictEqual(nextRestartDelay(16000, 500), 30000);
  assert.strictEqual(nextRestartDelay(30000, 500), 30000);
  assert.strictEqual(nextRestartDelay(8000, 60000), 0);
});
