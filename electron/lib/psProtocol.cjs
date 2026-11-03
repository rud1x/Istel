'use strict';
// CommonJS mirror of ./psProtocol.mjs (kept in sync; tested via the .mjs
// version). Electron main is CommonJS.

const RESPONSE_PREFIX = '@@R\t';

function encodeRequest(id, kind, name, payload) {
  const safeName = String(name || '').replace(/[\t\r\n]/g, ' ');
  const b64 = Buffer.from(String(payload ?? ''), 'utf8').toString('base64');
  return `${id}\t${kind}\t${safeName}\t${b64}\n`;
}

function encodeCall(id, fn, args = []) {
  return encodeRequest(id, 'call', fn, JSON.stringify(Array.isArray(args) ? args : [args]));
}

function parseResponseLine(line) {
  if (typeof line !== 'string') return null;
  const clean = line.replace(/\r$/, '');
  if (!clean.startsWith(RESPONSE_PREFIX)) return null;
  const parts = clean.slice(RESPONSE_PREFIX.length).split('\t');
  if (parts.length < 3) return null;
  const id = Number.parseInt(parts[0], 10);
  if (!Number.isFinite(id)) return null;
  let out = '';
  try {
    out = Buffer.from(parts[2] || '', 'base64').toString('utf8');
  } catch {
    return null;
  }
  return { id, ok: parts[1] === '1', out };
}

function splitLines(buffer) {
  const parts = String(buffer).split('\n');
  const rest = parts.pop();
  return { lines: parts, rest };
}

function nextRestartDelay(prevDelayMs, livedMs) {
  if (livedMs >= 30000) return 0;
  if (!prevDelayMs) return 1000;
  return Math.min(30000, prevDelayMs * 2);
}

module.exports = { RESPONSE_PREFIX, encodeRequest, encodeCall, parseResponseLine, splitLines, nextRestartDelay };
