const { net } = require('electron');
const YAML = require('yaml');

// Official lrclib application id (authorized queue, fewer 502s).
const LRCLIB_APP_ID = 'ap8jx_ct0II8MDY--_KFOBWnRqQupEps2Hbo0dYUTuA';
const LRCLIB_HEADERS = {
  'Lrclib-App-Id': LRCLIB_APP_ID,
  'User-Agent': 'Istel/1.0',
};

// Parse LRC text into timed lines [{text,start_ms,end_ms}] (line-level).
// Used as a fallback when lrclib has no lyricsfile (only syncedLyrics).
function parseLrcToLines(lrc, tailMs = 5000) {
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
    out[i].end_ms = i + 1 < out.length ? out[i + 1].start_ms : out[i].start_ms + tailMs;
  }
  return out.length ? out : null;
}

class LyricsManager {
  constructor(monitorManager) {
    this.monitorManager = monitorManager;
    this.currentTrackKey = null;
    this.currentLyrics = null;
    // Throttle re-fetch attempts after a transient failure (503/429) so we
    // don't hammer lrclib on every 500ms media-update tick.
    this._lastRetryAt = 0;
    this._retryDelayMs = 5000;
  }

  async update(mediaState) {
    if (!mediaState || mediaState.status === 'no_session') {
      if (this.currentTrackKey !== null) {
        this.currentTrackKey = null;
        this.currentLyrics = null;
        this.broadcast('lyrics-update', null);
      }
      return;
    }

    const trackKey = `${mediaState.title}|${mediaState.artist}|${mediaState.album}|${mediaState.duration}`;
    if (trackKey === this.currentTrackKey) return;

    // If we're in a retry backoff window after a transient failure, wait.
    if (this.currentTrackKey === null && this._lastRetryAt && Date.now() - this._lastRetryAt < this._retryDelayMs) {
      return;
    }

    this.currentTrackKey = trackKey;
    this.broadcast('lyrics-update', null); // Clear old lyrics immediately

    console.log('[LyricsManager] Fetching lyrics for:', trackKey);

    try {
      const lyrics = await this.fetchLyrics(mediaState);
      const hasData = !!(lyrics && (lyrics.lyrics || (lyrics.wordSync && lyrics.wordSync.length)));
      console.log(
        '[LyricsManager] Lyrics result:',
        hasData ? 'found' : 'not found',
        lyrics ? `(lines=${lyrics.wordSync ? lyrics.wordSync.length : 0}, synced=${lyrics.lyrics ? 'yes' : 'no'})` : '(null)'
      );
      this.currentLyrics = lyrics;
      this.broadcast('lyrics-update', lyrics);

      // Transient failure (server busy / rate limited): don't cache this
      // track as "resolved", and clear the key so a later media-update will
      // retry — throttled to once per _retryDelayMs.
      if (!hasData && lyrics && lyrics.transientFailure) {
        this._lastRetryAt = Date.now();
        this.currentTrackKey = null;
      }
    } catch (e) {
      console.log('[LyricsManager] Failed to fetch lyrics:', e.message);
      // Backoff before retrying so a failing endpoint is not hammered.
      this._lastRetryAt = Date.now();
      this.currentTrackKey = null;
    }
  }

  _httpJson(url, timeoutMs = 6000) {
    return new Promise((resolve) => {
      try {
        const request = net.request(url);
        request.setHeader('User-Agent', 'Istel/1.0');
        request.setHeader('Accept', 'application/json');
        request.setHeader('Lrclib-App-Id', LRCLIB_APP_ID);
        const timer = setTimeout(() => { try { request.abort(); } catch {} resolve({ status: 0, json: null }); }, timeoutMs);
        request.on('response', (response) => {
          let data = '';
          response.on('data', (c) => { data += c; });
          response.on('end', () => {
            clearTimeout(timer);
            let json = null;
            try { json = JSON.parse(data); } catch {}
            resolve({ status: response.statusCode, json });
          });
        });
        request.on('error', () => { clearTimeout(timer); resolve({ status: 0, json: null }); });
        request.end();
      } catch {
        resolve({ status: 0, json: null });
      }
    });
  }

  _toResult(json) {
    if (!json) return null;
    let wordSync = null;
    if (json.lyricsfile) {
      try {
        const parsed = YAML.parse(json.lyricsfile);
        wordSync = parsed.lines || null;
      } catch (e) {
        console.log('[LyricsManager] YAML parse error:', e.message);
      }
    }
    const lyrics = json.syncedLyrics || json.plainLyrics || null;
    if (!lyrics && !wordSync) return null;
    return { lyrics, wordSync: wordSync || parseLrcToLines(json.syncedLyrics), retryAfter: null };
  }

  async fetchLyrics(mediaState, retries = 3) {
    // 1) Exact match by track/artist/album/duration.
    const params = new URLSearchParams({
      track_name: mediaState.title || '',
      artist_name: mediaState.artist || '',
      album_name: mediaState.album || '',
      duration: Math.round(mediaState.duration || 0).toString(),
    });
    const exactUrl = `https://lrclib.net/api/get?${params.toString()}`;
    const exact = await this._httpJson(exactUrl);
    if (exact.status === 200) {
      const r = this._toResult(exact.json);
      if (r) return r;
    }

    // 2) Fallback: fuzzy search by title + artist. Exact /api/get fails often
    // because of slightly different album/duration/artist strings.
    const searchParams = new URLSearchParams({ q: `${mediaState.title || ''} ${mediaState.artist || ''}`.trim() });
    const searchUrl = `https://lrclib.net/api/search?${searchParams.toString()}`;
    const search = await this._httpJson(searchUrl);
    if (search.status === 200 && Array.isArray(search.json) && search.json.length) {
      // Prefer an entry that has synced lyrics.
      const pick = search.json.find((e) => e.syncedLyrics) || search.json[0];
      const r = this._toResult(pick);
      if (r) return r;
    }

    // 3) Fallback provider: lyrics.ovh returns plain text (no timings).
    // Used when lrclib is down (502) or has nothing for this track.
    const ovh = await this._fetchOvh(mediaState);
    if (ovh) return { lyrics: ovh, wordSync: null, retryAfter: null };

    if (exact.status === 503 || exact.status === 429 || exact.status >= 500) {
      return { lyrics: null, wordSync: null, transientFailure: true };
    }
    return { lyrics: null, wordSync: null, retryAfter: null };
  }

  _fetchOvh(mediaState) {
    return new Promise((resolve) => {
      try {
        const artist = (mediaState.artist || '').split(',')[0].trim();
        const title = (mediaState.title || '').trim();
        if (!artist || !title) return resolve(null);
        const url = `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`;
        const request = net.request(url);
        request.setHeader('User-Agent', 'Istel/1.0');
        request.setHeader('Accept', 'application/json');
        const timer = setTimeout(() => { try { request.abort(); } catch {} resolve(null); }, 6000);
        request.on('response', (response) => {
          let data = '';
          response.on('data', (c) => { data += c; });
          response.on('end', () => {
            clearTimeout(timer);
            if (response.statusCode !== 200) return resolve(null);
            try {
              const j = JSON.parse(data);
              resolve(typeof j.lyrics === 'string' && j.lyrics.trim() ? j.lyrics : null);
            } catch { resolve(null); }
          });
        });
        request.on('error', () => { clearTimeout(timer); resolve(null); });
        request.end();
      } catch {
        resolve(null);
      }
    });
  }

  broadcast(channel, data) {
    if (!this.monitorManager) return;
    for (const [, entry] of this.monitorManager.windows) {
      if (!entry.win.isDestroyed() && entry.win.webContents && entry.isLoaded) {
        try { entry.win.webContents.send(channel, data); } catch {}
      }
    }
  }
}

module.exports = LyricsManager;
