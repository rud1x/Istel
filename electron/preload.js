// ============================================================
// Preload — Secure IPC bridge between renderer and main process
// ============================================================

const { contextBridge, ipcRenderer, webUtils } = require('electron');

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
  onPomodoroState: (cb) => {
    const h = (_e, d) => cb(d);
    ipcRenderer.on('pomodoro-state', h);
    return () => ipcRenderer.removeListener('pomodoro-state', h);
  },
  onPomodoroFinished: (cb) => {
    const h = (_e, d) => cb(d);
    ipcRenderer.on('pomodoro-finished', h);
    return () => ipcRenderer.removeListener('pomodoro-finished', h);
  },
  onDownloadStart: (cb) => {
    const h = (_e, d) => cb(d);
    ipcRenderer.on('download-start', h);
    return () => ipcRenderer.removeListener('download-start', h);
  },
  onDownloadProgress: (cb) => {
    const h = (_e, d) => cb(d);
    ipcRenderer.on('download-progress', h);
    return () => ipcRenderer.removeListener('download-progress', h);
  },
  onDownloadDone: (cb) => {
    const h = (_e, d) => cb(d);
    ipcRenderer.on('download-done', h);
    return () => ipcRenderer.removeListener('download-done', h);
  },
  onIslandFullscreen: (cb) => {
    const h = (_e, d) => cb(d);
    ipcRenderer.on('island-fullscreen', h);
    return () => ipcRenderer.removeListener('island-fullscreen', h);
  },
  onSystemEvent: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('system-event', handler);
    return () => ipcRenderer.removeListener('system-event', handler);
  },
  onNotification: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('notification', handler);
    return () => ipcRenderer.removeListener('notification', handler);
  },

  // ---- Open source app ----
  openSourceApp: (sourceId) => ipcRenderer.invoke('open-source-app', sourceId),

  // ---- Window handling ----
  setIgnoreMouseEvents: (ignore, options) => ipcRenderer.send('set-ignore-mouse-events', ignore, options),
  setWindowSize: (width, height) => ipcRenderer.send('set-window-size', width, height),
  getWindowBounds: () => ipcRenderer.invoke('get-window-bounds'),

  // ---- Calendar ----
  getCalendarEvents: () => ipcRenderer.invoke('get-calendar-events'),

  // ---- Real-time updates ----
  onMediaUpdate: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('media-update', handler);
    return () => ipcRenderer.removeListener('media-update', handler);
  },
  onLyricsUpdate: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('lyrics-update', handler);
    return () => ipcRenderer.removeListener('lyrics-update', handler);
  },
  onIslandBlur: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('island-blur', handler);
    return () => ipcRenderer.removeListener('island-blur', handler);
  },
  setWeatherCity: (city) => ipcRenderer.invoke('set-weather-city', city),
  getBattery: () => ipcRenderer.invoke('get-battery'),
  onBatteryUpdate: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('battery-update', handler);
    return () => ipcRenderer.removeListener('battery-update', handler);
  },
  settingsGetAll: () => ipcRenderer.invoke('settings-get-all'),
  settingsGetDefaults: () => ipcRenderer.invoke('settings-get-defaults'),
  settingsSet: (key, value) => ipcRenderer.invoke('settings-set', key, value),
  onSettingsUpdate: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('settings-updated', handler);
    return () => ipcRenderer.removeListener('settings-updated', handler);
  },
  onSystemInfoUpdate: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('system-info-update', handler);
    return () => ipcRenderer.removeListener('system-info-update', handler);
  },
  onCalendarUpdate: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('calendar-update', handler);
    return () => ipcRenderer.removeListener('calendar-update', handler);
  },

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

  onPrivacyUpdate: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('privacy-update', handler);
    return () => ipcRenderer.removeListener('privacy-update', handler);
  },

  // ---- Display Mode ----
  getDisplayMode: () => ipcRenderer.invoke('get-display-mode'),
  setDisplayMode: (mode) => ipcRenderer.invoke('set-display-mode', mode),
  onDisplayModeChanged: (callback) => {
    const handler = (_event, mode) => callback(mode);
    ipcRenderer.on('display-mode-changed', handler);
    return () => ipcRenderer.removeListener('display-mode-changed', handler);
  },

  // ---- Clipboard ----
  onClipboardUpdate: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('clipboard-update', handler);
    return () => ipcRenderer.removeListener('clipboard-update', handler);
  },
  clipboardGetHistory: () => ipcRenderer.invoke('clipboard-get-history'),
  clipboardPaste: (id) => ipcRenderer.invoke('clipboard-paste', id),
  clipboardDelete: (id) => ipcRenderer.invoke('clipboard-delete', id),
  clipboardClear: () => ipcRenderer.invoke('clipboard-clear'),
  clipboardSaveImage: (id) => ipcRenderer.invoke('clipboard-save-image', id),
  onClipboardHistory: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('clipboard-history', handler);
    return () => ipcRenderer.removeListener('clipboard-history', handler);
  },

  // ---- Active Window (Workspace) ----
  onActiveWindowUpdate: (callback) => {
    const handler = (_event, processName) => callback(processName);
    ipcRenderer.on('active-window-update', handler);
    return () => ipcRenderer.removeListener('active-window-update', handler);
  },
  removeActiveWindowListener: () => {
    ipcRenderer.removeAllListeners('active-window-update');
  },
});
