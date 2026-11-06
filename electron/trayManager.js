// ============================================================
// Tray Manager
// System tray icon with a clean context menu for Istel.
// ============================================================

const { Tray, Menu, nativeImage } = require('electron');
const path = require('path');

class TrayManager {
  constructor(app, monitorManager, configManager, startupManager, settingsWindow) {
    this.app = app;
    this.monitorManager = monitorManager;
    this.configManager = configManager;
    this.startupManager = startupManager;
    this.settingsWindow = settingsWindow;
    this.tray = null;
    this._islandVisible = true;
    this._createTray();
  }

  _createTray() {
    const trayIcon = this._createTrayIcon();
    this.tray = new Tray(trayIcon);
    this.tray.setToolTip('Istel');
    this._buildContextMenu();
    this.tray.on('double-click', () => this._toggleIsland());
  }

  _islandAnyVisible() {
    let visible = false;
    this.monitorManager.windows.forEach((entry) => {
      if (!entry.win.isDestroyed() && entry.win.isVisible()) visible = true;
    });
    return visible;
  }

  _toggleIsland() {
    const visible = this._islandAnyVisible();
    if (visible) {
      this.monitorManager.windows.forEach((entry) => {
        if (!entry.win.isDestroyed()) {
          entry._trayHidden = true;
          entry.win.hide();
        }
      });
      this._islandVisible = false;
    } else {
      this.monitorManager.windows.forEach((entry) => {
        if (!entry.win.isDestroyed()) {
          entry._trayHidden = false;
          entry.fullscreenHidden = false;
          entry.win.show();
        }
      });
      this._islandVisible = true;
    }
    this._buildContextMenu();
  }

  _buildContextMenu() {
    const visible = this._islandAnyVisible();
    const contextMenu = Menu.buildFromTemplate([
      { label: 'Istel', enabled: false },
      { type: 'separator' },
      {
        label: visible ? 'Скрыть остров' : 'Открыть остров',
        click: () => this._toggleIsland(),
      },
      {
        label: 'Настройки',
        click: () => this.settingsWindow?.open?.(),
      },
      { type: 'separator' },
      {
        label: 'Запускать с Windows',
        type: 'checkbox',
        checked: this.configManager.get('runAtStartup', false),
        enabled: this.app.isPackaged,
        click: (menuItem) => {
          const enabled = menuItem.checked;
          this.configManager.set('runAtStartup', enabled);
          try {
            if (enabled) this.startupManager.enable();
            else this.startupManager.disable();
          } catch {}
          this._buildContextMenu();
        },
      },
      { type: 'separator' },
      {
        label: 'Выход',
        click: () => this.app.quit(),
      },
    ]);
    this.tray.setContextMenu(contextMenu);
  }

  _createTrayIcon() {
    try {
      const iconPath = path.join(__dirname, '..', 'assets', 'tray-icon.png');
      const icon = nativeImage.createFromPath(iconPath);
      if (!icon.isEmpty()) return icon.resize({ width: 16, height: 16 });
    } catch {}

    const size = 16;
    const buffer = Buffer.alloc(size * size * 4, 0);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = x - 7.5, dy = y - 7.5;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const idx = (y * size + x) * 4;
        if (dist < 6) {
          buffer[idx] = 255; buffer[idx + 1] = 255; buffer[idx + 2] = 255; buffer[idx + 3] = 255;
        } else if (dist < 7) {
          const alpha = Math.max(0, Math.min(255, Math.round((7 - dist) * 255)));
          buffer[idx] = 255; buffer[idx + 1] = 255; buffer[idx + 2] = 255; buffer[idx + 3] = alpha;
        }
      }
    }
    return nativeImage.createFromBuffer(buffer, { width: size, height: size });
  }
}

module.exports = TrayManager;
