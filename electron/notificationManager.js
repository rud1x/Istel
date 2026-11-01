const { spawn } = require('child_process');
const path = require('path');

// If the PowerShell notification listener dies (Windows Notification Listener
// unavailable at boot, transient COM error), we used to just log it and never
// get notifications again until a restart (R9). Now we retry with backoff.
const RESTART_DELAY_MS = 4000;
const MAX_RESTART_DELAY_MS = 60000;

class NotificationManager {
  constructor(monitorManager) {
    this.monitorManager = monitorManager;
    this.process = null;
    this._stopped = false;
    this._restartTimer = null;
    this._restartDelay = RESTART_DELAY_MS;
  }

  start() {
    this._stopped = false;
    this._spawn();
  }

  _spawn() {
    if (this._stopped || this.process) return;
    const scriptPath = path.join(__dirname, 'scripts', 'listen_notifications.ps1');
    this.process = spawn('powershell.exe', [
      '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath
    ], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });

    this.process.stdout.on('data', (data) => {
      const lines = data.toString().split('\n');
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const notification = JSON.parse(line);
          if (notification.error) {
            console.log('[NotificationManager] Error:', notification.error);
            continue;
          }
          this.broadcast('notification', notification);
        } catch (e) {
          // Ignore malformed JSON
        }
      }
    });

    this.process.stderr.on('data', (data) => {
      console.log('[NotificationManager] stderr:', data.toString());
    });

    this.process.on('close', (code) => {
      console.log('[NotificationManager] Process exited with code', code);
      this.process = null;
      if (!this._stopped) this._scheduleRestart();
    });
  }

  _scheduleRestart() {
    if (this._restartTimer || this._stopped) return;
    const delay = this._restartDelay;
    this._restartDelay = Math.min(MAX_RESTART_DELAY_MS, Math.round(delay * 1.5));
    this._restartTimer = setTimeout(() => {
      this._restartTimer = null;
      if (!this._stopped) this._spawn();
    }, delay);
  }

  stop() {
    this._stopped = true;
    if (this._restartTimer) {
      clearTimeout(this._restartTimer);
      this._restartTimer = null;
    }
    if (this.process) {
      try { this.process.kill(); } catch {}
      this.process = null;
    }
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

module.exports = NotificationManager;
