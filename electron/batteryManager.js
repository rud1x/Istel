// ============================================================
// Battery Manager
// Polls battery percent / charging state via WMI (PowerShell)
// and emits a system event when it changes meaningfully.
// ============================================================

const { execFile } = require('child_process');

const POLL_INTERVAL = 60000; // every minute
const SCRIPT = `
$b = Get-CimInstance Win32_Battery -ErrorAction SilentlyContinue | Select-Object -First 1
if ($null -eq $b) { Write-Output 'NOBAT' } else {
  $p = $b.EstimatedChargeRemaining
  $st = $b.BatteryStatus
  # 2 = plugged in / charging, 1 = discharging
  Write-Output "$p|$st"
}
`;

class BatteryManager {
  constructor(monitorManager) {
    this.monitorManager = monitorManager;
    this.state = null; // { percent, charging } | null
    this.timer = null;
    this.lastKey = null;
  }

  start() {
    this._poll();
    this.timer = setInterval(() => this._poll(), POLL_INTERVAL);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  getState() {
    return this.state;
  }

  _poll() {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', SCRIPT],
      { timeout: 5000 },
      (err, stdout) => {
        if (err || !stdout) return;
        const raw = stdout.trim();
        if (raw === 'NOBAT') {
          if (this.state !== null) {
            this.state = null;
            this._broadcast();
          }
          return;
        }
        const [pStr, stStr] = raw.split('|');
        const percent = parseInt(pStr, 10);
        if (!Number.isFinite(percent)) return;
        const charging = stStr === '2';
        this.state = { percent, charging };
        const key = `${percent}|${charging}`;
        if (key !== this.lastKey) {
          this.lastKey = key;
          this._broadcast();
        }
      }
    );
  }

  _broadcast() {
    if (!this.monitorManager) return;
    for (const [, entry] of this.monitorManager.windows) {
      if (!entry.win.isDestroyed() && entry.win.webContents) {
        entry.win.webContents.send('battery-update', this.state);
      }
    }
  }
}

module.exports = BatteryManager;
