const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

// The previous version built an inline PowerShell command and collapsed
// newlines with replace(/\n/g, ' '). That destroys here-strings (@" ... "@),
// which REQUIRE a newline right after @" and before "@ — so the script was a
// syntax error and active-window tracking never worked (R8). We now write a
// proper .ps1 file and call it with -File, matching the other managers.
const SCRIPT_DIR = path.join(os.tmpdir(), 'island_scripts');
const SCRIPT_PATH = path.join(SCRIPT_DIR, 'active_window_query.ps1');

const SCRIPT_CONTENT = `
$ErrorActionPreference = 'SilentlyContinue'
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class IslandWin32 {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
}
"@
$hwnd = [IslandWin32]::GetForegroundWindow()
$procId = 0
[IslandWin32]::GetWindowThreadProcessId($hwnd, [ref]$procId) | Out-Null
$process = Get-Process -Id $procId -ErrorAction SilentlyContinue
if ($process) { Write-Output $process.ProcessName }
`;

function ensureScript() {
  if (!fs.existsSync(SCRIPT_DIR)) {
    fs.mkdirSync(SCRIPT_DIR, { recursive: true });
  }
  fs.writeFileSync(SCRIPT_PATH, SCRIPT_CONTENT, 'utf8');
}

class WorkspaceManager {
  constructor(monitorManager) {
    this.monitorManager = monitorManager;
    this.interval = null;
    this.lastProcess = null;
    this._checking = false;
    ensureScript();
  }

  start() {
    // Idempotent (R2/R4): never create a second timer if one is running.
    if (this.interval) return;
    this.checkActiveWindow();
    this.interval = setInterval(() => this.checkActiveWindow(), 2000);
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  checkActiveWindow() {
    if (this._checking) return;
    this._checking = true;
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', SCRIPT_PATH],
      { timeout: 2500, windowsHide: true },
      (error, stdout) => {
        this._checking = false;
        if (error || !stdout) return;
        const processName = stdout.trim();
        if (processName && processName !== this.lastProcess) {
          this.lastProcess = processName;
          this.monitorManager.broadcastToAll('active-window-update', processName);
        }
      }
    );
  }
}

module.exports = WorkspaceManager;
