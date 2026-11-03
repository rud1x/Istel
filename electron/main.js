// ============================================================
// Istel — Main Process
// ============================================================

const { app, ipcMain, screen, shell, BrowserWindow, dialog, session, desktopCapturer } = require('electron');
const path = require('path');
const ConfigManager = require('./configManager');
const MonitorManager = require('./monitorManager');
const MediaManager = require('./mediaManager');
const CalendarManager = require('./calendarManager');
const TrayManager = require('./trayManager');
const StartupManager = require('./startupManager');
const PrivacyManager = require('./privacyManager');
const ClipboardManager = require('./clipboardManager');
const FullscreenManager = require('./fullscreenManager');
const WorkspaceManager = require('./workspaceManager');
const SystemEventsManager = require('./systemEventsManager');
const SystemInfoManager = require('./systemInfoManager');
const VolumeManager = require('./volumeManager');
const BatteryManager = require('./batteryManager');
const NotificationManager = require('./notificationManager');
const LyricsManager = require('./lyricsManager');
const SettingsWindow = require('./settingsWindow');
const DownloadManager = require('./downloadManager');
const SuspendController = require('./suspendController');
const PomodoroManager = require('./pomodoroManager');
const DiscordManager = require('./discordManager');
const UpdateManager = require('./updateManager');

// ------------------------------------------------------------------
// Process model tuning (before app.whenReady).
// Chromium is multi-process by nature, but we can collapse the extra
// helpers so Task Manager shows (almost) a single app process:
//  - in-process GPU (no separate GPU process)
//  - no zygote / no spare renderer
// Set ISTEL_SINGLE_PROCESS=1 to force true single-process mode (may
// disable transparent/backdrop-blur on some GPUs).
// ------------------------------------------------------------------
try {
  // Keep the process count lean but stable. NOTE: 'single-process' crashes
  // Electron on Windows (transparent windows + GPU) and 'in-process-gpu'
  // renders a blank window under file:// (packaged), so we only drop the
  // spare renderer here. The renderer stays a normal sandboxed process.
  app.commandLine.appendSwitch('disable-features', 'SpareRendererForSitePerProcess');
} catch (e) {
  console.log('[Main] process-model switches failed:', e.message);
}

// Name + taskbar/Process Manager identity so Windows shows "Istel" with our
// icon instead of the generic "Electron" entry.
app.setName('Istel');
try { app.setAppUserModelId('com.istel.app'); } catch {}

// Treat local (unpackaged) runs as development
const isDev = !app.isPackaged;

// Global references
let configManager = null;
let startupManager = null;
let monitorManager = null;
let mediaManager = null;
let calendarManager = null;
let trayManager = null;
let privacyManager = null;
let clipboardManager = null;
let fullscreenManager = null;
let workspaceManager = null;
let systemEventsManager = null;
let systemInfoManager = null;
let volumeManager = null;
let batteryManager = null;
let notificationManager = null;
let lyricsManager = null;
let settingsWindow = null;
let downloadManager = null;
let suspendController = null;
let pomodoroManager = null;
let discordManager = null;
let updateManager = null;

// Separate media poller used only during fullscreen, feeding Discord RPC
// without touching the game's audio endpoint.
let discordOnlyPollTimer = null;
function startDiscordOnlyPolling() {
  if (!discordManager || !mediaManager) return;
  if (discordOnlyPollTimer) return;
  const tick = () => {
    // forceUpdate() queries SMTC without starting/stopping the audio endpoint
    // poll, and routes through the same Discord update path.
    mediaManager.forceUpdate()
      .then((state) => {
        if (state) discordManager.update(state);
      })
      .catch(() => {});
  };
  tick();
  discordOnlyPollTimer = setInterval(tick, 2000);
}
function stopDiscordOnlyPolling() {
  if (discordOnlyPollTimer) {
    clearInterval(discordOnlyPollTimer);
    discordOnlyPollTimer = null;
  }
}

// Parse CLI Flags
const isStartMinimized = process.argv.includes('--start-minimized');

// Single source of truth for user-facing settings and their defaults.
const SETTINGS_DEFAULTS = {
  displayMode: 'pill',
  expandBy: 'Наведением',
  expandDelay: 110,
  openTab: 'Последнюю вкладку',
  battery: true,
  capslock: true,
  pillLyric: true,
  hideFullscreen: true,
  theme: 'Классика',
  accent: '#ffffff',
  accentFollowTrack: true,
  roundness: 75,
  edgeFade: 100,
  lightBorder: true,
  shadow: true,
  scale: 100,
  anim: 'Капля',
  wavePower: 100,
  cursorPull: 100,
  playerBg: 'Без фона',
  playerAnim: 'Только пульс',
  syncLyrics: true,
  notifDuration: 1.8,
  volumeNotif: true,
  batteryNotif: true,
  capsNotif: true,
  clipNotif: true,
  hiddenTabs: [],
  expBeats: true,
  beatPower: 100,
  expGlass: false,
  city: '',
  playerVolume: 100,
  downloadNotif: true,
  pomoWork: 25,
  pomoShort: 5,
  pomoLong: 15,
  pomoUntilLong: 4,
  pomoSound: true,
  pomoDND: false,
  pomoAutoNext: true,
  discordRPC: false,
  islandDisplay: null, // display.id the island is shown on; null = primary
};

function getAllSettings() {
  const out = {};
  for (const [key, fallback] of Object.entries(SETTINGS_DEFAULTS)) {
    out[key] = configManager.get(key, fallback);
  }
  return out;
}

function broadcastSettings(payload) {
  monitorManager?.broadcastToAll('settings-updated', payload);
  settingsWindow?.broadcast('settings-updated', payload);
}

function bootstrap() {
  // 1. Create config manager now that app is ready
  configManager = new ConfigManager();

  // 2. Create startup manager and verify
  startupManager = new StartupManager();
  const runAtStartup = configManager.get('runAtStartup', false);
  startupManager.verify(runAtStartup);

  // 3. Create island windows
  monitorManager = new MonitorManager(isDev, configManager);
  monitorManager.createIslandWindows();

  // 3. Start polling services
  mediaManager = new MediaManager();
  lyricsManager = new LyricsManager(monitorManager);
  // Single source of truth for the media pipeline. SuspendController must
  // restart polling with THIS callback, otherwise the Discord pipeline is
  // silently dropped after the first fullscreen suspend (B1).
  const onMediaState = (mediaState) => {
    monitorManager.broadcastToAll('media-update', mediaState);
    lyricsManager.update(mediaState);
    discordManager?.update(mediaState);
  };
  mediaManager.startPolling(onMediaState);

  calendarManager = new CalendarManager();
  
  if (configManager.get('enableCalendarIntegration', false)) {
    calendarManager.startPolling((events) => {
      monitorManager.broadcastToAll('calendar-update', events);
    });
  }

  privacyManager = new PrivacyManager();
  privacyManager.setEnabled(configManager.get('enablePrivacyIndicators', true));
  privacyManager.startPolling((privacyState) => {
    monitorManager.broadcastToAll('privacy-update', privacyState);
  });

  clipboardManager = new ClipboardManager();
  clipboardManager.startPolling((clipboardState) => {
    monitorManager.broadcastToAll('clipboard-update', clipboardState);
    monitorManager.broadcastToAll('clipboard-history', clipboardManager.getHistory());
  });

  // Hide the island while a true fullscreen app is in the foreground.
  fullscreenManager = new FullscreenManager(monitorManager, configManager);
  fullscreenManager.start();

  workspaceManager = new WorkspaceManager(monitorManager);
  workspaceManager.start();

  systemEventsManager = new SystemEventsManager(monitorManager);
  systemEventsManager.start();

  systemInfoManager = new SystemInfoManager(monitorManager);
  const savedCity = configManager.get('city', '');
  if (savedCity) systemInfoManager.city = savedCity;
  systemInfoManager.start();

  volumeManager = new VolumeManager(monitorManager);
  volumeManager.start();
  // NOTE: do not force playerVolume onto the system at launch — touching the
  // audio endpoint unprompted can disturb other apps / exclusive-mode games.
  // It is applied only when the user actually moves the slider.

  batteryManager = new BatteryManager(monitorManager);
  batteryManager.start();

  notificationManager = new NotificationManager(monitorManager);
  notificationManager.start();

  downloadManager = new DownloadManager(monitorManager);
  downloadManager.start();

  pomodoroManager = new PomodoroManager(monitorManager, configManager);
  pomodoroManager.start();

  discordManager = new DiscordManager(configManager);
  discordManager.start();

  updateManager = new UpdateManager(monitorManager, app);
  updateManager.start();

  // Wire fullscreen detection to a global suspend (freeze every polling
  // service so a game is never disturbed: no audio touch, no CPU churn).
  suspendController = new SuspendController();
  suspendController.register('media', mediaManager, () => mediaManager.startPolling(onMediaState));
  // Discord Rich Presence must keep tracking the track during fullscreen too.
  // We cannot reuse mediaManager (its SMTC poll touches the audio endpoint and
  // is suspended so a game keeps exclusive audio), so we run a SEPARATE, light
  // poller that only feeds Discord. It is not registered with SuspendController
  // and is started/stopped by the fullscreen transition itself.
  startDiscordOnlyPolling();
  suspendController.register('volume', volumeManager);
  suspendController.register('systemInfo', systemInfoManager);
  suspendController.register('clipboard', clipboardManager, () => clipboardManager.startPolling((clipboardState) => {
    monitorManager.broadcastToAll('clipboard-update', clipboardState);
    monitorManager.broadcastToAll('clipboard-history', clipboardManager.getHistory());
  }));
  suspendController.register('privacy', privacyManager, () => privacyManager.startPolling((privacyState) => {
    monitorManager.broadcastToAll('privacy-update', privacyState);
  }));
  suspendController.register('battery', batteryManager);
  suspendController.register('workspace', workspaceManager);
  suspendController.register('systemEvents', systemEventsManager);
  if (configManager.get('enableCalendarIntegration', false)) {
    suspendController.register('calendar', calendarManager, () => calendarManager.startPolling((events) => {
      monitorManager.broadcastToAll('calendar-update', events);
    }));
  }
  fullscreenManager.onHiddenChange = (hidden) => {
    suspendController.setSuspended(hidden);
    // While the game owns the audio device we switch to the Discord-only
    // poller; on resume the normal pipeline takes over again.
    if (hidden) startDiscordOnlyPolling();
    else stopDiscordOnlyPolling();
  };

  settingsWindow = new SettingsWindow(isDev);

  // 4. System tray
  trayManager = new TrayManager(app, monitorManager, configManager, startupManager, settingsWindow);

  // 5. Display change listeners
  screen.on('display-added', () => {
    monitorManager.rebuildWindows();
    settingsWindow?.broadcast('displays-changed');
  });
  screen.on('display-removed', () => {
    monitorManager.rebuildWindows();
    settingsWindow?.broadcast('displays-changed');
  });
  screen.on('display-metrics-changed', () => monitorManager.repositionAll());

  // Handle minimized launch
  if (isStartMinimized) {
    // In start-minimized mode, we don't show windows initially if they were supposed to be hidden.
    // However, Dynamic Island is always-on-top but can be collapsed.
    // We'll let the renderer handle the initial collapsed state based on this flag if needed.
    monitorManager.broadcastToAll('startup-minimized', true);
  }
}

app.whenReady().then(() => {
  // Allow the renderer to capture system audio (WASAPI loopback) so the
  // music visualizer can compute a real FFT instead of a fake animation.
  try {
    session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
      desktopCapturer.getSources({ types: ['screen'] }).then((sources) => {
        // First screen as a loopback audio+video source; we only use audio.
        callback({ video: sources[0], audio: 'loopback' });
      }).catch(() => callback({}));
    }, { useSystemPicker: false });
  } catch (e) {
    console.log('[Main] setDisplayMediaRequestHandler failed:', e.message);
  }

  bootstrap();
});

// Second instance handling
app.on('second-instance', () => {
  if (monitorManager) {
    monitorManager.windows.forEach(entry => {
      if (!entry.win.isDestroyed()) {
        entry.win.show();
        entry.win.focus();
      }
    });
  }
});

// IPC Handlers
ipcMain.handle('get-startup-status', () => {
  return {
    isDev,
    configEnabled: configManager.get('runAtStartup', false),
    systemStatus: startupManager.checkStartupStatus(),
    exePath: app.getPath('exe')
  };
});

ipcMain.handle('toggle-startup', (_event, enabled) => {
  if (!app.isPackaged) return { success: false, error: 'Startup toggle only available in production' };
  
  configManager.set('runAtStartup', enabled);
  if (enabled) {
    return startupManager.enable();
  } else {
    return startupManager.disable();
  }
});

ipcMain.handle('test-startup', () => {
  // Simulation: relaunch app with --start-minimized
  const { spawn } = require('child_process');
  spawn(app.getPath('exe'), ['--start-minimized'], {
    detached: true,
    stdio: 'ignore'
  }).unref();
  return { success: true };
});

ipcMain.handle('get-calendar-status', () => {
  return configManager.get('enableCalendarIntegration', false);
});

ipcMain.handle('toggle-calendar-integration', (_event, enabled) => {
  configManager.set('enableCalendarIntegration', enabled);
  if (enabled) {
    calendarManager.startPolling((events) => {
      monitorManager.broadcastToAll('calendar-update', events);
    });
  } else {
    calendarManager.stopPolling();
    // Also clear existing events on frontend
    monitorManager.broadcastToAll('calendar-update', []);
  }
});

ipcMain.handle('get-privacy-status', () => {
  return configManager.get('enablePrivacyIndicators', true);
});

ipcMain.handle('toggle-privacy-indicators', (_event, enabled) => {
  configManager.set('enablePrivacyIndicators', enabled);
  privacyManager?.setEnabled(enabled);
});

ipcMain.handle('get-privacy-state', () => {
  return privacyManager?.getCurrentState() || { camera: [], microphone: [] };
});

// Media/Calendar Handlers (Keep existing)
ipcMain.handle('media-play-pause', () => mediaManager?.sendCommand('play-pause'));
ipcMain.handle('media-next', () => mediaManager?.sendCommand('next'));
ipcMain.handle('media-previous', () => mediaManager?.sendCommand('previous'));
ipcMain.handle('get-media-state', () => mediaManager?.getCurrentState() || null);
ipcMain.handle('force-media-update', () => mediaManager?.forceUpdate() || null);
ipcMain.handle('open-settings', () => settingsWindow?.open());

// Open the music source app (clicked album art). Best-effort: map known
// package families to executables and try to launch them.
ipcMain.handle('open-source-app', (_event, sourceId) => {
  try {
    const s = String(sourceId || '').toLowerCase();
    const targets = [];
    if (s.includes('spotify')) targets.push({ cmd: 'start', args: ['spotify:'] });
    else if (s.includes('yandex')) targets.push({ cmd: 'start', args: ['yandexmusic://'] });
    else if (s.includes('chrome')) targets.push({ cmd: 'start', args: ['chrome'] });
    else if (s.includes('msedge')) targets.push({ cmd: 'start', args: ['msedge'] });
    else if (s.includes('firefox')) targets.push({ cmd: 'start', args: ['firefox'] });
    // Fallback: show the app id text (do nothing harmful).
    if (!targets.length) return false;
    const { spawn } = require('child_process');
    spawn('cmd', ['/c', 'start', '', targets[0].args[0]], { detached: true, stdio: 'ignore' }).unref();
    return true;
  } catch (e) {
    return false;
  }
});
ipcMain.handle('open-path', (_event, filePath) => {
  shell.openPath(filePath);
});

// Open a URL in the user's default browser. shell.openPath only opens local
// files, so it silently fails on https:// links (the update banner's
// "Download" button was dead because of this).
ipcMain.handle('open-external', (_event, url) => {
  try {
    if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) return false;
    shell.openExternal(url);
    return true;
  } catch {
    return false;
  }
});

ipcMain.handle('shelf-save', (_event, items) => {
  try {
    const fs = require('fs');
    const path = require('path');
    const filePath = path.join(app.getPath('userData'), 'shelf.json');
    fs.writeFileSync(filePath, JSON.stringify(items), 'utf8');
    return true;
  } catch (e) {
    return false;
  }
});

ipcMain.handle('shelf-load', () => {
  try {
    const fs = require('fs');
    const path = require('path');
    const filePath = path.join(app.getPath('userData'), 'shelf.json');
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
    return [];
  } catch (e) {
    return [];
  }
});

// Return a data URL thumbnail for image files on the shelf (<= 512 KB).
// Returns null for non-images or oversized files.
ipcMain.handle('shelf-thumbnail', (_event, filePath) => {
  try {
    const fs = require('fs');
    const path = require('path');
    if (!filePath) return null;
    const ext = (path.extname(filePath) || '').toLowerCase();
    const mime = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.bmp': 'image/bmp',
      '.svg': 'image/svg+xml',
    }[ext];
    if (!mime) return null;
    const stat = fs.statSync(filePath);
    if (!stat.isFile() || stat.size > 512 * 1024) return null;
    const buf = fs.readFileSync(filePath);
    return `data:${mime};base64,${buf.toString('base64')}`;
  } catch (e) {
    return null;
  }
});
ipcMain.handle('media-seek', (_event, pos) => mediaManager?.seekTo(pos));
ipcMain.handle('get-calendar-events', () => calendarManager?.getEvents() || []);

// ---- Clipboard history ----
ipcMain.handle('clipboard-get-history', () => clipboardManager?.getHistory() || []);
ipcMain.handle('clipboard-paste', (_event, id) => clipboardManager?.pasteItem(id) || false);
ipcMain.handle('clipboard-delete', (_event, id) => {
  const h = clipboardManager?.deleteItem(id) || [];
  monitorManager?.broadcastToAll('clipboard-history', h);
  return h;
});
ipcMain.handle('clipboard-clear', () => {
  const h = clipboardManager?.clear() || [];
  monitorManager?.broadcastToAll('clipboard-history', h);
  return h;
});
ipcMain.handle('clipboard-save-image', async (_event, id) => {
  try {
    const fs = require('fs');
    const item = clipboardManager?.getHistory().find((h) => h.id === id);
    if (!item || !item.imageDataUrl) return false;
    const base64 = item.imageDataUrl.split(',')[1];
    if (!base64) return false;
    const result = await dialog.showSaveDialog({
      title: 'Сохранить изображение',
      defaultPath: 'island-image.png',
      filters: [{ name: 'PNG', extensions: ['png'] }],
    });
    if (result.canceled || !result.filePath) return false;
    fs.writeFileSync(result.filePath, Buffer.from(base64, 'base64'));
    return true;
  } catch (e) {
    return false;
  }
});

// Display Mode Handlers
ipcMain.handle('get-battery', () => batteryManager?.getState() || null);

ipcMain.handle('set-volume', (_event, percent) => volumeManager?.setLevel(percent));
ipcMain.handle('volume-stop', () => { volumeManager?.stop?.(); return true; });
ipcMain.handle('volume-start', () => { volumeManager?.start?.(); return true; });
ipcMain.handle('get-downloads', () => downloadManager?.getItems() || []);
ipcMain.handle('update-check', () => updateManager?.check() || null);
ipcMain.handle('update-state', () => updateManager?.getState() || null);

// ---- Pomodoro ----
ipcMain.handle('pomodoro-get-state', () => pomodoroManager?.getState() || null);
ipcMain.handle('pomodoro-start', () => pomodoroManager?.startSession() || null);
ipcMain.handle('pomodoro-pause', () => pomodoroManager?.pause() || null);
ipcMain.handle('pomodoro-reset', () => pomodoroManager?.reset() || null);

ipcMain.handle('pinned-load', () => {
  try {
    const fs = require('fs');
    const path = require('path');
    const filePath = path.join(app.getPath('userData'), 'pinned.json');
    if (fs.existsSync(filePath)) return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return [];
  } catch (e) { return []; }
});
ipcMain.handle('pinned-save', (_event, items) => {
  try {
    const fs = require('fs');
    const path = require('path');
    const filePath = path.join(app.getPath('userData'), 'pinned.json');
    fs.writeFileSync(filePath, JSON.stringify(items), 'utf8');
    return true;
  } catch (e) { return false; }
});

ipcMain.handle('pick-shortcut', async () => {
  try {
    const result = await dialog.showOpenDialog({
      title: 'Выберите объект для ярлыка',
      properties: ['openFile'],
      filters: [
        { name: 'Все файлы', extensions: ['*'] },
      ],
    });
    if (result.canceled || !result.filePaths?.length) return null;
    const p = result.filePaths[0];
    const path = require('path');
    const fs = require('fs');
    let size = 0;
    try { size = fs.statSync(p).size; } catch {}
    return {
      id: `shelf_${Date.now()}`,
      name: path.basename(p),
      path: p,
      ext: path.extname(p).replace('.', '').toLowerCase(),
      size,
      addedAt: Date.now(),
    };
  } catch (e) {
    return null;
  }
});

ipcMain.handle('settings-get-all', () => getAllSettings());
ipcMain.handle('settings-get-defaults', () => ({ ...SETTINGS_DEFAULTS }));
ipcMain.handle('settings-set', (_event, key, value) => {
  if (!Object.prototype.hasOwnProperty.call(SETTINGS_DEFAULTS, key)) return false;
  configManager.set(key, value);
  broadcastSettings({ key, value });

  // Apply behavioural settings immediately, without a restart.
  if (key === 'hideFullscreen') {
    if (value === false) fullscreenManager?.stop?.();
    else fullscreenManager?.start?.();
  }
  if (key === 'islandDisplay') {
    monitorManager?.setTargetDisplay(value);
  }
  if (key === 'discordRPC') {
    discordManager?.setEnabled(value);
    if (value) discordManager?.update(mediaManager?.getCurrentState());
  }
  if (key.startsWith('pomo')) {
    pomodoroManager?.applySettings?.();
  }
  return true;
});

ipcMain.handle('set-weather-city', (_event, city) => {
  configManager.set('city', city || '');
  systemInfoManager?.setCity(city);
  return true;
});

ipcMain.handle('get-displays', () => {
  const primaryId = screen.getPrimaryDisplay().id;
  return screen.getAllDisplays().map((d, i) => ({
    id: d.id,
    label: d.label || `Монитор ${i + 1}`,
    width: d.size.width,
    height: d.size.height,
    primary: d.id === primaryId,
  }));
});

ipcMain.handle('get-display-mode',() => monitorManager?.getDisplayMode() || 'pill');
ipcMain.handle('set-display-mode', (_event, mode) => {
  monitorManager?.setDisplayMode(mode);
  settingsWindow?.broadcast('display-mode-changed', mode);
  return mode;
});

ipcMain.on('set-window-size', (event, width, height) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win || win.isDestroyed()) return;
  // Delegate to monitorManager so it remembers the size and keeps it on
  // reposition (display mode switch / resolution change).
  if (monitorManager?.setWindowSize) {
    monitorManager.setWindowSize(win, width, height);
    return;
  }
  // Fallback: keep the top-center anchored so the bar grows/shrinks symmetrically.
  const w = Math.max(200, Math.round(width));
  const h = Math.max(40, Math.round(height));
  const b = win.getBounds();
  if (b.width === w && b.height === h) return;
  const cx = b.x + b.width / 2;
  win.setBounds({ x: Math.round(cx - w / 2), y: b.y, width: w, height: h });
});

ipcMain.handle('get-window-bounds', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win || win.isDestroyed()) return null;
  return win.getBounds();
});

ipcMain.on('set-ignore-mouse-events', (event, ignore, options) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  win?.setIgnoreMouseEvents(ignore, options);
});

app.on('window-all-closed', () => {
  // Stay running in tray
});

app.on('before-quit', () => {
  mediaManager?.stopPolling();
  calendarManager?.stopPolling();
  privacyManager?.stopPolling();
  clipboardManager?.stopPolling();
  fullscreenManager?.stop();
  workspaceManager?.stop();
  systemEventsManager?.stop();
  notificationManager?.stop();
});
