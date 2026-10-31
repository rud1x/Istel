// ============================================================
// Update Manager
// Checks the GitHub Releases API for a newer version and reports
// it to the renderer. Does NOT auto-install — the user downloads
// the installer manually (simple, predictable for v1).
// ============================================================

const https = require('https');

const REPO = 'rud1x/Istel';
const CHECK_INTERVAL = 6 * 60 * 60 * 1000; // 6h

function compareVersions(a, b) {
  const pa = String(a).replace(/^v/, '').split('.').map(Number);
  const pb = String(b).replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x > y) return 1;
    if (x < y) return -1;
  }
  return 0;
}

class UpdateManager {
  constructor(monitorManager, app) {
    this.monitorManager = monitorManager;
    this.app = app;
    this.timer = null;
    this.latest = null;
  }

  start() {
    this.check();
    this.timer = setInterval(() => this.check(), CHECK_INTERVAL);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
  }

  getState() {
    return {
      current: this.app.getVersion(),
      latest: this.latest?.version || null,
      url: this.latest?.url || null,
      available: this.latest ? compareVersions(this.latest.version, this.app.getVersion()) > 0 : false,
    };
  }

  check() {
    return new Promise((resolve) => {
      try {
        const req = https.request({
          hostname: 'api.github.com',
          path: `/repos/${REPO}/releases/latest`,
          method: 'GET',
          timeout: 8000,
          headers: { 'User-Agent': 'Istel', Accept: 'application/vnd.github+json' },
        }, (res) => {
          let data = '';
          res.on('data', (c) => { data += c; });
          res.on('end', () => {
            try {
              if (res.statusCode !== 200) return resolve(null);
              const j = JSON.parse(data);
              const version = j.tag_name || j.name;
              const asset = (j.assets || []).find((a) => /\.exe$/i.test(a.name));
              this.latest = { version, url: j.html_url, download: asset?.browser_download_url || j.html_url };
              this.monitorManager.broadcastToAll('update-available', this.getState());
              resolve(this.getState());
            } catch { resolve(null); }
          });
        });
        req.on('error', () => resolve(null));
        req.on('timeout', () => { try { req.destroy(); } catch {} resolve(null); });
        req.end();
      } catch { resolve(null); }
    });
  }
}

module.exports = UpdateManager;
