// ============================================================
// Preload — Secure IPC bridge between renderer and main process
// ============================================================

const { contextBridge, ipcRenderer, webUtils } = require('electron');

// Batched event emitter: coalesces rapid events into a single callback per frame.
function batchedListener(channel, callback) {
  let pending = null;
  let scheduled = false;
  const flush = () => {
    scheduled = false;
    if (pending === null) return;
    const value = pending;
    pending = null;
    callback(value);
  };
  const handler = (_event, data) => {
    pending = data;
    if (!scheduled) {
      scheduled = true;
      requestAnimationFrame(flush);
    }
  };
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

contextBridge.exposeInMainWorld('electronAPI', {
  // ---- Media Controls ----
  mediaPlayPause: () => ipcRenderer.invoke('media-play-pause'),
  mediaNext: () => ipcRenderer.invoke('media-next'),
  mediaPrevious: () => ipcRenderer.invoke('media-previous'),
  mediaSeek: (posSeconds) => ipcRenderer.invoke('media-seek', posSeconds),
  getMediaState: () => ipcRenderer.invoke('get-media-state'),
  forceMediaUpdate: () => ipcRenderer.invoke('force-media-update'),
  openSettings: () => ipcRenderer.invoke('open-settings'),
  openPath: (path) => ipcRenderer.invoke('open-path', path),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  shelfSave: (items) => ipcRenderer.invoke('shelf-save', items),
  shelfLoad: () => ipcRenderer.invoke('shelf-load'),
  shelfThumbnail: (path) => ipcRenderer.invoke('shelf-thumbnail', path),
  getPathForFile: (file) => webUtils.getPathForFile(file),
  onVolumeState: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('volume-state', handler);
    return () => ipcRenderer.removeListener('volume-state', handler);
  },
  setVolume: (percent) => ipcRenderer.invoke('set-volume', percent),
  volumeStop: () => ipcRenderer.invoke('volume-stop'),
  volumeStart: () => ipcRenderer.invoke('volume-start'),
  getDownloads: () => ipcRenderer.invoke('get-downloads'),
  updateCheck: () => ipcRenderer.invoke('update-check'),
  updateState: () => ipcRenderer.invoke('update-state'),
  onUpdateAvailable: (cb) => {
    const h = (_e, d) => cb(d);
    ipcRenderer.on('update-available', h);
    return () => ipcRenderer.removeListener('update-available', h);
  },
  pickShortcut: () => ipcRenderer.invoke('pick-shortcut'),
  pinnedLoad: () => ipcRenderer.invoke('pinned-load'),
  pinnedSave: (items) => ipcRenderer.invoke('pinned-save', items),

  // ---- Pomodoro ----
  pomodoroGetState: () => ipcRenderer.invoke('pomodoro-get-state'),
  pomodoroStart: () => ipcRenderer.invoke('pomodoro-start'),
  pomodoroPause: () => ipcRenderer.invoke('pomodoro-pause'),
  pomodoroReset: () => ipcRenderer.invoke('pomodoro-reset'),
  onPomodoroState: (cb) => batchedListener('pomodoro-state', cb),
  onPomodoroFinished: (cb) => batchedListener('pomodoro-finished', cb),
  onDownloadStart: (cb) => batchedListener('download-start', cb),
  onDownloadProgress: (cb) => batchedListener('download-progress', cb),
  onDownloadDone: (cb) => batchedListener('download-done', cb),
  onIslandFullscreen: (cb) => batchedListener('island-fullscreen', cb),
  onSystemEvent: (cb) => batchedListener('system-event', cb),
  onNotification: (cb) => batchedListener('notification', cb),

  // ---- Open source app ----
  openSourceApp: (sourceId) => ipcRenderer.invoke('open-source-app', sourceId),

  // ---- Window handling ----
  setIgnoreMouseEvents: (ignore, options) => ipcRenderer.send('set-ignore-mouse-events', ignore, options),
  setWindowSize: (width, height) => ipcRenderer.send('set-window-size', width, height),
  getWindowBounds: () => ipcRenderer.invoke('get-window-bounds'),
  setIslandExpanded: (expanded) => ipcRenderer.send('island-expanded', !!expanded),

  // ---- Calendar ----
  getCalendarEvents: () => ipcRenderer.invoke('get-calendar-events'),

  // ---- Real-time updates ----
  onMediaUpdate: (callback) => batchedListener('media-update', callback),
  onLyricsUpdate: (callback) => batchedListener('lyrics-update', callback),
  onIslandBlur: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('island-blur', handler);
    return () => ipcRenderer.removeListener('island-blur', handler);
  },
  setWeatherCity: (city) => ipcRenderer.invoke('set-weather-city', city),
  getBattery: () => ipcRenderer.invoke('get-battery'),
  onBatteryUpdate: (cb) => batchedListener('battery-update', cb),
  settingsGetAll: () => ipcRenderer.invoke('settings-get-all'),
  settingsGetDefaults: () => ipcRenderer.invoke('settings-get-defaults'),
  settingsSet: (key, value) => ipcRenderer.invoke('settings-set', key, value),
  onSettingsUpdate: (cb) => batchedListener('settings-updated', cb),
  onSystemInfoUpdate: (cb) => batchedListener('system-info-update', cb),
  onCalendarUpdate: (cb) => batchedListener('calendar-update', cb),

  // ---- Startup Settings ----
  getStartupStatus: () => ipcRenderer.invoke('get-startup-status'),
  toggleStartup: (enabled) => ipcRenderer.invoke('toggle-startup', enabled),
  testStartup: () => ipcRenderer.invoke('test-startup'),

  // ---- Calendar Settings ----
  getCalendarStatus: () => ipcRenderer.invoke('get-calendar-status'),
  toggleCalendarIntegration: (enabled) => ipcRenderer.invoke('toggle-calendar-integration', enabled),

  // ---- Privacy Settings ----
  getPrivacyStatus: () => ipcRenderer.invoke('get-privacy-status'),
  togglePrivacyIndicators: (enabled) => ipcRenderer.invoke('toggle-privacy-indicators', enabled),
  getPrivacyState: () => ipcRenderer.invoke('get-privacy-state'),
  onPrivacyUpdate: (cb) => batchedListener('privacy-update', cb),

  // ---- Display Mode ----
  getDisplayMode: () => ipcRenderer.invoke('get-display-mode'),
  getDisplays: () => ipcRenderer.invoke('get-displays'),
  onDisplaysChanged: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('displays-changed', handler);
    return () => ipcRenderer.removeListener('displays-changed', handler);
  },
  setDisplayMode: (mode) => ipcRenderer.invoke('set-display-mode', mode),
  onDisplayModeChanged: (cb) => batchedListener('display-mode-changed', cb),

  // ---- Clipboard ----
  onClipboardUpdate: (cb) => batchedListener('clipboard-update', cb),
  clipboardGetHistory: () => ipcRenderer.invoke('clipboard-get-history'),
  clipboardPaste: (id) => ipcRenderer.invoke('clipboard-paste', id),
  clipboardDelete: (id) => ipcRenderer.invoke('clipboard-delete', id),
  clipboardClear: () => ipcRenderer.invoke('clipboard-clear'),
  clipboardSaveImage: (id) => ipcRenderer.invoke('clipboard-save-image', id),
  onClipboardHistory: (cb) => batchedListener('clipboard-history', cb),

  // ---- Active Window (Workspace) ----
  onActiveWindowUpdate: (cb) => batchedListener('active-window-update', cb),
});
