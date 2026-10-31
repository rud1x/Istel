// Pure helpers for lyrics/time handling (ESM, unit-tested).

export function findActiveLineIndex(lines, positionSeconds) {
  if (!Array.isArray(lines) || lines.length === 0) return -1;
  let idx = -1;
  for (let i = 0; i < lines.length; i++) {
    const s = lines[i].start_ms / 1000;
    const e = lines[i].end_ms / 1000;
    if (positionSeconds >= s && positionSeconds < e) return i;
    if (positionSeconds >= s) idx = i;
  }
  return idx;
}

export function formatClockTime(seconds) {
  if (!seconds || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function formatClock(date) {
  const d = date || new Date();
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

export function parseLrc(lrc, defaultTailMs = 5000) {
  if (!lrc || typeof lrc !== 'string') return null;
  const out = [];
  const re = /\[(\d+):(\d+(?:\.\d+)?)\](.*)/g;
  let m;
  while ((m = re.exec(lrc)) !== null) {
    const min = parseInt(m[1], 10);
    const sec = parseFloat(m[2]);
    const text = (m[3] || '').trim();
    if (text) out.push({ text, start_ms: Math.round((min * 60 + sec) * 1000) });
  }
  for (let i = 0; i < out.length; i++) {
    out[i].end_ms = i + 1 < out.length ? out[i + 1].start_ms : out[i].start_ms + defaultTailMs;
  }
  return out.length ? out : null;
}
