const { exec } = require('child_process');

class WorkspaceManager {
  constructor(monitorManager) {
    this.monitorManager = monitorManager;
    this.interval = null;
    this.lastProcess = null;
  }

  start() {
    this.interval = setInterval(() => this.checkActiveWindow(), 2000);
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  checkActiveWindow() {
    const psScript = `
      Add-Type @"
      using System;
      using System.Runtime.InteropServices;
      public class Win32 {
        [DllImport("user32.dll")]
        public static extern IntPtr GetForegroundWindow();
        [DllImport("user32.dll")]
        public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
      }
"@
      $hwnd = [Win32]::GetForegroundWindow()
      $pid = 0
      [Win32]::GetWindowThreadProcessId($hwnd, [ref]$pid) | Out-Null
      $process = Get-Process -Id $pid -ErrorAction SilentlyContinue
      if ($process) { Write-Output $process.ProcessName }
    `;

    exec(`powershell -NoProfile -Command "${psScript.replace(/\n/g, ' ')}"`, (error, stdout) => {
      if (error) return;
      const processName = stdout.trim();
      if (processName && processName !== this.lastProcess) {
        this.lastProcess = processName;
        this.monitorManager.broadcastToAll('active-window-update', processName);
      }
    });
  }
}

module.exports = WorkspaceManager;
