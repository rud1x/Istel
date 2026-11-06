const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const { parseConfigText, tempConfigPath, corruptBackupPath } = require('./lib/configIO.cjs');

class ConfigManager {
  constructor() {
    // Ensure app is ready before calling getPath
    if (!app.isReady()) {
      throw new Error('ConfigManager must be created after app.whenReady()');
    }

    // 1. Determine paths
    this.userDataPath = app.getPath('userData');
    this.configPath = path.join(this.userDataPath, 'config.json');

    // In a packaged build the file lives inside app.asar, not next to the exe.
    // app.getAppPath() resolves to the asar root, which fs can read directly.
    this.baseConfigPath = app.isPackaged
      ? path.join(app.getAppPath(), 'config.json')
      : path.join(process.cwd(), 'config.json');

    // 2. Ensure userData directory exists
    if (!fs.existsSync(this.userDataPath)) {
      try {
        fs.mkdirSync(this.userDataPath, { recursive: true });
      } catch (err) {
        console.error('Error creating userData directory:', err);
      }
    }

    // 3. Load initial config
    this.config = this._load();
  }

  _load() {
    let defaults = { 
      ports: { devServer: 9090 }, 
      runAtStartup: false, 
      startMinimized: true, 
      startupDelaySeconds: 2,
      displayMode: 'pill',
      enableCalendarIntegration: false,
      enablePrivacyIndicators: true
    };

    try {
      if (fs.existsSync(this.baseConfigPath)) {
        const data = fs.readFileSync(this.baseConfigPath, 'utf8');
        const baseConfig = JSON.parse(data);
        defaults = { ...defaults, ...baseConfig };
      }
    } catch (err) {
      console.log('[ConfigManager] Base config not found or unreadable, using defaults.');
    }

    try {
      if (fs.existsSync(this.configPath)) {
        const data = fs.readFileSync(this.configPath, 'utf8');
        const { corrupt, parsed } = parseConfigText(data);
        if (corrupt) {
          // Preserve the broken file so the user can recover it, instead of
          // silently wiping every setting (B15).
          const backup = corruptBackupPath(this.configPath, Date.now());
          try { fs.copyFileSync(this.configPath, backup); } catch {}
          console.error('[ConfigManager] Corrupt config backed up to', backup);
          return { ...defaults };
        }
        if (parsed) return { ...defaults, ...parsed };
      }
    } catch (err) {
      console.error('[ConfigManager] Error loading user config:', err);
    }

    return defaults;
  }

  get(key, defaultValue) {
    return this.config[key] !== undefined ? this.config[key] : defaultValue;
  }

  set(key, value) {
    this.config[key] = value;
    this._save();
  }

  _save() {
    // Atomic write: write to a temp file, then rename. A crash mid-write
    // leaves the old config intact instead of a truncated JSON (B14).
    try {
      const tmp = tempConfigPath(this.configPath);
      fs.writeFileSync(tmp, JSON.stringify(this.config, null, 2), 'utf8');
      fs.renameSync(tmp, this.configPath);
    } catch (err) {
      console.error('[ConfigManager] Error saving config.json:', err);
    }
  }
}

// Экспортируем класс, а не экземпляр
module.exports = ConfigManager;
