// ============================================================
// Media Manager — SMTC Integration (v4)
// Uses GlobalSystemMediaTransportControlsSessionManager to
// detect ALL active media sessions, prioritize playing ones,
// extract artwork, and support seek + all playback controls.
//
// Runs inside the persistent 'media' PowerShell host (psHost.js):
// WinRT is loaded once instead of on every poll, polls never overlap,
// and the album artwork is read only when the track changes.
// ============================================================

const { getHost } = require('./psHost');
const { createGuardedPoller } = require('./lib/guardedPoller.cjs');

// 1 s is enough: the renderer extrapolates the playback position between
// updates (MusicWidget / DynamicIsland anchor + wall clock).
const POLL_INTERVAL = 1000;
const QUERY_TIMEOUT = 5000;
const COMMAND_TIMEOUT = 8000;
// A player often publishes the title before the thumbnail; retry an empty
// artwork a few times for the same track before giving up.
const ARTWORK_RETRIES = 5;

// =================================================================
// PowerShell definitions, loaded once per host process
// =================================================================
const MEDIA_DEFS = `
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$script:IslandAsTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() |
  Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\`1' })[0]
$script:IslandAsStreamForRead = ([System.IO.WindowsRuntimeStreamExtensions].GetMethods() |
  Where-Object { $_.Name -eq 'AsStreamForRead' -and $_.GetParameters().Count -eq 1 })[0]

Function IslandAwait($WinRtTask, $ResultType) {
  $asTask = $script:IslandAsTask.MakeGenericMethod($ResultType)
  $netTask = $asTask.Invoke($null, @($WinRtTask))
  $netTask.Wait(-1) | Out-Null
  $netTask.Result
}

[void][Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager,Windows.Media.Control,ContentType=WindowsRuntime]
$script:IslandSmtcType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]
$script:IslandPropsType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties]

Function IslandSmtcSessions {
  $mgr = IslandAwait ($script:IslandSmtcType::RequestAsync()) ($script:IslandSmtcType)
  $mgr.GetSessions()
}

# Score sessions: Playing=3, Paused=2, else=1. Ties keep the OS order
# (first in list = most recently active).
Function IslandBestSession($sessions, [bool]$requireTitle) {
  $best = $null; $bestScore = 0
  foreach ($s in $sessions) {
    if ($requireTitle) {
      $info = IslandAwait ($s.TryGetMediaPropertiesAsync()) ($script:IslandPropsType)
      if ([string]::IsNullOrEmpty($info.Title)) { continue } # skip empty/dummy sessions
    }
    $st = [string]$s.GetPlaybackInfo().PlaybackStatus
    $score = 1
    if ($st -eq 'Playing') { $score = 3 } elseif ($st -eq 'Paused') { $score = 2 }
    if ($score -gt $bestScore) { $bestScore = $score; $best = $s }
  }
  $best
}

Function IslandB64([string]$s) {
  [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($s))
}

Function IslandMediaQuery([bool]$IncludeArtwork) {
  $sessions = @(IslandSmtcSessions)
  if ($sessions.Count -eq 0) { return '{"status":"no_session"}' }
  $best = IslandBestSession $sessions $true
  if ($null -eq $best) { return '{"status":"no_session"}' }

  $info = IslandAwait ($best.TryGetMediaPropertiesAsync()) ($script:IslandPropsType)
  $playback = $best.GetPlaybackInfo()
  $timeline = $best.GetTimelineProperties()

  $b64 = ''
  if ($IncludeArtwork -and $null -ne $info.Thumbnail -and $null -ne $script:IslandAsStreamForRead) {
    try {
      $stream = IslandAwait ($info.Thumbnail.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType])
      if ($null -ne $stream) {
        $netStream = $script:IslandAsStreamForRead.Invoke($null, @($stream))
        $ms = New-Object System.IO.MemoryStream
        try {
          $netStream.CopyTo($ms)
          $bytes = $ms.ToArray()
          if ($bytes.Length -gt 0) { $b64 = [Convert]::ToBase64String($bytes) }
        } finally {
          $ms.Dispose(); $netStream.Dispose(); $stream.Dispose()
        }
      }
    } catch {}
  }

  @{
    status         = 'active'
    title          = IslandB64 ([string]$info.Title)
    artist         = IslandB64 ([string]$info.Artist)
    album          = IslandB64 ([string]$info.AlbumTitle)
    artwork        = $b64
    artworkFetched = [bool]$IncludeArtwork
    playbackStatus = [string]$playback.PlaybackStatus
    position       = [math]::Round($timeline.Position.TotalSeconds, 2)
    lastUpdatedMs  = $timeline.LastUpdatedTime.ToUnixTimeMilliseconds()
    duration       = [math]::Round($timeline.EndTime.TotalSeconds, 2)
    source         = [string]$best.SourceAppUserModelId
    sessionCount   = $sessions.Count
  } | ConvertTo-Json -Compress
}

Function IslandMediaCommand([string]$Action) {
  $best = IslandBestSession @(IslandSmtcSessions) $false
  if ($null -eq $best) { return 'no_session' }
  # WinRT IAsyncOperation has no GetAwaiter() in Windows PowerShell 5.1;
  # await it through AsTask like every other call.
  switch ($Action) {
    'play-pause' { $op = $best.TryTogglePlayPauseAsync() }
    'next'       { $op = $best.TrySkipNextAsync() }
    'previous'   { $op = $best.TrySkipPreviousAsync() }
    default      { throw "unknown media command: $Action" }
  }
  [string](IslandAwait $op ([bool]))
}

Function IslandMediaSeek([double]$SeekPosition) {
  $best = IslandBestSession @(IslandSmtcSessions) $false
  if ($null -eq $best) { return 'no_session' }
  $ticks = [long]($SeekPosition * 10000000)
  [string](IslandAwait ($best.TryChangePlaybackPositionAsync($ticks)) ([bool]))
}
`;

const COMMANDS = new Set(['play-pause', 'next', 'previous']);
const NO_SESSION = () => ({ status: 'no_session', title: '', artist: '' });

class MediaManager {
  constructor() {
    this.currentState = null;
    this.callback = null;
    this._lastStateKey = null;
    this._lastArtwork = null;
    this._debounceTimer = null;
    // Artwork cache for the current track.
    this._artworkKey = null;
    this._artwork = '';
    this._artworkTries = 0;
    this._host = getHost('media');
    this._host.define('media', MEDIA_DEFS);
    this._poller = createGuardedPoller(() => this._poll(), POLL_INTERVAL);
  }

  // ----------------------------------------------------------
  // Start polling SMTC for media state changes
  // ----------------------------------------------------------
  startPolling(callback) {
    this.callback = callback;
    this._poller.start();
  }

  stopPolling() {
    this._poller.stop();
    clearTimeout(this._debounceTimer);
  }

  getCurrentState() {
    return this.currentState;
  }

  async _poll() {
    const state = await this._queryState();
    if (state.status !== 'active') {
      if (this._lastStateKey !== '__no_session__') {
        this._lastStateKey = '__no_session__';
        this.currentState = state;
        if (this.callback) this.callback(state);
      }
      return;
    }

    // Track changes: compare title+artist+status (not position)
    const trackKey = `${state.title}|${state.artist}|${state.playbackStatus}`;
    if (trackKey !== this._lastStateKey) {
      // Track or status changed — debounce to avoid flicker
      this._lastStateKey = trackKey;
      clearTimeout(this._debounceTimer);
      this._debounceTimer = setTimeout(() => {
        this.currentState = state;
        if (this.callback) this.callback(state);
      }, 120);
      return;
    }

    // Same track — update position immediately (no debounce).
    this._flagArtwork(state);
    this.currentState = state;
    if (this.callback) this.callback(state);
  }

  // The state always carries the real base64 (Discord needs actual bytes);
  // `artworkUnchanged` tells main.js it can skip sending it to the renderer.
  _flagArtwork(state) {
    const artworkUnchanged = !!(state.artwork && state.artwork === this._lastArtwork);
    if (state.artwork && !artworkUnchanged) this._lastArtwork = state.artwork;
    state.artworkUnchanged = artworkUnchanged;
  }

  // ----------------------------------------------------------
  // Force an immediate query and send the result to the renderer
  // ----------------------------------------------------------
  forceUpdate() {
    return this._queryState().then((state) => {
      if (state.status === 'active') this._flagArtwork(state);
      this.currentState = state;
      if (this.callback) this.callback(state);
      return state;
    });
  }

  // ----------------------------------------------------------
  // Send a control command (play-pause, next, previous)
  // ----------------------------------------------------------
  sendCommand(command) {
    if (!COMMANDS.has(command)) {
      console.log('[MediaManager] Unknown command:', command);
      return Promise.resolve(false);
    }
    return this._host.call('IslandMediaCommand', [command], { timeout: COMMAND_TIMEOUT })
      .then(() => {
        console.log(`[MediaManager] Command ${command} OK`);
        return true;
      })
      .catch((err) => {
        console.log(`[MediaManager] Command ${command} failed:`, err.message);
        return false;
      });
  }

  // ----------------------------------------------------------
  // Seek to a specific position (in seconds)
  // ----------------------------------------------------------
  seekTo(positionSeconds) {
    console.log('[MediaManager] Seek to:', positionSeconds);
    const pos = Number(positionSeconds) || 0;
    return this._host.call('IslandMediaSeek', [pos], { timeout: COMMAND_TIMEOUT })
      .then(() => true)
      .catch((err) => {
        console.log('[MediaManager] Seek failed:', err.message);
        return false;
      });
  }

  // ----------------------------------------------------------
  // Internal: current state with the cached artwork attached. The
  // thumbnail is fetched only when the track changes (or is still empty).
  // ----------------------------------------------------------
  async _queryState() {
    let state = await this._queryMedia(false);
    if (state.status !== 'active') return state;

    const key = `${state.title}|${state.artist}|${state.source || ''}`;
    if (key !== this._artworkKey) {
      this._artworkKey = key;
      this._artwork = '';
      this._artworkTries = 0;
    }
    if (!this._artwork && this._artworkTries < ARTWORK_RETRIES) {
      this._artworkTries += 1;
      const full = await this._queryMedia(true);
      if (full.status === 'active' && `${full.title}|${full.artist}|${full.source || ''}` === key) {
        this._artwork = full.artwork || '';
        state = full;
      }
    }
    state.artwork = this._artwork;
    delete state.artworkFetched;
    return state;
  }

  _queryMedia(includeArtwork) {
    const startedAt = Date.now();
    return this._host.call('IslandMediaQuery', [!!includeArtwork], { timeout: QUERY_TIMEOUT })
      .then((out) => {
        const raw = (out || '').trim();
        const jsonStart = raw.indexOf('{');
        const jsonEnd = raw.lastIndexOf('}');
        if (jsonStart === -1) return NO_SESSION();
        const data = JSON.parse(raw.substring(jsonStart, jsonEnd + 1));

        // How stale is the reported position? SMTC's `Position` is a
        // snapshot as of `LastUpdatedTime`, and players update it
        // infrequently (or not at all). The real position is
        //   Position + (now - LastUpdatedTime)   while playing.
        // We forward that age so the renderer can add it.
        const lu = Number(data.lastUpdatedMs);
        if (Number.isFinite(lu) && lu > 1000000000000) { // sanity: > 2001
          data.positionAgeMs = Math.max(0, Date.now() - lu);
        } else {
          data.positionAgeMs = Date.now() - startedAt;
        }

        // Decode Base64 strings to UTF-8
        if (data.status === 'active') {
          if (data.title) data.title = Buffer.from(data.title, 'base64').toString('utf8');
          if (data.artist) data.artist = Buffer.from(data.artist, 'base64').toString('utf8');
          if (data.album) data.album = Buffer.from(data.album, 'base64').toString('utf8');
        }
        return data;
      })
      .catch(() => NO_SESSION());
  }
}

module.exports = MediaManager;
