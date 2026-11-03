// ============================================================
// System Events Manager
// Watches Caps Lock and broadcasts a toast event on change.
// Runs in the persistent 'system' PowerShell host (psHost.js) instead of
// spawning powershell.exe every second.
// ============================================================

const { getHost } = require('./psHost');
const { createGuardedPoller } = require('./lib/guardedPoller.cjs');

// 1 s keeps the Caps Lock toast responsive; in the warm host a check costs
// about a millisecond.
const POLL_INTERVAL = 1000;

const CAPS_DEFS = `
Function IslandCapsQuery { "CAPS:$([Console]::CapsLock)" }
`;

class SystemEventsManager {
  constructor(monitorManager) {
    this.monitorManager = monitorManager;
    this.lastCapsLock = null;
    this._host = getHost('system');
    this._host.define('caps', CAPS_DEFS);
    this._poller = createGuardedPoller(() => this.checkEvents(), POLL_INTERVAL);
  }

  start() {
    this._poller.start();
  }

  stop() {
    this._poller.stop();
  }

  checkEvents() {
    return this._host.call('IslandCapsQuery', [], { timeout: 3000 }).then((stdout) => {
      const line = (stdout || '').trim();
      if (!line.startsWith('CAPS:')) return;
      const caps = line.split(':')[1] === 'True';
      // First reading just seeds the baseline — do NOT broadcast it,
      // otherwise the app fires a phantom Caps Lock event on every launch.
      if (this.lastCapsLock === null) {
        this.lastCapsLock = caps;
        return;
      }
      if (caps !== this.lastCapsLock) {
        this.lastCapsLock = caps;
        this.broadcast('system-event', { type: 'capslock', enabled: caps });
      }
    }, () => {});
  }

  broadcast(channel, data) {
    if (!this.monitorManager) return;
    for (const [, entry] of this.monitorManager.windows) {
      if (!entry.win.isDestroyed() && entry.win.webContents) {
        entry.win.webContents.send(channel, data);
      }
    }
  }
}

module.exports = SystemEventsManager;
