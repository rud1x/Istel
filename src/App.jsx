// ============================================================
// App Root
// Manages global state (media, calendar, active mode),
// extracts dominant color from album art, and renders
// the DynamicIsland component with live data.
// ============================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';
import DynamicIsland from './components/DynamicIsland';
import SettingsWindow from './components/SettingsWindow';
import { extractDominantColor } from './utils/colorExtractor';

function IslandApp() {
  const [mediaState, setMediaState] = useState(null);
  const [calendarEvents, setCalendarEvents] = useState([]);
  const [privacyState, setPrivacyState] = useState({ camera: [], microphone: [] });
  const [mode, setMode] = useState('music'); // 'music' | 'calendar' | 'privacy'
  const [accentColor, setAccentColor] = useState('#ffffff');
  const [displayMode, setDisplayMode] = useState('pill'); // 'pill' | 'attached'
  const [isCopied, setIsCopied] = useState(false);
  const [clipboardType, setClipboardType] = useState('generic');
  const [notification, setNotification] = useState(null);
  const [lyrics, setLyrics] = useState(null);
  const [wordSync, setWordSync] = useState(null);
  const [shelfItems, setShelfItems] = useState([]);
  const [pinnedItems, setPinnedItems] = useState([]);

  useEffect(() => {
    window.electronAPI?.pinnedLoad?.().then((items) => {
      if (Array.isArray(items)) setPinnedItems(items);
    });
  }, []);
  const [systemInfo, setSystemInfo] = useState({ lang: null, weather: null });
  const [clipboardHistory, setClipboardHistory] = useState([]);
  const [settings, setSettings] = useState({});
  const [battery, setBattery] = useState(null);
  const [volumeState, setVolumeState] = useState(null);
  const [download, setDownload] = useState(null);
  const notifDurationRef = useRef(1.8);
  const settingsRef = useRef({});

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    const onStart = (d) => setDownload({ ...d });
    const onProgress = (d) => setDownload((prev) => ({ ...(prev || {}), ...d }));
    const onDone = (d) => {
      setDownload({ ...d });
      // Hide the banner after a short delay once finished.
      setTimeout(() => setDownload((cur) => (cur && cur.id === d.id ? null : cur)), 6000);
    };
    const u1 = window.electronAPI?.onDownloadStart?.(onStart);
    const u2 = window.electronAPI?.onDownloadProgress?.(onProgress);
    const u3 = window.electronAPI?.onDownloadDone?.(onDone);
    return () => { u1?.(); u2?.(); u3?.(); };
  }, []);

  useEffect(() => {
    const unsub = window.electronAPI?.onVolumeState?.((v) => setVolumeState(v));
    return () => unsub?.();
  }, []);

  useEffect(() => {
    window.electronAPI?.getBattery?.().then((b) => setBattery(b));
    const unsub = window.electronAPI?.onBatteryUpdate?.((b) => setBattery(b));
    return () => unsub?.();
  }, []);

  useEffect(() => {
    window.electronAPI?.settingsGetAll?.().then((s) => {
      if (s) setSettings(s);
    });
    const unsub = window.electronAPI?.onSettingsUpdate?.(({ key, value }) => {
      setSettings((prev) => ({ ...prev, [key]: value }));
    });
    return () => unsub?.();
  }, []);

  useEffect(() => {
    notifDurationRef.current = typeof settings.notifDuration === 'number' ? settings.notifDuration : 1.8;
  }, [settings.notifDuration]);

  useEffect(() => {
    window.electronAPI?.shelfLoad?.().then((items) => {
      if (items) setShelfItems(items);
    });
  }, []);
  const copiedTimeoutRef = useRef(null);

  // Cache artwork so we don't lose it when receiving '__same__' sentinel
  const cachedArtworkRef = useRef(null);
  const lastArtworkRef = useRef(null);

  // Process media updates — handle artwork caching
  const handleMediaUpdate = useCallback((state) => {
    if (!state) return;

    // Main process keeps the real base64 on the state and flags repeats via
    // `artworkUnchanged`; the legacy '__same__' sentinel is still honored in
    // case an older main build is paired with this renderer.
    if (state.artwork === '__same__' || state.artworkUnchanged) {
      if (!state.artwork || state.artwork === '__same__' || state.artwork.length < 10) {
        state.artwork = cachedArtworkRef.current;
      }
    } else if (state.artwork && state.artwork.length > 10) {
      cachedArtworkRef.current = state.artwork;
    } else if (!state.artwork || state.artwork.length < 10) {
      if (cachedArtworkRef.current) {
        state.artwork = cachedArtworkRef.current;
      }
    }

    setMediaState({ ...state });
  }, []);

  // ----------------------------------------------------------
  // Subscribe to real-time media updates from the main process
  // ----------------------------------------------------------
  useEffect(() => {
    // Get initial state
    window.electronAPI?.getMediaState().then((state) => {
      if (state) handleMediaUpdate(state);
    });

    // Listen for live updates
    const unsub = window.electronAPI?.onMediaUpdate((state) => {
      handleMediaUpdate(state);
    });

    return () => unsub?.();
  }, [handleMediaUpdate]);

  // ----------------------------------------------------------
  // Extract dominant color whenever artwork changes
  // ----------------------------------------------------------
  useEffect(() => {
    const artwork = mediaState?.artwork;
    if (!artwork || artwork === '__same__' || artwork === lastArtworkRef.current) return;
    lastArtworkRef.current = artwork;

    extractDominantColor(artwork).then((color) => {
      setAccentColor(color.hex);
    });
  }, [mediaState?.artwork]);

  // ----------------------------------------------------------
  // Subscribe to calendar event updates
  // ----------------------------------------------------------
  useEffect(() => {
    window.electronAPI?.getCalendarEvents().then((events) => {
      if (events) setCalendarEvents(events);
    });

    const unsub = window.electronAPI?.onCalendarUpdate((events) => {
      setCalendarEvents(events || []);
    });

    return () => unsub?.();
  }, []);

  // ----------------------------------------------------------
  // Subscribe to privacy state updates
  // ----------------------------------------------------------
  useEffect(() => {
    window.electronAPI?.getPrivacyState().then((state) => {
      if (state) setPrivacyState(state);
    });

    const unsub = window.electronAPI?.onPrivacyUpdate((state) => {
      setPrivacyState(state || { camera: [], microphone: [] });
    });

    return () => unsub?.();
  }, []);

  // ----------------------------------------------------------
  // Subscribe to display mode changes
  // ----------------------------------------------------------
  useEffect(() => {
    window.electronAPI?.getDisplayMode().then((mode) => {
      if (mode) setDisplayMode(mode);
    });

    const unsub = window.electronAPI?.onDisplayModeChanged((mode) => {
      setDisplayMode(mode);
    });

    return () => unsub?.();
  }, []);

  // ----------------------------------------------------------
  // Subscribe to clipboard updates
  // ----------------------------------------------------------
  useEffect(() => {
    const unsub = window.electronAPI?.onClipboardUpdate((data) => {
      // Respect the live setting; the closure may predate settings load.
      if (settingsRef.current?.clipNotif === false) return;
      setClipboardType(data.type || 'generic');
      setIsCopied(true);
      if (copiedTimeoutRef.current) clearTimeout(copiedTimeoutRef.current);
      copiedTimeoutRef.current = setTimeout(() => {
        setIsCopied(false);
      }, 1500); // 1.5 seconds hold
    });

    return () => {
      unsub?.();
      if (copiedTimeoutRef.current) clearTimeout(copiedTimeoutRef.current);
    };
  }, []);

  // ----------------------------------------------------------
  // Subscribe to lyrics updates
  // ----------------------------------------------------------
  useEffect(() => {
    const unsub = window.electronAPI?.onLyricsUpdate?.((data) => {
      if (data && typeof data === 'object' && data.lyrics !== undefined) {
        setLyrics(data.lyrics);
        setWordSync(data.wordSync);
      } else {
        setLyrics(data);
        setWordSync(null);
      }
    });
    return () => unsub?.();
  }, []);

  // ----------------------------------------------------------
  // Subscribe to clipboard history
  // ----------------------------------------------------------
  useEffect(() => {
    window.electronAPI?.clipboardGetHistory?.().then((h) => {
      if (h) setClipboardHistory(h);
    });
    const unsub = window.electronAPI?.onClipboardHistory?.((h) => {
      setClipboardHistory(h || []);
    });
    return () => unsub?.();
  }, []);

  // ----------------------------------------------------------
  // Subscribe to system info (keyboard layout + weather)
  // ----------------------------------------------------------
  useEffect(() => {
    const unsub = window.electronAPI?.onSystemInfoUpdate?.((data) => {
      if (data) setSystemInfo((prev) => ({ ...prev, ...data }));
    });
    return () => unsub?.();
  }, []);

  // ----------------------------------------------------------
  // Subscribe to notification updates
  // ----------------------------------------------------------
  useEffect(() => {
    const unsub = window.electronAPI?.onNotification?.((data) => {
      setNotification(data);
      setTimeout(() => setNotification(null), notifDurationRef.current * 1000);
    });
    return () => unsub?.();
  }, []);

  // ----------------------------------------------------------
  // Media control handlers (forwarded to main process via IPC)
  // ----------------------------------------------------------
  const handlePlayPause = useCallback(() => {
    window.electronAPI?.mediaPlayPause();
  }, []);

  const handleNext = useCallback(() => {
    window.electronAPI?.mediaNext();
  }, []);

  const handlePrevious = useCallback(() => {
    window.electronAPI?.mediaPrevious();
  }, []);

  const handleSeek = useCallback((positionSeconds) => {
    window.electronAPI?.mediaSeek(positionSeconds);
  }, []);

  // ----------------------------------------------------------
  // Open the source app (click on album art)
  // ----------------------------------------------------------
  const handleOpenSource = useCallback(() => {
    if (mediaState?.source) {
      window.electronAPI?.openSourceApp(mediaState.source);
    }
  }, [mediaState?.source]);

  // Force a fresh media snapshot when the island expands. We must NOT
  // replace the whole mediaState here: the snapshot can carry a slightly
  // different duration or a transient position=0, which made the lyrics
  // manager treat it as a new track (clearing + refetching lyrics) and
  // reset the seekbar to 0:00. Instead we merge only the volatile fields
  // when the track is unchanged.
  const handleExpandRefresh = useCallback(() => {
    window.electronAPI?.getMediaState().then((state) => {
      if (!state) return;
      setMediaState((prev) => {
        if (!prev) return state;
        const sameTrack =
          prev.title === state.title &&
          prev.artist === state.artist &&
          (prev.source || '') === (state.source || '');
        if (!sameTrack) return state;
        // Same track: only refresh position/status, keep duration/artwork/etc.
        return {
          ...prev,
          position: state.position,
          playbackStatus: state.playbackStatus,
        };
      });
    });
  }, []);

  // Toggle between music, calendar, and settings modes
  const toggleMode = useCallback(() => {
    setMode((prev) => {
      if (prev === 'music') return 'calendar';
      if (prev === 'calendar') return 'settings';
      return 'music';
    });
  }, []);

  const handleSetMode = useCallback((newMode) => {
    setMode(newMode);
  }, []);

  return (
    <DynamicIsland
      mode={mode}
      displayMode={displayMode}
      mediaState={mediaState}
      calendarEvents={calendarEvents}
      privacyState={privacyState}
      accentColor={accentColor}
      isCopied={isCopied}
      clipboardType={clipboardType}
      notification={notification}
      lyrics={lyrics}
      wordSync={wordSync}
      shelfItems={shelfItems}
      setShelfItems={setShelfItems}
      pinnedItems={pinnedItems}
      setPinnedItems={setPinnedItems}
      systemInfo={systemInfo}
      clipboardHistory={clipboardHistory}
      settings={settings}
      battery={battery}
      volumeState={volumeState}
      download={download}
      onPlayPause={handlePlayPause}
      onNext={handleNext}
      onPrevious={handlePrevious}
      onSeek={handleSeek}
      onOpenSource={handleOpenSource}
      onToggleMode={toggleMode}
      onSetMode={handleSetMode}
      onExpandRefresh={handleExpandRefresh}
    />
  );
}

function App() {
  const [route, setRoute] = useState(() => (window.location.hash === '#settings' ? 'settings' : 'island'));

  useEffect(() => {
    const onHash = () => setRoute(window.location.hash === '#settings' ? 'settings' : 'island');
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  return route === 'settings' ? <SettingsWindow /> : <IslandApp />;
}

export default App;
