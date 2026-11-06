// ============================================================
// Fullscreen Manager
// Hides the island on the display that has a real fullscreen app
// (games, video players, presentations). Other displays keep
// their islands visible.
// ============================================================

const { execFile } = require('child_process');
const { screen } = require('electron');

const CHECK_INTERVAL = 800;
const BOUNDS_TOLERANCE = 2;

// Shell/desktop windows can cover the screen but must never hide the island.
const IGNORED_CLASSES = new Set([
  'Progman',
  'WorkerW',
  'Shell_TrayWnd',
  'Shell_SecondaryTrayWnd',
  'DV2ControlHost',
  'Windows.UI.Core.CoreWindow',
  'MultitaskingViewFrame',
  'ForegroundStaging',
]);

const QUERY_SCRIPT = `
$ErrorActionPreference = 'SilentlyContinue'
Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public class IslandW32 {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr h, int index);
  [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr hwnd, int attr, out RECT pvAttribute, int cbAttribute);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
}
"@
$h = [IslandW32]::GetForegroundWindow()
if ($h -eq [IntPtr]::Zero) { Write-Output '0,0,0,0,,0'; exit }
# Prefer the DWM "visible" frame bounds: they exclude the invisible resize
# border and rounded-corner overshoot that make GetWindowRect overshoot the
# monitor by a few px. Fall back to GetWindowRect if DWM returns nothing.
$r = New-Object IslandW32+RECT
$ok = [IslandW32]::DwmGetWindowAttribute($h, 9, [ref]$r, 16)
if ($ok -ne 0 -or $r.Right -le $r.Left) {
  [IslandW32]::GetWindowRect($h, [ref]$r) | Out-Null
}
$sb = New-Object System.Text.StringBuilder 256
[IslandW32]::GetClassName($h, $sb, 256) | Out-Null
$style = [IslandW32]::GetWindowLong($h, -16)
$exStyle = [IslandW32]::GetWindowLong($h, -20)
Write-Output "$($r.Left),$($r.Top),$($r.Right),$($r.Bottom),$($sb.ToString()),$style,$exStyle"
`;

class FullscreenManager {
  constructor(monitorManager, configManager) {
    this.monitorManager = monitorManager;
    this.configManager = configManager;
    this.interval = null;
    this.hiddenDisplays = new Set();
    this.checking = false;
    this.failures = 0;
    this._pendingCount = 0;
    this._pendingHidden = false;
    // Called with a boolean: true when the island must suspend (game running).
    this.onHiddenChange = null;
  }

  start() {
    if (this.interval) return;
    this.checkFullscreen();
    this.interval = setInterval(() => this.checkFullscreen(), CHECK_INTERVAL);
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this._applyHidden(new Set());
  }

  checkFullscreen() {
    // Ignore the first couple of seconds after start: the desktop/foreground
    // window is still settling and can momentarily look like fullscreen.
    if (!this._startedAt) this._startedAt = Date.now();
    if (Date.now() - this._startedAt < 2000) return;
    if (this.configManager && this.configManager.get('hideFullscreen', true) === false) {
      this._applyHidden(new Set());
      return;
    }
    if (this.checking) return;
    this.checking = true;

    execFile(
      'powershell.exe',
      ['-NoProfile', '-NoLogo', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', QUERY_SCRIPT],
      { timeout: 2500, windowsHide: true },
      (error, stdout) => {
        this.checking = false;
        if (error || !stdout) {
          this._registerFailure();
          return;
        }

        const raw = stdout.trim().split(/\r?\n/).pop() || '';
        const parts = raw.split(',');
        if (parts.length < 4) {
          this._registerFailure();
          return;
        }

        const exStyle = Number.parseInt(parts.pop(), 10);
        const [left, top, right, bottom] = parts.slice(0, 4).map(Number);
        const style = Number.parseInt(parts.pop(), 10);
        const className = parts.slice(4).join(',').trim();
        // Ignore layered / tool windows: screenshot tools, overlays and
        // semi-transparent helpers often cover the screen without being a game.
        const WS_EX_LAYERED = 0x00080000;
        const WS_EX_TOOLWINDOW = 0x00000080;
        if ((exStyle & WS_EX_LAYERED) || (exStyle & WS_EX_TOOLWINDOW)) {
          this._applyHidden(new Set());
          return;
        }
        if (![left, top, right, bottom, style].every(Number.isFinite)) {
          this._registerFailure();
          return;
        }
        this.failures = 0;
        if (IGNORED_CLASSES.has(className)) {
          this._applyHidden(new Set());
          return;
        }

        const width = right - left;
        const height = bottom - top;
        if (width < 200 || height < 200) {
          this._applyHidden(new Set());
          return;
        }

        const display = screen.getDisplayMatching({ x: left, y: top, width, height });
        const b = display.bounds;

        // A window that fully covers the monitor is only treated as fullscreen
        // when it has no title bar (WS_CAPTION absent) — i.e. exclusive or
        // borderless fullscreen. A normal MAXIMIZED window still has a caption,
        // so it must NOT hide the island (this caused random disappearances).
        const WS_CAPTION = 0x00C00000;
        const WS_POPUP = 0x80000000;
        const hasCaption = (style & WS_CAPTION) === WS_CAPTION;
        const hasPopup = (style & WS_POPUP) !== 0;
        // Allow a slightly larger tolerance: DWM/DPI rounding can leave a few
        // px of gap even for a true fullscreen window.
        const coversMonitor =
          width >= b.width - 8 &&
          height >= b.height - 8 &&
          Math.abs(left - b.x) <= 8 &&
          Math.abs(top - b.y) <= 8;
        // Games (exclusive or borderless) are popup and/or captionless. A
        // normal MAXIMIZED app keeps a caption and no popup flag, so it will
        // not hide the island.
        const isFullscreen = coversMonitor && (hasPopup || !hasCaption);

        // Hysteresis: only flip the state after two consecutive samples agree.
        // This stops hide/show flapping when the foreground window is briefly
        // resized (Alt+Tab, transient overlays, maximize animations).
        if (isFullscreen === this._pendingHidden) {
          this._pendingCount += 1;
        } else {
          this._pendingHidden = isFullscreen;
          this._pendingCount = 1;
        }
        // Require TWO stable samples for BOTH hide and show. A single hide
        // sample used to fire on startup (the foreground window can briefly
        // report as captionless/fullscreen while the desktop is settling),
        // which hid the island immediately and made it "disappear". Two
        // samples = 1.2s of agreement, so a transient false positive is ignored.
        const needed = 2;
        if (this._pendingCount < needed) return;

        const target = isFullscreen ? new Set([display.id]) : new Set();
        if (
          target.size === this.hiddenDisplays.size &&
          [...target].every((id) => this.hiddenDisplays.has(id))
        ) {
          return; // No change — do not touch windows.
        }
        this._applyHidden(target);
      },
    );
  }

  _registerFailure() {
    this.failures += 1;
    // Never leave the island hidden forever if the detector stops working.
    if (this.failures >= 3) {
      this.failures = 0;
      this._applyHidden(new Set());
    }
  }

  _applyHidden(next) {
    let changed = false;
    const wasHidden = this.hiddenDisplays.size > 0;
    for (const id of this.hiddenDisplays) {
      if (!next.has(id)) {
        this.monitorManager.setDisplayHidden?.(id, false);
        const entry = this.monitorManager.windows?.get(id);
        if (entry && !entry.win.isDestroyed()) {
          try { entry.win.setAlwaysOnTop(true, 'screen-saver'); } catch {}
          try { entry.win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false }); } catch {}
        }
        changed = true;
      }
    }
    for (const id of next) {
      if (!this.hiddenDisplays.has(id)) {
        console.log(`[Istel] Fullscreen on display ${id}, island hidden.`);
        changed = true;
      }
      // Drop always-on-top so the island cannot float above an exclusive
      // fullscreen game, then hide it. Keep reapplying because a watchdog may
      // have recreated the window while the fullscreen app is still running.
      const entry = this.monitorManager.windows?.get(id);
      if (entry && !entry.win.isDestroyed()) {
        // Drop always-on-top so the island cannot float above an exclusive
        // fullscreen game, then hide it.
        try { entry.win.setAlwaysOnTop(false); } catch {}
      }
      this.monitorManager.setDisplayHidden?.(id, true);
    }
    this.hiddenDisplays = next;

    const hidden = next.size > 0;
    // Tell the renderer so it can play a smooth "suck into the notch" animation
    // before the window is actually hidden.
    if (changed) {
      this.monitorManager.broadcastToAll?.('island-fullscreen', { hidden });
    }
    // Freeze/resume background polling on EVERY real transition. The old code
    // only fired when the hidden SET changed, so a suspended state could get
    // stuck if the set was already empty (B3) — the island then stopped
    // receiving media updates until a restart.
    if (hidden !== wasHidden) {
      try { this.onHiddenChange?.(hidden); } catch (e) {
        console.log('[Fullscreen] onHiddenChange failed:', e.message);
      }
    }
  }
}

module.exports = FullscreenManager;
