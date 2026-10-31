// ============================================================
// Download Manager
// Hooks Chromium/Electron downloads via session 'will-download'
// and streams state to the renderer so the island can show a
// download banner (name, size, speed, progress).
// ============================================================

const { session, app } = require('electron');
const path = require('path');
const fs = require('fs');

class DownloadManager {
  constructor(monitorManager) {
    this.monitorManager = monitorManager;
    this.items = [];
    this._idSeq = 1;
    this._started = false;
  }

  start() {
    if (this._started) return;
    this._started = true;
    session.defaultSession.on('will-download', (_event, item) => this._handle(item));
    this._watchDownloadsFolder();
  }

  // Watch the OS Downloads folder so downloads started in EXTERNAL browsers
  // (Chrome/Edge/Firefox) also produce a banner. Chromium's will-download
  // only covers downloads initiated inside this app's own session.
  _watchDownloadsFolder() {
    let dir;
    try {
      dir = app.getPath('downloads');
    } catch (e) {
      console.log('[Download] cannot resolve downloads folder:', e.message);
      return;
    }
    if (!dir || !fs.existsSync(dir)) return;

    // A polling snapshot is more reliable than fs.watch on Windows (which
    // misses events for files written by other processes / on some FS). We
    // remember each finished file's size+mtime and only announce genuinely
    // new/updated files. Partial (.crdownload/.part) files are skipped.
    this._seen = new Map(); // filename -> "size:mtime"
    this._seedSnapshot = true;

    const tick = () => {
      fs.readdir(dir, (err, names) => {
        if (err) return;
        for (const filename of names) {
          if (/\.(crdownload|part|tmp|download)$/i.test(filename)) continue;
          const full = path.join(dir, filename);
          fs.stat(full, (e2, stat) => {
            if (e2 || !stat.isFile()) return;
            const sig = `${stat.size}:${Math.round(stat.mtimeMs)}`;
            const prev = this._seen.get(filename);
            // On the first pass just record existing files so we do not spam a
            // banner for every old file already in Downloads.
            if (this._seedSnapshot) {
              this._seen.set(filename, sig);
              return;
            }
            if (prev === sig) return;
            this._seen.set(filename, sig);
            // Announce only files touched in the last ~20s.
            if (Date.now() - stat.mtimeMs > 20000) return;
            const entry = {
              id: `fs_${filename}`,
              filename,
              totalBytes: stat.size,
              receivedBytes: stat.size,
              speed: 0,
              state: 'completed',
              savePath: full,
              startedAt: Date.now(),
            };
            this._broadcast('download-start', { ...entry, state: 'progressing' });
            this._broadcast('download-progress', { ...entry, state: 'progressing' });
            this._broadcast('download-done', entry);
          });
        }
        if (this._seedSnapshot) this._seedSnapshot = false;
      });
    };

    tick();
    this._watchTimer = setInterval(tick, 3000);
  }

  _handle(item) {
    const id = this._idSeq++;
    const entry = {
      id,
      filename: item.getFilename(),
      totalBytes: item.getTotalBytes(),
      receivedBytes: 0,
      speed: 0,
      state: 'progressing',
      savePath: '',
      startedAt: Date.now(),
    };
    this.items.unshift(entry);
    if (this.items.length > 20) this.items.length = 20;

    this._broadcast('download-start', { ...entry });

    let lastTick = Date.now();
    let lastReceived = 0;

    item.on('updated', (_e, state) => {
      entry.receivedBytes = item.getReceivedBytes();
      entry.totalBytes = item.getTotalBytes();
      entry.state = state === 'interrupted' ? 'interrupted' : 'progressing';

      const now = Date.now();
      const dt = (now - lastTick) / 1000;
      if (dt >= 0.25) {
        const delta = entry.receivedBytes - lastReceived;
        entry.speed = dt > 0 ? Math.max(0, Math.round(delta / dt)) : 0;
        lastTick = now;
        lastReceived = entry.receivedBytes;
      }

      this._broadcast('download-progress', { ...entry });
    });

    item.once('done', (_e, state) => {
      entry.receivedBytes = item.getReceivedBytes();
      entry.totalBytes = item.getTotalBytes();
      entry.savePath = item.getSavePath() || '';
      entry.state = state === 'completed' ? 'completed' : 'failed';
      entry.filename = path.basename(entry.savePath) || entry.filename;
      this._broadcast('download-done', { ...entry });
    });
  }

  getItems() {
    return this.items;
  }

  _broadcast(channel, data) {
    if (!this.monitorManager) return;
    for (const [, entry] of this.monitorManager.windows) {
      if (!entry.win.isDestroyed() && entry.win.webContents && entry.isLoaded) {
        try { entry.win.webContents.send(channel, data); } catch {}
      }
    }
  }
}

module.exports = DownloadManager;
