// ============================================================
// Volume Manager
// Reads the default audio endpoint volume via CoreAudio COM.
// IMPORTANT: the IAudioEndpointVolume vtable order is fixed — every
// method must be declared in the exact order, including the per-channel
// ones, or calls land on the wrong method (this previously caused the
// system to spontaneously mute). Polling is intentionally light and
// non-overlapping.
//
// Runs in the persistent 'media' PowerShell host (psHost.js): the C#
// interop is compiled once. The endpoint is opened per call and released
// right away, so a long-lived host never pins a stale default device and
// holds no audio reference while polling is suspended for a game.
// ============================================================

const { getHost } = require('./psHost');
const { createGuardedPoller } = require('./lib/guardedPoller.cjs');

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

const VOLUME_DEFS = `
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
public class IslandAudio {
  // Open the CURRENT default endpoint for one operation and release it.
  static T WithVolume<T>(Func<IAudioEndpointVolume, T> fn) {
    object en = null, o = null;
    IMMDevice dev = null;
    try {
      en = new MMDeviceEnumeratorComObject();
      ((IMMDeviceEnumerator)en).GetDefaultAudioEndpoint(0, 1, out dev);
      Guid iid = typeof(IAudioEndpointVolume).GUID;
      dev.Activate(ref iid, 23, IntPtr.Zero, out o);
      return fn((IAudioEndpointVolume)o);
    } finally {
      if (o != null) Marshal.ReleaseComObject(o);
      if (dev != null) Marshal.ReleaseComObject(dev);
      if (en != null) Marshal.ReleaseComObject(en);
    }
  }
  public static string Query() {
    return WithVolume(v => {
      float lvl; bool m;
      v.GetMasterVolumeLevelScalar(out lvl);
      v.GetMute(out m);
      return ((int)Math.Round(lvl * 100)).ToString() + "|" + (m ? "1" : "0");
    });
  }
  public static bool SetLevel(float level) {
    return WithVolume(v => v.SetMasterVolumeLevelScalar(level, Guid.Empty) == 0);
  }
}
"@
Function IslandVolumeQuery { "VOL:$([IslandAudio]::Query())|$($env:Istel_DEVICE_NAME)" }
Function IslandVolumeSet([int]$Percent) { [string][IslandAudio]::SetLevel($Percent / 100.0) }
`;

class VolumeManager {
  constructor(monitorManager) {
    this.monitorManager = monitorManager;
    this.lastLevel = null;
    this.lastMuted = null;
    this.deviceName = '';
    this._host = getHost('media');
    this._host.define('volume', VOLUME_DEFS);
    this._poller = createGuardedPoller(() => this._poll(), POLL_INTERVAL);
  }

  start() {
    this._poller.start();
  }

  stop() {
    this._poller.stop();
  }

  setLevel(percent) {
    const value = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
    return this._host.call('IslandVolumeSet', [value], { timeout: 3000 })
      .then(() => { this._poll(); return true; })
      .catch(() => false);
  }

  _poll() {
    return this._host.call('IslandVolumeQuery', [], { timeout: 3000 }).then((stdout) => {
      const m = (stdout || '').trim().match(/VOL:(\d+)\|(\d+)\|(.*)/);
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
    }, () => {});
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

module.exports = VolumeManager;
