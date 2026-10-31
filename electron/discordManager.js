// ============================================================
// Discord Manager (Rich Presence)
// Shows the currently playing track in the Discord profile via
// Discord RPC. Best-effort: if Discord is not running the manager
// simply stays idle.
// ============================================================

const https = require('https');

let RPC = null;
try {
  RPC = require('discord-rpc');
} catch (e) {
  console.log('[Discord] discord-rpc not available:', e.message);
}

// Upload a JPEG buffer to a temporary anonymous image host and return a public
// URL Discord can render as a rich-presence artwork. Only normalized bytes
// leave the app. Returns null on any failure (fallback to static asset).
function uploadCover(jpegBuffer) {
  return new Promise((resolve) => {
    if (!jpegBuffer || !jpegBuffer.length) return resolve(null);
    try {
      const boundary = '----istel' + Date.now().toString(16);
      const head = Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="ttl"\r\n\r\n3600\r\n` +
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="cover.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`
      );
      const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
      const body = Buffer.concat([head, jpegBuffer, tail]);

      const req = https.request({
        hostname: 'imgdb.io',
        path: '/api/v1/upload',
        method: 'POST',
        timeout: 8000,
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': body.length,
          'Accept': 'application/json',
          'User-Agent': 'Istel/1.0',
        },
      }, (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          try {
            const data = Buffer.concat(chunks).toString('utf8');
            const j = JSON.parse(data);
            const url = j && j.url;
            if (url && /^https:\/\//.test(url) && /imgdb\.io/.test(url)) resolve(url);
            else resolve(null);
          } catch (e) {
            console.log('[Discord] upload parse error', e.message);
            resolve(null);
          }
        });
      });
      req.on('error', () => resolve(null));
      req.on('timeout', () => { try { req.destroy(); } catch {} resolve(null); });
      req.write(body);
      req.end();
    } catch {
      resolve(null);
    }
  });
}

// Client ID — a Discord application id. Replace with your own if needed.
const CLIENT_ID = '1566013094260514887';

class DiscordManager {
  constructor(configManager) {
    this.configManager = configManager;
    this.client = null;
    this.ready = false;
    this.enabled = false;
    this._lastKey = null;
    this._lastSyncAt = 0;
    this._coverCache = new Map(); // trackKey -> { url, exp }
    this._coverUploading = new Set();
    this._retryTimer = null;
    this._retryMs = 5000;
  }

  start() {
    if (!RPC) { console.log('[Discord] discord-rpc module not loaded'); return; }
    this.enabled = this.configManager?.get('discordRPC', false) === true;
    if (!this.enabled) return;
    this._connect();
  }

  stop() {
    try {
      this.client?.clearActivity?.();
      this.client?.destroy?.();
    } catch (e) {}
    this.client = null;
    this.ready = false;
  }

  setEnabled(enabled) {
    this.enabled = !!enabled;
    if (this.enabled) this._connect();
    else this.stop();
  }

  _connect() {
    if (!RPC || this.client) return;
    try {
      RPC.register(CLIENT_ID);
      this.client = new RPC.Client({ transport: 'ipc' });
      this.client.on('ready', () => {
        this.ready = true;
        this._retryMs = 5000;
        console.log('[Discord] Rich Presence connected');
      });
      this.client.on('disconnected', () => {
        this.ready = false;
        this.client = null;
        // Discord may be restarting; try to reconnect later.
        if (this.enabled) this._scheduleRetry();
      });
      this.client.login({ clientId: CLIENT_ID }).catch((e) => {
        console.log('[Discord] login failed:', e.message);
        this.client = null;
        if (this.enabled) this._scheduleRetry();
      });
    } catch (e) {
      console.log('[Discord] connect failed:', e.message);
      if (this.enabled) this._scheduleRetry();
    }
  }

  _scheduleRetry() {
    if (this._retryTimer) return;
    const delay = this._retryMs || 5000;
    this._retryMs = Math.min(30000, delay * 1.5);
    this._retryTimer = setTimeout(() => {
      this._retryTimer = null;
      if (this.enabled && !this.ready) this._connect();
    }, delay);
  }

  update(mediaState) {
    if (!this.enabled || !this.ready || !this.client) return;

    if (!mediaState || mediaState.status === 'no_session' || !mediaState.title) {
      if (this._lastKey !== 'none') {
        this._lastKey = 'none';
        this.client.clearActivity().catch(() => {});
      }
      return;
    }

    const isPlaying = mediaState.playbackStatus === 'Playing';
    const duration = Number(mediaState.duration) || 0;
    // Real position = SMTC snapshot + age since LastUpdatedTime (while playing).
    const ageSec = isPlaying ? (Number(mediaState.positionAgeMs) || 0) / 1000 : 0;
    const position = (Number(mediaState.position) || 0) + ageSec;

    const key = `${mediaState.title}|${mediaState.artist}|${mediaState.playbackStatus}`;
    // Re-sync periodically (every ~10s) so the Discord timer stays aligned with
    // the real playback position even on the same track.
    const needResync = isPlaying && (Date.now() - this._lastSyncAt > 10000);
    if (key === this._lastKey && !needResync) return;
    this._lastKey = key;
    this._lastSyncAt = Date.now();

    const activity = {
      // type 2 = "Listening to" (shows as 'Listening' in the profile).
      type: 2,
      details: mediaState.title || 'Unknown Track',
      state: mediaState.artist || 'Unknown Artist',
      // Cover art: use cached/temporary-hosted URL when available.
      largeImageKey: this._coverUrl(mediaState) || 'istel_logo',
      largeImageText: this._platformName(mediaState.source) || 'Istel',
      smallImageKey: this._platformKey(mediaState.source),
      smallImageText: this._platformName(mediaState.source),
      instance: false,
      buttons: [{ label: 'Скачать Istel', url: 'https://github.com/rud1x/Islet' }],
    };

    // Live progress bar: Discord shows a timer between start and end.
    if (isPlaying && duration > 0) {
      const now = Date.now();
      activity.startTimestamp = now - Math.round(position * 1000);
      activity.endTimestamp = activity.startTimestamp + Math.round(duration * 1000);
    } else if (isPlaying) {
      activity.startTimestamp = Date.now();
    }

    // discord-rpc's setActivity() drops the `type` field, so Discord always
    // shows "Playing". Send the raw SET_ACTIVITY payload ourselves with type 2
    // (Listening) to match a music app.
    try {
      const RPCCommands = require('discord-rpc/src/constants').RPCCommands;
      const timestamps = (activity.startTimestamp || activity.endTimestamp)
        ? { start: activity.startTimestamp, end: activity.endTimestamp }
        : undefined;
      const assets = (activity.largeImageKey || activity.smallImageKey)
        ? {
            large_image: activity.largeImageKey,
            large_text: activity.largeImageText,
            small_image: activity.smallImageKey,
            small_text: activity.smallImageText,
          }
        : undefined;
      const payload = {
        pid: process.pid,
        activity: {
          type: 2,
          state: activity.state,
          details: activity.details,
          timestamps,
          assets,
          buttons: activity.buttons,
          instance: false,
        },
      };
      this.client.request(RPCCommands.SET_ACTIVITY, payload).catch((e) => {
        console.log('[Discord] setActivity failed:', e.message);
      });
    } catch (e) {
      // Fallback to the library method if the internal API changes.
      this.client.setActivity(activity).catch((err) => {
        console.log('[Discord] setActivity fallback failed:', err.message);
      });
    }
  }

  _coverUrl(mediaState) {
    const trackKey = `${mediaState.title || ''}|${mediaState.artist || ''}`;
    const cached = this._coverCache.get(trackKey);
    if (cached && cached.exp > Date.now()) return cached.url;

    // Kick off an upload (once per track) — the NEXT status push will use it.
    if (!cached && !this._coverUploading.has(trackKey) && mediaState.artwork && mediaState.artwork.length > 100) {
      this._coverUploading.add(trackKey);
      try {
        const buf = Buffer.from(mediaState.artwork, 'base64');
        uploadCover(buf).then((url) => {
          this._coverUploading.delete(trackKey);
          if (url) {
            this._coverCache.set(trackKey, { url, exp: Date.now() + 55 * 60 * 1000 });
            // Force a refresh so the new artwork appears without waiting.
            this._lastKey = null;
          }
        }).catch(() => { this._coverUploading.delete(trackKey); });
      } catch (e) {
        this._coverUploading.delete(trackKey);
      }
    }
    return cached ? cached.url : null;
  }

  _platformKey(source) {
    const s = (source || '').toLowerCase();
    if (s.includes('spotify')) return 'platform_spotify';
    if (s.includes('yandex')) return 'platform_yandex';
    if (s.includes('chrome') || s.includes('msedge') || s.includes('firefox')) return 'platform_browser';
    return undefined;
  }

  _platformName(source) {
    const s = (source || '').toLowerCase();
    if (s.includes('spotify')) return 'Spotify';
    if (s.includes('yandex')) return 'Яндекс Музыка';
    if (s.includes('chrome')) return 'Chrome';
    if (s.includes('msedge')) return 'Edge';
    if (s.includes('firefox')) return 'Firefox';
    return undefined;
  }
}

module.exports = DiscordManager;
