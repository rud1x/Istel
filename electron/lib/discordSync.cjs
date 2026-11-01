'use strict';
// CommonJS mirror of ./discordSync.mjs (kept in sync; tested via the .mjs
// version). Electron main is CommonJS.

function decideActivityPush({ key, lastKey, lastSyncAt, now, isPlaying, resyncMs = 10000 }) {
  const sameKey = key === lastKey;
  const needResync = isPlaying && now - lastSyncAt > resyncMs;
  if (sameKey && !needResync) {
    return { push: false, nextSyncAt: lastSyncAt };
  }
  return { push: true, nextSyncAt: now };
}

function artworkKey(title, artist) {
  return `${title || ''}|${artist || ''}`;
}

function shouldPrimeArtwork({ artwork, cached, uploading }) {
  if (cached || uploading) return false;
  if (typeof artwork !== 'string') return false;
  if (artwork === '__same__') return false;
  return artwork.length > 100;
}

module.exports = { decideActivityPush, artworkKey, shouldPrimeArtwork };
