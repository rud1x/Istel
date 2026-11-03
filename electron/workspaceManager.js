// ============================================================
// Workspace Manager
// Broadcasts the process name of the foreground window.
// Runs in the persistent 'system' PowerShell host (psHost.js); the C#
// helper is compiled once instead of on every 2 s poll.
// ============================================================

const { getHost } = require('./psHost');
const { createGuardedPoller } = require('./lib/guardedPoller.cjs');

const POLL_INTERVAL = 2000;

const WORKSPACE_DEFS = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class IslandWin32 {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
}
"@
Function IslandActiveProcess {
  $hwnd = [IslandWin32]::GetForegroundWindow()
  $procId = 0
  [IslandWin32]::GetWindowThreadProcessId($hwnd, [ref]$procId) | Out-Null
  $process = Get-Process -Id $procId -ErrorAction SilentlyContinue
  if ($process) { $process.ProcessName }
}
`;

class WorkspaceManager {
  constructor(monitorManager) {
    this.monitorManager = monitorManager;
    this.lastProcess = null;
    this._host = getHost('system');
    this._host.define('workspace', WORKSPACE_DEFS);
    this._poller = createGuardedPoller(() => this.checkActiveWindow(), POLL_INTERVAL);
  }

  start() {
    // Idempotent (R2/R4): never create a second poll if one is running.
    this._poller.start();
  }

  stop() {
    this._poller.stop();
  }

  checkActiveWindow() {
    return this._host.call('IslandActiveProcess', [], { timeout: 2500 }).then((stdout) => {
      const processName = (stdout || '').trim();
      if (processName && processName !== this.lastProcess) {
        this.lastProcess = processName;
        this.monitorManager.broadcastToAll('active-window-update', processName);
      }
    }, () => {});
  }
}

module.exports = WorkspaceManager;
