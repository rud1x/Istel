const { getHost } = require('./psHost');
const { createGuardedPoller } = require('./lib/guardedPoller.cjs');

const POLL_INTERVAL = 2000; // Poll every 2 seconds for privacy indicators

// Runs in the persistent 'system' PowerShell host (psHost.js).
const PRIVACY_DEFS = `
Function IslandPrivacyQuery {
$cameraApps = Get-ChildItem -Path "HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\webcam" -Recurse -ErrorAction SilentlyContinue | Where-Object { $_.GetValue('LastUsedTimeStop') -eq 0 }

$micApps = Get-ChildItem -Path "HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\microphone" -Recurse -ErrorAction SilentlyContinue | Where-Object { $_.GetValue('LastUsedTimeStop') -eq 0 }

$results = @()

foreach ($app in $cameraApps) {
    $results += [PSCustomObject]@{
        type = "camera"
        app = $app.PSChildName
        timeStart = $app.GetValue('LastUsedTimeStart')
    }
}

foreach ($app in $micApps) {
    $results += [PSCustomObject]@{
        type = "microphone"
        app = $app.PSChildName
        timeStart = $app.GetValue('LastUsedTimeStart')
    }
}

if ($results.Count -gt 0) { $results | ConvertTo-Json -Compress }
}
`;

class PrivacyManager {
  constructor() {
    this.currentState = { camera: [], microphone: [] };
    this.enabled = true; // Controlled by UI toggle
    this._host = getHost('system');
    this._host.define('privacy', PRIVACY_DEFS);
    this._poller = createGuardedPoller(() => this._poll(), POLL_INTERVAL);
  }

  startPolling(callback) {
    this.callback = callback;
    // Idempotent (R4): never create parallel polls after a fullscreen cycle.
    this._poller.start();
  }

  stopPolling() {
    this._poller.stop();
  }

  _poll() {
    if (!this.enabled) {
      if (this.currentState.camera.length > 0 || this.currentState.microphone.length > 0) {
        this.currentState = { camera: [], microphone: [] };
        if (this.callback) this.callback(this.currentState);
      }
      return undefined;
    }

    return this._queryPrivacy()
      .then((state) => {
        // Check if state changed before invoking callback
        const prevCam = JSON.stringify(this.currentState.camera);
        const prevMic = JSON.stringify(this.currentState.microphone);
        const currCam = JSON.stringify(state.camera);
        const currMic = JSON.stringify(state.microphone);

        if (prevCam !== currCam || prevMic !== currMic) {
          this.currentState = state;
          if (this.callback) this.callback(state);
        }
      })
      .catch(() => {
        // Ignore errors during query
      });
  }


  getCurrentState() {
    return this.currentState;
  }
  
  setEnabled(enabled) {
    this.enabled = enabled;
    if (!enabled) {
      this.currentState = { camera: [], microphone: [] };
      if (this.callback) this.callback(this.currentState);
    }
  }

  _formatAppName(rawName) {
    if (!rawName) return "Unknown";
    
    // NonPackaged apps look like C:#Program Files#...#app.exe
    if (rawName.includes('#')) {
      const parts = rawName.split('#');
      const filename = parts[parts.length - 1];
      let name = filename.replace('.exe', '');
      
      // Map some common executable names to better display names
      const knownApps = {
        'msedge': 'Microsoft Edge',
        'chrome': 'Google Chrome',
        'firefox': 'Firefox',
        'brave': 'Brave',
        'obs64': 'OBS Studio',
        'obs32': 'OBS Studio',
        'discord': 'Discord',
        'zoom': 'Zoom'
      };
      
      return knownApps[name.toLowerCase()] || (name.charAt(0).toUpperCase() + name.slice(1));
    }
    
    // Packaged apps (UWP)
    return rawName.split('_')[0];
  }

  _queryPrivacy() {
    return this._host.call('IslandPrivacyQuery', [], { timeout: 3000 }).then((stdout) => {
      const raw = (stdout || '').trim();
      if (!raw) return { camera: [], microphone: [] };

      // PowerShell may prepend warnings/BOM. Slice from the first JSON
      // token so a noisy line does not blank the indicator (R6).
      const start = raw.search(/[\[{]/);
      let data = JSON.parse(start >= 0 ? raw.slice(start) : raw);
      if (!Array.isArray(data)) data = [data];

      const state = { camera: [], microphone: [] };
      data.forEach((item) => {
        const fileTime = parseInt(item.timeStart, 10);
        const entry = {
          app: this._formatAppName(item.app),
          timestamp: (fileTime / 10000) - 11644473600000,
        };
        if (item.type === 'camera') state.camera.push(entry);
        else if (item.type === 'microphone') state.microphone.push(entry);
      });

      // Sort by most recent first
      state.camera.sort((a, b) => b.timestamp - a.timestamp);
      state.microphone.sort((a, b) => b.timestamp - a.timestamp);
      return state;
    });
  }
}

module.exports = PrivacyManager;
