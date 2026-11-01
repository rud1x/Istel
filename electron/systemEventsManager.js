const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const SCRIPT_DIR = path.join(os.tmpdir(), 'island_scripts');
const CAPS_SCRIPT = path.join(SCRIPT_DIR, 'caps.ps1');

function ensureScript() {
  if (!fs.existsSync(SCRIPT_DIR)) {
    fs.mkdirSync(SCRIPT_DIR, { recursive: true });
  }
  if (!fs.existsSync(CAPS_SCRIPT)) {
    fs.writeFileSync(CAPS_SCRIPT, `
Add-Type -AssemblyName System.Windows.Forms
$caps = [Console]::CapsLock
Write-Output "CAPS:$caps"
`, 'utf8');
  }
}

class SystemEventsManager {
  constructor(monitorManager) {
    this.monitorManager = monitorManager;
    this.lastCapsLock = null;
    this.interval = null;
    ensureScript();
  }

  start() {
    // 1s keeps the Caps Lock toast responsive (this script is tiny and does
    // not touch audio, so it does not affect playback).
    this.interval = setInterval(() => this.checkEvents(), 1000);
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  checkEvents() {
    execFile('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', CAPS_SCRIPT], { timeout: 3000 }, (error, stdout) => {
      if (error || !stdout) return;
      const line = stdout.trim();
      if (line.startsWith('CAPS:')) {
        const caps = line.split(':')[1] === 'True';
        // First reading just seeds the baseline — do NOT broadcast it,
        // otherwise the app fires a phantom Caps Lock event on every launch.
        if (this.lastCapsLock === null) {
          this.lastCapsLock = caps;
          return;
        }
        if (caps !== this.lastCapsLock) {
          this.lastCapsLock = caps;
          try { fs.appendFileSync('debug.log', `[${new Date().toISOString()}] Caps Lock: ${caps}\n`); } catch (e) {}
          this.broadcast('system-event', { type: 'capslock', enabled: caps });
        }
      }
    });
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
