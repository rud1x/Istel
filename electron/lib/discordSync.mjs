// Pure helpers for Discord Rich Presence update throttling. Extracted so
// the resync logic can be unit-tested without the discord-rpc dependency.

/**
 * Decide whether an activity push is needed.
 *
 * Fixes B4: `lastSyncAt` must advance whenever we DECIDE to push, not only
 * when the key changes — otherwise a steady track never re-syncs its timer.
 * Fixes B5: a pending artwork upload must not clobber another track's key.
 *
 * @param {object} p
 * @param {string} p.key            current track key (title|artist|status)
 * @param {string|null} p.lastKey   key of the last pushed activity
 * @param {number} p.lastSyncAt     timestamp of last push
 * @param {number} p.now
 * @param {boolean} p.isPlaying
 * @param {number} [p.resyncMs=10000]
 * @returns {{ push: boolean, nextSyncAt: number }}
 */
export function decideActivityPush({ key, lastKey, lastSyncAt, now, isPlaying, resyncMs = 10000 }) {
  const sameKey = key === lastKey;
  const needResync = isPlaying && now - lastSyncAt > resyncMs;
  if (sameKey && !needResync) {
    return { push: false, nextSyncAt: lastSyncAt };
  }
  return { push: true, nextSyncAt: now };
}

/**
 * Track-key used for artwork cache lookups. Kept separate from the activity
 * key so an async upload callback can target the right track (B5).
 */
export function artworkKey(title, artist) {
  return `${title || ''}|${artist || ''}`;
}

/**
 * Decide whether the artwork for this track should start uploading right
 * now, independently of whether an activity push is due. This is what makes
 * the cover appear within seconds of a track change instead of waiting for
 * the next resync window.
 *
 * @param {object} p
 * @param {string|null} p.artwork   base64 artwork (or '__same__'/null)
 * @param {boolean} p.cached        true when a valid cover URL is cached
 * @param {boolean} p.uploading     true when an upload is already in flight
 * @returns {boolean}
 */
export function shouldPrimeArtwork({ artwork, cached, uploading }) {
  if (cached || uploading) return false;
  if (typeof artwork !== 'string') return false;
  if (artwork === '__same__') return false;
  return artwork.length > 100;
}
