// ============================================================
// System Info Manager
// Polls the active keyboard layout (language) and periodically
// fetches current weather for the user's approximate location.
// Everything here is free / key-less:
//   - layout: WinAPI GetKeyboardLayout via PowerShell
//   - geo:     https://ipwho.is (no key)
//   - weather: https://api.open-meteo.com (no key)
// ============================================================

const { execFile } = require('child_process');
const { net } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

const SCRIPT_DIR = path.join(os.tmpdir(), 'island_scripts');
const LANG_SCRIPT = path.join(SCRIPT_DIR, 'lang_query.ps1');

const LANG_POLL_INTERVAL = 2000; // ms (each poll spawns PowerShell)
const WEATHER_REFRESH_INTERVAL = 30 * 60 * 1000; // 30 min

const LANG_SCRIPT_CONTENT = `
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class KeyboardLayoutHelper {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
  [DllImport("user32.dll")] public static extern IntPtr GetKeyboardLayout(uint idThread);
}
"@
$hwnd = [KeyboardLayoutHelper]::GetForegroundWindow()
$procId = 0
$threadId = [KeyboardLayoutHelper]::GetWindowThreadProcessId($hwnd, [ref]$procId)
$layout = [KeyboardLayoutHelper]::GetKeyboardLayout($threadId)
$langId = [int]$layout -band 0xFFFF
Write-Output "LANG:$langId"
`;

// Map Windows primary language IDs to short display codes.
const LANG_ID_MAP = {
  0x0409: 'EN',
  0x0419: 'RU',
  0x0407: 'DE',
  0x040c: 'FR',
  0x0410: 'IT',
  0x040a: 'ES',
  0x0415: 'PL',
  0x0422: 'UK',
  0x041f: 'TR',
  0x0411: 'JA',
  0x0412: 'KO',
  0x0804: 'ZH',
  0x0404: 'ZH',
};

// WMO weather codes -> short label + emoji.
function describeWeatherCode(code) {
  if (code === 0) return { text: 'Ясно', icon: '☀' };
  if (code === 1 || code === 2) return { text: 'Малооблачно', icon: '🌤' };
  if (code === 3) return { text: 'Облачно', icon: '☁' };
  if (code === 45 || code === 48) return { text: 'Туман', icon: '🌫' };
  if (code >= 51 && code <= 57) return { text: 'Морось', icon: '🌦' };
  if (code >= 61 && code <= 67) return { text: 'Дождь', icon: '🌧' };
  if (code >= 71 && code <= 77) return { text: 'Снег', icon: '🌨' };
  if (code >= 80 && code <= 82) return { text: 'Ливень', icon: '🌧' };
  if (code >= 85 && code <= 86) return { text: 'Снегопад', icon: '🌨' };
  if (code >= 95) return { text: 'Гроза', icon: '⛈' };
  return { text: '', icon: '☁' };
}

class SystemInfoManager {
  constructor(monitorManager) {
    this.monitorManager = monitorManager;
    this.lastLang = null;
    this.weather = null;
    this.langTimer = null;
    this.weatherTimer = null;
    this.coords = null;
    this.city = '';
    ensureScriptDir();
  }

  // Set a manual city (from settings). Resolves coords via geocoding and
  // refreshes weather immediately.
  setCity(name) {
    this.city = (name || '').trim();
    this.coords = null;
    this._refreshWeather();
  }

  start() {
    this._pollLang();
    this.langTimer = setInterval(() => this._pollLang(), LANG_POLL_INTERVAL);

    this._refreshWeather();
    this.weatherTimer = setInterval(() => this._refreshWeather(), WEATHER_REFRESH_INTERVAL);
  }

  stop() {
    if (this.langTimer) clearInterval(this.langTimer);
    if (this.weatherTimer) clearInterval(this.weatherTimer);
  }

  getState() {
    return { lang: this.lastLang, weather: this.weather };
  }

  _pollLang() {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', LANG_SCRIPT],
      { timeout: 2000 },
      (err, stdout) => {
        if (err || !stdout) return;
        const m = stdout.trim().match(/LANG:(\d+)/);
        if (!m) return;
        const langId = parseInt(m[1], 10);
        const code = LANG_ID_MAP[langId] || null;
        if (code && code !== this.lastLang) {
          this.lastLang = code;
          this._broadcast('system-info-update', this.getState());
        }
      }
    );
  }

  async _refreshWeather() {
    try {
      // If a city is set, try wttr.in directly first (reliable from RU).
      if (this.city) {
        const wttr = await this._fetchWeatherWttr(this.city);
        if (wttr) {
          this.weather = wttr;
          this._broadcast('system-info-update', this.getState());
          return;
        }
      }

      if (!this.coords) {
        if (this.city) {
          this.coords = await this._geocodeCity(this.city);
        }
        if (!this.coords) {
          this.coords = await this._fetchCoords();
        }
        if (!this.coords) return;
      }
      const w = await this._fetchWeather(this.coords.lat, this.coords.lon);
      if (w) {
        this.weather = { ...w, city: this.coords.name || this.city || '' };
        this._broadcast('system-info-update', this.getState());
      }
    } catch (e) {
      // best-effort; ignore
    }
  }

  // Fallback weather source: wttr.in (no key, usually reachable from RU).
  _fetchWeatherWttr(city) {
    return new Promise((resolve) => {
      const url = `https://wttr.in/${encodeURIComponent(city)}?format=j1&lang=ru`;
      try {
        const req = net.request(url);
        req.setHeader('User-Agent', 'curl/8');
        req.on('response', (res) => {
          let data = '';
          res.on('data', (c) => (data += c));
          res.on('end', () => {
            try {
              const j = JSON.parse(data);
              const cur = j && j.current_condition && j.current_condition[0];
              if (!cur) return resolve(null);
              const code = parseInt(cur.weatherCode, 10);
              const desc = describeWeatherCode(code);
              const near = j.nearest_area && j.nearest_area[0];
              const cityName = near && near.areaName && near.areaName[0] && near.areaName[0].value;
              resolve({
                temp: Math.round(parseFloat(cur.temp_C)),
                icon: desc.icon,
                text: (cur.lang_ru && cur.lang_ru[0] && cur.lang_ru[0].value) || desc.text,
                city: cityName || city,
              });
            } catch {
              resolve(null);
            }
          });
        });
        req.on('error', () => resolve(null));
        req.end();
      } catch {
        resolve(null);
      }
    });
  }

  // Geocode a city name to coordinates via Open-Meteo (free, no key).
  _geocodeCity(name) {
    return new Promise((resolve) => {
      const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=1&language=ru&format=json`;
      try {
        const req = net.request(url);
        req.setHeader('User-Agent', 'IslandApp/1.0');
        req.on('response', (res) => {
          let data = '';
          res.on('data', (c) => (data += c));
          res.on('end', () => {
            try {
              const j = JSON.parse(data);
              const r = j && j.results && j.results[0];
              if (r && r.latitude != null && r.longitude != null) {
                resolve({ lat: r.latitude, lon: r.longitude, name: r.name || name });
              } else {
                resolve(null);
              }
            } catch {
              resolve(null);
            }
          });
        });
        req.on('error', () => resolve(null));
        req.end();
      } catch {
        resolve(null);
      }
    });
  }

  _fetchCoords() {
    return new Promise((resolve) => {
      try {
        const req = net.request('https://ipwho.is/');
        req.setHeader('User-Agent', 'IslandApp/1.0');
        req.on('response', (res) => {
          let data = '';
          res.on('data', (c) => (data += c));
          res.on('end', () => {
            try {
              const j = JSON.parse(data);
              if (j && j.success !== false && j.latitude != null && j.longitude != null) {
                resolve({ lat: j.latitude, lon: j.longitude });
              } else {
                resolve(null);
              }
            } catch {
              resolve(null);
            }
          });
        });
        req.on('error', () => resolve(null));
        req.end();
      } catch {
        resolve(null);
      }
    });
  }

  _fetchWeather(lat, lon) {
    return new Promise((resolve) => {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&timezone=auto`;
      try {
        const req = net.request(url);
        req.setHeader('User-Agent', 'IslandApp/1.0');
        req.on('response', (res) => {
          let data = '';
          res.on('data', (c) => (data += c));
          res.on('end', () => {
            try {
              const j = JSON.parse(data);
              const cur = j && j.current;
              if (!cur) return resolve(null);
              const desc = describeWeatherCode(cur.weather_code);
              resolve({
                temp: Math.round(cur.temperature_2m),
                icon: desc.icon,
                text: desc.text,
              });
            } catch {
              resolve(null);
            }
          });
        });
        req.on('error', () => resolve(null));
        req.end();
      } catch {
        resolve(null);
      }
    });
  }

  _broadcast(channel, data) {
    if (!this.monitorManager) return;
    for (const [, entry] of this.monitorManager.windows) {
      if (!entry.win.isDestroyed() && entry.win.webContents) {
        entry.win.webContents.send(channel, data);
      }
    }
  }
}

function ensureScriptDir() {
  if (!fs.existsSync(SCRIPT_DIR)) {
    fs.mkdirSync(SCRIPT_DIR, { recursive: true });
  }
  fs.writeFileSync(LANG_SCRIPT, LANG_SCRIPT_CONTENT, 'utf8');
}

module.exports = SystemInfoManager;
