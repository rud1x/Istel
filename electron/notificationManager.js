const { spawn } = require('child_process');
const path = require('path');

class NotificationManager {
  constructor(monitorManager) {
    this.monitorManager = monitorManager;
    this.process = null;
  }

  start() {
    const scriptPath = path.join(__dirname, 'scripts', 'listen_notifications.ps1');
    this.process = spawn('powershell.exe', [
      '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath
    ], { stdio: ['ignore', 'pipe', 'pipe'] });

    this.process.stdout.on('data', (data) => {
      const lines = data.toString().split('\n');
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const notification = JSON.parse(line);
          if (notification.error) {
            console.log('[NotificationManager] Error:', notification.error);
            continue;
          }
          console.log('[NotificationManager] Sending notification:', notification);
          this.broadcast('notification', notification);
        } catch (e) {
          // Ignore malformed JSON
        }
      }
    });

    this.process.stderr.on('data', (data) => {
      console.log('[NotificationManager] stderr:', data.toString());
    });

    this.process.on('close', (code) => {
      console.log('[NotificationManager] Process exited with code', code);
    });
  }

  stop() {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
  }

  broadcast(channel, data) {
    if (!this.monitorManager) return;
    for (const [, entry] of this.monitorManager.windows) {
      if (!entry.win.isDestroyed() && entry.win.webContents) {
        entry.win.webContents.send(channel, data);
      }
    }
  }
}

module.exports = NotificationManager;
