// Pure helpers for the Downloads-folder watcher (B9). The old code flipped
// the seed flag synchronously after readdir, before async fs.stat callbacks
// finished, producing phantom banners. These helpers make the seeding
// decision explicit and testable.

/** Files that are still being written and must be ignored. */
export function isPartialDownload(filename) {
  return /\.(crdownload|part|tmp|download)$/i.test(filename || '');
}

/**
 * Build a stable signature for a finished file.
 * @param {{size:number, mtimeMs:number}} stat
 */
export function fileSignature(stat) {
  return `${stat.size}:${Math.round(stat.mtimeMs)}`;
}

/**
 * Decide what to do with a file observed during a tick.
 *
 * @param {object} p
 * @param {string} p.signature
 * @param {string|undefined} p.previous
 * @param {boolean} p.seeding   true while taking the initial snapshot
 * @param {number} p.now
 * @param {number} p.mtimeMs
 * @param {number} [p.recencyMs=20000]
 * @returns {'seed'|'ignore'|'announce'}
 */
export function classifyDownloadObservation({ signature, previous, seeding, now, mtimeMs, recencyMs = 20000 }) {
  if (seeding) return 'seed';
  if (previous === signature) return 'ignore';
  if (now - mtimeMs > recencyMs) return 'ignore';
  return 'announce';
}
