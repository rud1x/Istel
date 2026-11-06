// Pure helpers for the persistent PowerShell host (electron/psHost.js).
// One request per line goes to the host's stdin, one response per line comes
// back on stdout. Payloads are base64 so newlines, tabs and non-ASCII text
// never break the line framing.
//
//   request:  <id>\t<kind>\t<name>\t<base64 utf8 payload>\n
//             kind 'def'  -> payload is PowerShell code dot-sourced once
//             kind 'call' -> payload is a JSON array of positional args
//   response: @@R\t<id>\t<1|0>\t<base64 utf8 output>

export const RESPONSE_PREFIX = '@@R\t';

/**
 * @param {number} id
 * @param {'def'|'call'} kind
 * @param {string} name  function name for 'call', label for 'def'
 * @param {string} payload
 * @returns {string} one line, terminated by \n
 */
export function encodeRequest(id, kind, name, payload) {
  const safeName = String(name || '').replace(/[\t\r\n]/g, ' ');
  const b64 = Buffer.from(String(payload ?? ''), 'utf8').toString('base64');
  return `${id}\t${kind}\t${safeName}\t${b64}\n`;
}

/**
 * @param {string} fn
 * @param {Array} args  JSON-serializable positional arguments
 */
export function encodeCall(id, fn, args = []) {
  return encodeRequest(id, 'call', fn, JSON.stringify(Array.isArray(args) ? args : [args]));
}

/**
 * Parse one stdout line. Lines that are not responses (stray host output)
 * return null and must be ignored by the caller.
 * @param {string} line
 * @returns {{id:number, ok:boolean, out:string}|null}
 */
export function parseResponseLine(line) {
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

/**
 * Split a growing stdout buffer into complete lines.
 * @param {string} buffer
 * @returns {{lines:string[], rest:string}}
 */
export function splitLines(buffer) {
  const parts = String(buffer).split('\n');
  const rest = parts.pop();
  return { lines: parts, rest };
}

/**
 * Restart back-off for a host that died. A host that lived for a while is
 * restarted immediately; one that keeps crashing waits longer each time so
 * a broken PowerShell cannot turn into a spawn storm.
 * @param {number} prevDelayMs
 * @param {number} livedMs
 * @returns {number}
 */
export function nextRestartDelay(prevDelayMs, livedMs) {
  if (livedMs >= 30000) return 0;
  if (!prevDelayMs) return 1000;
  return Math.min(30000, prevDelayMs * 2);
}
