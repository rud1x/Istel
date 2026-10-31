// ============================================================
// Volume Manager
// Reads the default audio endpoint volume via CoreAudio COM.
// IMPORTANT: the IAudioEndpointVolume vtable order is fixed — every
// method must be declared in the exact order, including the per-channel
// ones, or calls land on the wrong method (this previously caused the
// system to spontaneously mute). Polling is intentionally light and
// non-overlapping.
// ============================================================

const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const SCRIPT_DIR = path.join(os.tmpdir(), 'island_scripts');
const VOLUME_SCRIPT = path.join(SCRIPT_DIR, 'volume_query.ps1');
const VOLUME_SET_SCRIPT = path.join(SCRIPT_DIR, 'volume_set.ps1');
const POLL_INTERVAL = 3000;

// Correct IAudioEndpointVolume vtable (do not reorder or omit!).
const AUDIO_INTERFACE = `
[Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioEndpointVolume {
  int NotImpl1();
  int NotImpl2();
  int GetChannelCount(out uint c);
  int SetMasterVolumeLevel(float level, Guid ctx);
  int SetMasterVolumeLevelScalar(float level, Guid ctx);
  int GetMasterVolumeLevel(out float level);
  int GetMasterVolumeLevelScalar(out float level);
  int SetChannelVolumeLevel(uint ch, float level, Guid ctx);
  int SetChannelVolumeLevelScalar(uint ch, float level, Guid ctx);
  int GetChannelVolumeLevel(uint ch, out float level);
  int GetChannelVolumeLevelScalar(uint ch, out float level);
  int SetMute(bool mute, Guid ctx);
  int GetMute(out bool mute);
}`;

const VOLUME_SCRIPT_CONTENT = `
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
${AUDIO_INTERFACE}
[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDevice {
  int Activate(ref Guid id, int clsCtx, IntPtr activationParams, [MarshalAs(UnmanagedType.IUnknown)] out object a);
}
[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceEnumerator {
  int NotImpl1();
  int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice endpoint);
}
[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
class MMDeviceEnumeratorComObject { }
public class Audio {
  static IAudioEndpointVolume _vol;
  static IAudioEndpointVolume GetVolume() {
    if (_vol != null) return _vol;
    var enumerator = (IMMDeviceEnumerator)(new MMDeviceEnumeratorComObject());
    IMMDevice dev;
    enumerator.GetDefaultAudioEndpoint(0, 1, out dev);
    Guid iid = typeof(IAudioEndpointVolume).GUID;
    object o;
    dev.Activate(ref iid, 23, IntPtr.Zero, out o);
    _vol = (IAudioEndpointVolume)o;
    return _vol;
  }
  public static float GetLevel() {
    float lvl; GetVolume().GetMasterVolumeLevelScalar(out lvl); return lvl;
  }
  public static bool GetMute() {
    bool m; GetVolume().GetMute(out m); return m;
  }
}
"@
$lvl = [Audio]::GetLevel()
$pct = [math]::Round($lvl * 100)
$mute = if ([Audio]::GetMute()) { 1 } else { 0 }
Write-Output "VOL:$pct|$mute|$($env:ISTEL_DEVICE_NAME)"
`;

const VOLUME_SET_SCRIPT_CONTENT = `
param([int]$Percent)
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
${AUDIO_INTERFACE}
[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDevice {
  int Activate(ref Guid id, int clsCtx, IntPtr activationParams, [MarshalAs(UnmanagedType.IUnknown)] out object a);
}
[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceEnumerator {
  int NotImpl1();
  int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice endpoint);
}
[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
class MMDeviceEnumeratorComObject { }
public class Audio {
  static IAudioEndpointVolume _vol;
  public static IAudioEndpointVolume GetVolume() {
    if (_vol != null) return _vol;
    var enumerator = (IMMDeviceEnumerator)(new MMDeviceEnumeratorComObject());
    IMMDevice dev;
    enumerator.GetDefaultAudioEndpoint(0, 1, out dev);
    Guid iid = typeof(IAudioEndpointVolume).GUID;
    object o;
    dev.Activate(ref iid, 23, IntPtr.Zero, out o);
    _vol = (IAudioEndpointVolume)o;
    return _vol;
  }
  public static void SetLevel(float level) {
    GetVolume().SetMasterVolumeLevelScalar(level, Guid.Empty);
  }
}
"@
[Audio]::SetLevel($Percent / 100.0)
`;

class VolumeManager {
  constructor(monitorManager) {
    this.monitorManager = monitorManager;
    this.lastLevel = null;
    this.lastMuted = null;
    this.deviceName = '';
    this.timer = null;
    this._polling = false;
    this._lastDevice = '';
    ensureScriptDir();
  }

  start() {
    this._poll();
    this.timer = setInterval(() => this._poll(), POLL_INTERVAL);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  setLevel(percent) {
    const value = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
    return new Promise((resolve) => {
      execFile(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', VOLUME_SET_SCRIPT, '-Percent', String(value)],
        { timeout: 3000 },
        (err) => {
          if (!err) this._poll();
          resolve(!err);
        }
      );
    });
  }

  _poll() {
    if (this._polling) return;
    this._polling = true;
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', VOLUME_SCRIPT],
      { timeout: 3000 },
      (err, stdout) => {
        this._polling = false;
        if (err || !stdout) return;
        const m = stdout.trim().match(/VOL:(\d+)\|(\d+)\|(.*)/);
        if (!m) return;
        const level = parseInt(m[1], 10);
        const muted = m[2] === '1';
        const device = (m[3] || '').trim();
        if (device) this.deviceName = device;

        if (this.lastLevel === null) {
          this.lastLevel = level;
          this.lastMuted = muted;
          this._broadcast('volume-state', { level, muted, device: this.deviceName });
          return;
        }

        const levelChanged = level !== this.lastLevel;
        const muteChanged = muted !== this.lastMuted;

        if (levelChanged || muteChanged) {
          this._broadcast('volume-state', { level, muted, device: this.deviceName });
        }
        if (levelChanged) {
          this._broadcast('system-event', { type: 'volume', level });
        }

        this.lastLevel = level;
        this.lastMuted = muted;
      }
    );
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
  fs.writeFileSync(VOLUME_SCRIPT, VOLUME_SCRIPT_CONTENT, 'utf8');
  fs.writeFileSync(VOLUME_SET_SCRIPT, VOLUME_SET_SCRIPT_CONTENT, 'utf8');
}

module.exports = VolumeManager;
