const { BrowserWindow } = require('electron');
const path = require('path');

class SettingsWindow {
  constructor(isDev) {
    this.isDev = isDev;
    this.win = null;
  }

  open() {
    if (this.win && !this.win.isDestroyed()) {
      this.win.show();
      this.win.focus();
      return;
    }

    this.win = new BrowserWindow({
      width: 1120,
      height: 820,
      minWidth: 940,
      minHeight: 640,
      title: 'Istel — Настройки',
      icon: path.join(__dirname, '..', 'assets', 'icon.png'),
      resizable: true,
      show: false,
      backgroundColor: '#08080a',
      autoHideMenuBar: true,
      titleBarStyle: 'hidden',
      titleBarOverlay: {
        color: '#08080a',
        symbolColor: '#9a9aa2',
        height: 44,
      },
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    if (this.isDev) {
      this.win.loadURL('http://localhost:9090/#settings');
    } else {
      this.win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'), { hash: 'settings' });
    }

    this.win.once('ready-to-show', () => {
      if (!this.win || this.win.isDestroyed()) return;
      this.win.show();
      this.win.focus();
    });

    this.win.on('closed', () => {
      this.win = null;
    });
  }

  broadcast(channel, data) {
    if (this.win && !this.win.isDestroyed() && this.win.webContents) {
      this.win.webContents.send(channel, data);
    }
  }
}

module.exports = SettingsWindow;
