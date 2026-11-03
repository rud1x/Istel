// ============================================================
// Monitor Manager
// Detects all connected displays and creates one frameless,
// transparent, always-on-top island window per monitor.
// Has a watchdog timer to auto-heal blank/crashed windows.
// ============================================================

const { BrowserWindow, screen } = require('electron');
const path = require('path');

const ISLAND_WIDTH = 520;
const ISLAND_HEIGHT = 320;
const PILL_TOP_MARGIN = 4; // px gap from top in pill mode

// How often to check that all windows are alive and visible (ms)
const WATCHDOG_INTERVAL = 3000;

class MonitorManager {
  constructor(isDev, configManager) {
    this.isDev = isDev;
    this.configManager = configManager;
    this.windows = new Map(); // displayId → { win, isLoaded, width, height }
    this._watchdogTimer = null;
    this.displayMode = this.configManager.get('displayMode', 'pill'); // 'pill' | 'attached'
    // Display the island lives on (display.id). null = primary display.
    this.targetDisplayId = this.configManager.get('islandDisplay', null);
  }

  // ----------------------------------------------------------
  // Target display: the chosen one if connected, else primary.
  // The saved choice is kept so the island returns when the
  // chosen display is reconnected.
  // ----------------------------------------------------------
  _targetDisplay() {
    if (this.targetDisplayId != null) {
      const found = screen.getAllDisplays().find((d) => d.id === Number(this.targetDisplayId));
      if (found) return found;
    }
    return screen.getPrimaryDisplay();
  }

  setTargetDisplay(id) {
    const next = id == null ? null : Number(id);
    const prevTarget = this._targetDisplay().id;
    this.targetDisplayId = next;
    if (this._targetDisplay().id !== prevTarget) this.rebuildWindows();
  }

  // ----------------------------------------------------------
  // Get / Set display mode and reposition all windows
  // ----------------------------------------------------------
  getDisplayMode() {
    return this.displayMode;
  }

  setDisplayMode(mode) {
    if (mode !== 'pill' && mode !== 'attached') return;
    this.displayMode = mode;
    this.configManager.set('displayMode', mode);
    this.repositionAll();
    this.broadcastToAll('display-mode-changed', mode);
  }

  // ----------------------------------------------------------
  // Create one island window for each connected display
  // ----------------------------------------------------------
  createIslandWindows() {
    this._createWindowForDisplay(this._targetDisplay());
    // Start watchdog after the window is created
    this._startWatchdog();
  }

  // ----------------------------------------------------------
  // Tear down all windows and recreate from scratch.
  // ----------------------------------------------------------
  rebuildWindows() {
    this._stopWatchdog();
    for (const [, entry] of this.windows) {
      if (!entry.win.isDestroyed()) entry.win.close();
    }
    this.windows.clear();
    this.createIslandWindows();
  }

  // ----------------------------------------------------------
  // Reposition all existing windows (e.g. resolution changed)
  // ----------------------------------------------------------
  repositionAll() {
    const displays = screen.getAllDisplays();
    const displayMap = new Map(displays.map((d) => [d.id, d]));
    for (const [id, entry] of this.windows) {
      const display = displayMap.get(id);
      if (display && !entry.win.isDestroyed()) {
        const w = entry.width || ISLAND_WIDTH;
        const h = entry.height || ISLAND_HEIGHT;
        const pos = this._calcPosition(display, w);
        entry.win.setBounds({ x: pos.x, y: pos.y, width: w, height: h });
      }
    }
  }

  // ----------------------------------------------------------
  // Resize a specific window (called by renderer via IPC) while
  // keeping it horizontally centered and top-anchored.
  // ----------------------------------------------------------
  setWindowSize(win, width, height) {
    if (!win || win.isDestroyed()) return;
    const w = Math.max(200, Math.round(width));
    const h = Math.max(40, Math.round(height));
    let entry = null;
    for (const [, e] of this.windows) {
      if (e.win === win) { entry = e; break; }
    }
    if (entry) {
      entry.width = w;
      entry.height = h;
      // Suppress focus-poll blur while the OS resizes the window: on Windows a
      // resize can transiently report isFocused() === false, which would make
      // the renderer collapse, resize again, reopen, and loop.
      entry._resizingUntil = Date.now() + 250;
    }
    const b = win.getBounds();
    if (b.width === w && b.height === h) return;
    const cx = b.x + b.width / 2;
    const targetX = Math.round(cx - w / 2);

    // Animate the window size over a few frames so the OS window grows in
    // step with the CSS spring/expand animation instead of jumping and
    // producing a jerky reveal.
    if (entry) {
      if (entry._resizeAnim) clearInterval(entry._resizeAnim);
      const startW = b.width;
      const startH = b.height;
      const startX = b.x;
      const startY = b.y;
      const STEPS = 8;
      let step = 0;
      entry._resizeAnim = setInterval(() => {
        if (win.isDestroyed()) { clearInterval(entry._resizeAnim); entry._resizeAnim = null; return; }
        step += 1;
        const t = Math.min(1, step / STEPS);
        const ease = 1 - Math.pow(1 - t, 3); // easeOutCubic
        const cw = Math.round(startW + (w - startW) * ease);
        const ch = Math.round(startH + (h - startH) * ease);
        const cxp = Math.round(startX + (targetX - startX) * ease);
        entry._resizingUntil = Date.now() + 250;
        win.setBounds({ x: cxp, y: startY, width: cw, height: ch });
        if (t >= 1) {
          clearInterval(entry._resizeAnim);
          entry._resizeAnim = null;
          entry._resizingUntil = Date.now() + 250;
        }
      }, 16);
      return;
    }

    win.setBounds({ x: targetX, y: b.y, width: w, height: h });
  }

  // ----------------------------------------------------------
  // Broadcast an IPC message to all island windows
  // ----------------------------------------------------------
  broadcastToAll(channel, data) {
    for (const [, entry] of this.windows) {
      if (!entry.win.isDestroyed() && entry.win.webContents && entry.isLoaded) {
        entry.win.webContents.send(channel, data);
      }
    }
  }

  // ----------------------------------------------------------
  // Toggle visibility of all islands
  // ----------------------------------------------------------
  toggleVisibility() {
    for (const [, entry] of this.windows) {
      if (!entry.win.isDestroyed()) {
        if (entry.win.isVisible()) entry.win.hide();
        else {
          entry.fullscreenHidden = false;
          entry.win.show();
        }
      }
    }
  }

  // ----------------------------------------------------------
  // Hide/show one display's island because of a fullscreen app.
  // The flag keeps the watchdog from resurrecting it.
  // ----------------------------------------------------------
  setDisplayHidden(displayId, hidden) {
    if (!this.hiddenDisplays) this.hiddenDisplays = new Set();
    if (hidden) this.hiddenDisplays.add(displayId);
    else this.hiddenDisplays.delete(displayId);
    const entry = this.windows.get(displayId);
    if (!entry) return;
    entry.fullscreenHidden = hidden;
    if (entry.win.isDestroyed()) return;
    if (hidden) {
      // Let the renderer play its "suck into the notch" animation first.
      if (entry.win.isVisible()) {
        clearTimeout(entry._hideTimer);
        entry._hideTimer = setTimeout(() => {
          if (!entry.win.isDestroyed() && entry.fullscreenHidden) entry.win.hide();
        }, 430);
      }
    } else {
      // Fullscreen ended: always cancel any pending hide and make sure the
      // window is visible again.
      clearTimeout(entry._hideTimer);
      if (!entry.win.isVisible() && !entry._trayHidden) entry.win.show();
    }
  }

  // ----------------------------------------------------------
  // Watchdog: every WATCHDOG_INTERVAL ms, check all windows
  // are alive and visible. Reload or recreate if not.
  // ----------------------------------------------------------
  _startWatchdog() {
    this._watchdogTimer = setInterval(() => {
      const target = this._targetDisplay();

      // The island is on the wrong display (e.g. the chosen display was
      // reconnected while it sat on the primary one) — move it.
      for (const [id] of this.windows) {
        if (id !== target.id) {
          console.log(`[Istel][Watchdog] Island on display ${id}, target is ${target.id}, rebuilding...`);
          this.rebuildWindows();
          return;
        }
      }

      // Check each tracked window
      for (const [id, entry] of this.windows) {
        const { win } = entry;
        if (win.isDestroyed()) {
          // Window is gone — try to recreate
          const display = id === target.id ? target : null;
          if (display) {
            console.log(`[Istel][Watchdog] Window for display ${id} destroyed, recreating...`);
            this.windows.delete(id);
            this._createWindowForDisplay(display);
          }
        } else if (!win.isVisible() && !entry.fullscreenHidden && !entry._trayHidden) {
          // Window exists but is hidden — show it (unless hidden by fullscreen
          // or manually via the tray, both of which are intentional).
          console.log(`[Istel][Watchdog] Window for display ${id} hidden, showing...`);
          win.show();
        }
        // Self-heal a window that never finished loading (blank/stuck renderer).
        if (!entry.isLoaded && entry._loadStartedAt && Date.now() - entry._loadStartedAt > 15000) {
          console.log(`[Istel][Watchdog] Window for display ${id} stuck loading, reloading...`);
          entry._loadStartedAt = Date.now();
          try { win.webContents.reload(); } catch {}
        }
      }

      // The target display has no window (e.g. it was never created)
      if (!this.windows.has(target.id)) {
        console.log(`[Istel][Watchdog] No window for display ${target.id}, creating...`);
        this._createWindowForDisplay(target);
      }
    }, WATCHDOG_INTERVAL);
  }

  _stopWatchdog() {
    if (this._watchdogTimer) {
      clearInterval(this._watchdogTimer);
      this._watchdogTimer = null;
    }
  }

  // ----------------------------------------------------------
  // Internal: create a single island window on a given display
  // ----------------------------------------------------------
  _createWindowForDisplay(display) {
    const pos = this._calcPosition(display);

    const win = new BrowserWindow({
      x: pos.x,
      y: pos.y,
      width: ISLAND_WIDTH,
      height: ISLAND_HEIGHT,
      frame: false,
      transparent: true, // Прозрачный фон для эффекта острова
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      focusable: true,
      hasShadow: false,
      roundedCorners: true,
      icon: path.join(__dirname, '..', 'assets', 'icon.png'),
      show: false, // Don't show until content is loaded
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        // --- ОПТИМИЗАЦИЯ ---
        backgroundThrottling: true, // Экономия CPU, когда окно скрыто
        offscreen: false,           // Отключаем offscreen-рендеринг
        enableBlinkFeatures: '',    // Отключаем ненужные фичи Blink
      },
    });

    const wasHidden = this.hiddenDisplays?.has(display.id) || false;
    const entry = { win, isLoaded: false, fullscreenHidden: wasHidden, width: ISLAND_WIDTH, height: ISLAND_HEIGHT };
    this.windows.set(display.id, entry);

    const loadContent = () => {
      if (win.isDestroyed()) return;
      const devPort = this.configManager.get('ports', { devServer: 5173 }).devServer || 5173;
      entry.isLoaded = false;
      entry._loadStartedAt = Date.now();
      if (this.isDev) {
        win.loadURL(`http://localhost:${devPort}`).catch(() => {
          setTimeout(() => loadContent(), 2000);
        });
      } else {
        win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
      }
    };

    win.setAlwaysOnTop(true, 'floating');
    // NOTE: deliberately NOT using visibleOnFullScreen — it forces the island
    // above exclusive-fullscreen games, so hide() cannot get it out of the way.
    // Pass it explicitly so a future Electron default cannot re-enable it (R15).
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false });

    loadContent();

    // Surface renderer console errors in the terminal so we can debug
    // crashes that otherwise only show in DevTools.
    win.webContents.on('console-message', (_e, level, message, line, sourceId) => {
      if (level >= 2) {
        console.log(`[Renderer][${level}] ${message} (${sourceId}:${line})`);
        try {
          const { app } = require('electron');
          const fs = require('fs');
          const path = require('path');
          fs.appendFileSync(path.join(app.getPath('userData'), 'renderer-error.log'), `${new Date().toISOString()} [${level}] ${message} (${sourceId}:${line})\n`);
        } catch {}
      }
    });
    win.webContents.on('render-process-gone', (_e, details) => {
      console.log('[Renderer] process gone:', details.reason);
    });

    win.webContents.on('did-finish-load', () => {
      entry.isLoaded = true;
      entry._loadStartedAt = 0;
      win.setIgnoreMouseEvents(true, { forward: true });
      // Re-sync the fullscreen flag with the authoritative hidden-set so a
      // stale flag cannot keep a freshly-loaded window permanently hidden.
      entry.fullscreenHidden = this.hiddenDisplays ? this.hiddenDisplays.has(display.id) : false;
      if (!entry.fullscreenHidden && !entry._trayHidden) {
        win.show(); // Now show the window
        win.moveTop(); // Принудительно на передний план
        win.focus(); // Фокус на окно
      }
    });

    // When the island window loses focus (user clicked another app, the
    // desktop, etc.) tell the renderer so it can collapse if it is expanded.
    // The renderer decides whether to act — we always notify.
    //
    // 'blur' alone is unreliable for always-on-top/skip-taskbar windows on
    // Windows, so we also poll isFocused() as a fallback. We track the last
    // focused state to only emit once per transition.
    let wasFocused = true;
    win.on('blur', () => {
      wasFocused = false;
      if (entry && entry._resizingUntil && Date.now() < entry._resizingUntil) return;
      if (!win.isDestroyed() && win.webContents) {
        win.webContents.send('island-blur');
      }
    });
    win.on('focus', () => {
      wasFocused = true;
    });

    const focusPoll = setInterval(() => {
      if (win.isDestroyed()) {
        clearInterval(focusPoll);
        return;
      }
      if (!win.isVisible()) return;
      const focused = win.isFocused();
      if (!focused && wasFocused) {
        wasFocused = false;
        // Ignore transient focus loss caused by our own resize.
        if (entry && entry._resizingUntil && Date.now() < entry._resizingUntil) return;
        if (win.webContents) win.webContents.send('island-blur');
      } else if (focused && !wasFocused) {
        wasFocused = true;
      }
    }, 300);
    win.on('closed', () => clearInterval(focusPoll));

    // Catch-all: if load fails, retry
    win.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
      if (errorCode === -3) return; // Aborted (normal during reload)
      console.log(`[Istel] Load failed (${errorCode}: ${errorDescription}), retrying in 2s...`);
      entry.isLoaded = false;
      setTimeout(() => loadContent(), 2000);
    });

    // Renderer process crashed — reload immediately
    win.webContents.on('render-process-gone', (event, details) => {
      console.log(`[Istel] Renderer crashed (${details.reason}), reloading...`);
      entry.isLoaded = false;
      setTimeout(() => {
        if (!win.isDestroyed()) loadContent();
      }, 500);
    });

    // Window became unresponsive — reload after short delay
    win.webContents.on('unresponsive', () => {
      console.log('[Istel] Window unresponsive, reloading...');
      setTimeout(() => {
        if (!win.isDestroyed()) win.reload();
      }, 1500);
    });

    win.webContents.on('responsive', () => {
      if (!win.isDestroyed()) {
        win.setIgnoreMouseEvents(true, { forward: true });
      }
    });

    // Window was closed — remove from map (watchdog will recreate if display still exists)
    // Only drop our own entry: during rebuildWindows() a new window for the
    // same display may already be registered when this async event fires.
    win.on('closed', () => {
      if (this.windows.get(display.id)?.win === win) this.windows.delete(display.id);
    });
  }

  // ----------------------------------------------------------
  // Calculate the centered-top position for a given display
  // ----------------------------------------------------------
  _calcPosition(display, winWidth = ISLAND_WIDTH) {
    if (this.displayMode === 'attached') {
      // Attached: flush to the absolute top of the display (bounds, not workArea)
      const { x, y, width } = display.bounds;
      return {
        x: Math.round(x + (width - winWidth) / 2),
        y: y,
      };
    }
    // Pill: use workArea with a small top margin
    const { x, y, width } = display.workArea;
    return {
      x: Math.round(x + (width - winWidth) / 2),
      y: y,
    };
  }
}

module.exports = MonitorManager;
