'use strict';
// CommonJS mirror of ./downloadSnapshot.mjs (kept in sync; tested via the
// .mjs version). Electron main is CommonJS.

function isPartialDownload(filename) {
  return /\.(crdownload|part|tmp|download)$/i.test(filename || '');
}

function fileSignature(stat) {
  return `${stat.size}:${Math.round(stat.mtimeMs)}`;
}

function classifyDownloadObservation({ signature, previous, seeding, now, mtimeMs, recencyMs = 20000 }) {
  if (seeding) return 'seed';
  if (previous === signature) return 'ignore';
  if (now - mtimeMs > recencyMs) return 'ignore';
  return 'announce';
}

module.exports = { isPartialDownload, fileSignature, classifyDownloadObservation };
