// ============================================================
// Dynamic Island — Main UI Component (v3)
// Pure black pill. Click to expand, click outside to collapse.
// Collapsed: circular album art + color-synced waveform bars
// Expanded: full music player or calendar grid
// ============================================================

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import MusicWidget from './MusicWidget';
import IdleWidget from './IdleWidget';
import IslandMenu from './IslandMenu';
import BufferWidget from './BufferWidget';
import ShelfWidget from './ShelfWidget';
import TextWidget from './TextWidget';
import WeatherWidget from './WeatherWidget';
import PrivacyWidget from './PrivacyWidget';
import SoundWave from './SoundWave';
import PomodoroWidget from './PomodoroWidget';
import IslandToast from './IslandToast';
import IslandBeats from './IslandBeats';
import { parseLrc } from '../utils/lyrics.mjs';
import { addNoteFromText } from '../utils/notesStore';
import useAudioSpectrum from '../utils/useAudioSpectrum';

const SPRING = { type: 'spring', stiffness: 260, damping: 30, mass: 0.9 };

function formatTime(seconds) {
  if (!seconds || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Render a lyric line with the currently-sung word highlighted in accent color.
function renderKaraokeLine(text, timing, accentColor) {
  if (!text) return null;
  if (!timing || timing.end <= timing.start) {
    return <span style={{ color: '#fff' }}>{text}</span>;
  }
  const now = (() => {
    // progress is computed by the caller's clock; here we approximate with the
    // line's own timing only for the fallback path.
    return timing.start;
  })();
  // Split into words keeping spaces.
  const tokens = text.split(/(\s+)/).filter((t) => t.length > 0);
  const weights = tokens.map((t) => Math.max(1, t.length));
  const total = weights.reduce((a, b) => a + b, 0);
  let acc = 0;
  const progress = timing.progress != null ? timing.progress : 0;
  return tokens.map((tok, i) => {
    const w = weights[i] / total;
    const tokStart = acc;
    const tokEnd = acc + w;
    acc = tokEnd;
    const isSpace = /^\s+$/.test(tok);
    if (isSpace) return <span key={i}>{tok}</span>;
    const active = progress >= tokStart && progress < tokEnd;
    const sung = progress >= tokEnd;
    return (
      <span key={i} style={{ color: active ? accentColor : sung ? '#fff' : 'rgba(255,255,255,0.45)', fontWeight: active ? 700 : 500 }}>
        {tok}
      </span>
    );
  });
}

function formatClock() {
  const now = new Date();
  return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
}

function formatDate(short = false) {
  const now = new Date();
  const daysFull = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
  const daysShort = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
  const monthsFull = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  const monthsShort = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  if (short) return `${daysShort[now.getDay()]} · ${now.getDate()} ${monthsShort[now.getMonth()]}`;
  return `${daysFull[now.getDay()]}, ${now.getDate()} ${monthsFull[now.getMonth()]}`;
}

function DynamicIsland({
  mode,
  displayMode = 'pill',
  mediaState,
  calendarEvents,
  privacyState,
  accentColor,
  onPlayPause,
  onNext,
  onPrevious,
  onSeek,
  onOpenSource,
  onToggleMode,
  onSetMode,
  onExpandRefresh,
  isCopied,
  clipboardType = 'generic',
  notification,
  lyrics,
  wordSync,
  shelfItems,
  setShelfItems,
  pinnedItems = [],
  setPinnedItems,
  systemInfo,
  clipboardHistory,
  settings = {},
  battery = null,
  volumeState = null,
  download = null,
}) {
  const userAccent = settings.accent && settings.accent !== 'auto' ? settings.accent : null;
  const pillLyricOn = settings.pillLyric !== false && settings.syncLyrics !== false;
  const roundness = typeof settings.roundness === 'number' ? settings.roundness : 75;
  const scalePct = typeof settings.scale === 'number' ? settings.scale : 100;
  const [isExpanded, setIsExpanded] = useState(false);
  const [expandSignal, setExpandSignal] = useState(0);
  const [shouldShowMedia, setShouldShowMedia] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [activeApp, setActiveApp] = useState(null);
  const [currentTime, setCurrentTime] = useState(() => formatClock());
  const [systemEvent, setSystemEvent] = useState(null);
  const [activeTab, setActiveTab] = useState('player');
  const [qrSignal, setQrSignal] = useState(0);
  const [qrPresetText, setQrPresetText] = useState('');
  const [dismissedBannerId, setDismissedBannerId] = useState(null);
  const [bannerTick, setBannerTick] = useState(0);
  const [fullscreenHidden, setFullscreenHidden] = useState(false);
  const [pomoState, setPomoState] = useState(null);

  useEffect(() => {
    window.electronAPI?.pomodoroGetState?.().then((s) => { if (s) setPomoState(s); });
    const unsub = window.electronAPI?.onPomodoroState?.((s) => { if (s) setPomoState(s); });
    return () => unsub?.();
  }, []);

  // "Do not disturb" while a Pomodoro work phase is active.
  const dndActive = settings.pomoDND === true && pomoState?.running && !pomoState?.paused && pomoState?.phase === 'work';

  // Smooth "suck into the notch" when a fullscreen / borderless game takes over.
  useEffect(() => {
    const unsub = window.electronAPI?.onIslandFullscreen?.((data) => {
      if (data && typeof data.hidden === 'boolean') setFullscreenHidden(data.hidden);
    });
    return () => unsub?.();
  }, []);

  // Re-render every second so time-limited banners disappear on their own.
  useEffect(() => {
    if (fullscreenHidden) return undefined;
    const t = setInterval(() => setBannerTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [fullscreenHidden]);

  // Derive the active clipboard banner synchronously so the island is the
  // correct (wide) size on the very first render — no "grow from small".
  const freshClip = clipboardHistory && clipboardHistory[0];
  const bannerAgeMs = freshClip ? Date.now() - (freshClip.timestamp || 0) : Infinity;
  const bannerVisible =
    settings.clipNotif !== false &&
    !!freshClip &&
    freshClip.id !== dismissedBannerId &&
    bannerAgeMs < (freshClip.type === 'image' ? 6000 : 5000);
  const imageBanner = bannerVisible && freshClip.type === 'image' && freshClip.imageDataUrl ? freshClip : null;
  const textBanner = bannerVisible && freshClip.type === 'text' && freshClip.text ? freshClip : null;

  const handleOpenQr = useCallback(() => {
    setActiveTab('text');
    setQrSignal((n) => n + 1);
  }, []);

  const handleOpenQrWithText = useCallback((text) => {
    setQrPresetText(text || '');
    setActiveTab('text');
    setQrSignal((n) => n + 1);
    if (clipboardHistory && clipboardHistory[0]) setDismissedBannerId(clipboardHistory[0].id);
    // Expand the island so the QR tab is actually visible.
    openTimeRef.current = Date.now();
    window.electronAPI?.forceMediaUpdate?.();
    onExpandRefresh?.();
    setIsExpanded(true);
  }, [onExpandRefresh, clipboardHistory]);



  const islandRef = useRef(null);
  const lastMouseRef = useRef(null);
  const resizeGuardRef = useRef(0); // timestamp until which mouseleave must not collapse
  const lingerTimerRef = useRef(null);
  const openTimeRef = useRef(0);
  const hoverOpenTimerRef = useRef(null);
  const hoverCloseTimerRef = useRef(null);
  const [collapsedPos, setCollapsedPos] = useState(0);
  const [magnet, setMagnet] = useState({ x: 0, y: 0 });

  // "Plush" magnet: when the cursor is near the (collapsed) island, drift a
  // Track the cursor so the mouseleave-collapse can verify it is really
  // outside the island (window resize moves the island under the cursor and
  // fires a spurious mouseleave).
  useEffect(() => {
    const track = (e) => { lastMouseRef.current = { x: e.clientX, y: e.clientY }; };
    window.addEventListener('mousemove', track);
    return () => window.removeEventListener('mousemove', track);
  }, []);

  // little toward it for a soft, rubbery feel.
  useEffect(() => {
    const handler = (e) => {
      const el = islandRef.current;
      if (!el || isExpanded) {
        setMagnet((m) => (m.x === 0 && m.y === 0 ? m : { x: 0, y: 0 }));
        return;
      }
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
      const dist = Math.hypot(dx, dy);
      const radius = 220;
      if (dist < radius) {
        const power = Math.max(0, Math.min(2, (typeof settings.cursorPull === 'number' ? settings.cursorPull : 100) / 100));
        const pull = (1 - dist / radius) * 0.12 * power;
        setMagnet({ x: dx * pull, y: dy * pull });
      } else {
        setMagnet((m) => (m.x === 0 && m.y === 0 ? m : { x: 0, y: 0 }));
      }
    };
    window.addEventListener('mousemove', handler);
    return () => window.removeEventListener('mousemove', handler);
  }, [isExpanded, settings.cursorPull]);

  // Expand on hover (with a short delay so merely passing the cursor over
  // the pill does not pop it open). We intentionally do NOT reset the active
  // tab or the mode here — the island reopens on whatever tab was last used.
  const expandByHover = settings.expandBy !== 'Кликом';

  // Which tab to reveal when the island opens. "Последнюю вкладку" keeps the
  // current one; both player options force the player on every open.
  const applyOpenTab = useCallback(() => {
    if (settings.openTab === 'Плеер' || settings.openTab === 'Всегда плеер') {
      setActiveTab('player');
    }
  }, [settings.openTab]);

  // Never leave the island on a tab the user has hidden.
  useEffect(() => {
    const hidden = Array.isArray(settings.hiddenTabs) ? settings.hiddenTabs : [];
    if (hidden.includes(activeTab)) setActiveTab('player');
  }, [settings.hiddenTabs, activeTab]);

  const expandFromHover = useCallback(() => {
    if (!expandByHover) return;
    if (isExpanded) return;
    // Don't auto-expand while a toast/banner is shown — the user needs to
    // click its action button (e.g. "Сохранить" on a copied image) without
    // the island expanding out from under the cursor.
    if (imageBanner || textBanner || notification) return;
    if (hoverOpenTimerRef.current) return;
    hoverOpenTimerRef.current = setTimeout(() => {
      hoverOpenTimerRef.current = null;
      openTimeRef.current = Date.now();
      window.electronAPI?.forceMediaUpdate?.();
      onExpandRefresh?.();
      setExpandSignal((n) => n + 1);
      setIsExpanded(true);
    }, typeof settings.expandDelay === 'number' ? settings.expandDelay : 110);
  }, [isExpanded, onExpandRefresh, imageBanner, textBanner, notification, settings.expandDelay, expandByHover]);

  const cancelHoverOpen = useCallback(() => {
    if (hoverOpenTimerRef.current) {
      clearTimeout(hoverOpenTimerRef.current);
      hoverOpenTimerRef.current = null;
    }
  }, []);

  useEffect(() => () => cancelHoverOpen(), [cancelHoverOpen]);

  // Слушаем обновления активного окна
  useEffect(() => {
    const handler = (processName) => setActiveApp(processName);
    window.electronAPI?.onActiveWindowUpdate?.(handler);
    return () => window.electronAPI?.removeActiveWindowListener?.();
  }, []);

  // Обновление часов каждую секунду (пауза в полноэкранном режиме)
  useEffect(() => {
    if (fullscreenHidden) return undefined;
    const timer = setInterval(() => {
      setCurrentTime(formatClock());
    }, 1000);
    return () => clearInterval(timer);
  }, [fullscreenHidden]);

  useEffect(() => {
    const handler = (event) => {
      if (dndActive) return;
      // Respect notification toggles: caps lock / volume.
      if (event && event.type === 'capslock' && settings.capsNotif === false) return;
      if (event && event.type === 'volume' && settings.volumeNotif === false) return;
      setSystemEvent(event);
      const ms = (typeof settings.notifDuration === 'number' ? settings.notifDuration : 1.8) * 1000;
      setTimeout(() => setSystemEvent(null), ms);
    };
    // onSystemEvent returns an unsubscribe function — must be used, otherwise
    // every settings change leaks another listener (duplicate events).
    const unsub = window.electronAPI?.onSystemEvent?.(handler);
    return () => unsub?.();
  }, [settings.capsNotif, settings.volumeNotif, settings.notifDuration, dndActive]);

  const lastBatteryRef = useRef(null);
  useEffect(() => {
    if (!battery || settings.batteryNotif === false) return;
    const key = `${battery.percent}|${battery.charging}`;
    if (lastBatteryRef.current === null) { lastBatteryRef.current = key; return; }
    if (key !== lastBatteryRef.current) {
      lastBatteryRef.current = key;
      setSystemEvent({ type: 'battery', level: battery.percent, charging: battery.charging });
      const ms = (typeof settings.notifDuration === 'number' ? settings.notifDuration : 1.8) * 1000;
      setTimeout(() => setSystemEvent(null), ms);
    }
  }, [battery, settings.batteryNotif, settings.notifDuration]);

  const isPlaying = mediaState?.playbackStatus === 'Playing';
  // "Акцент под трек": while playing follow the album color, otherwise use
  // the user's chosen accent. When disabled, the user's accent always wins
  // (with 'auto' meaning album color as a fallback).
  const followTrack = settings.accentFollowTrack !== false;
  const effectiveAccent =
    (isPlaying && (followTrack || settings.accent === 'auto') && accentColor)
      ? accentColor
      : (userAccent || accentColor || '#ffffff');
  const hasMedia = mediaState && mediaState.status !== 'no_session';
  // Real system-audio FFT levels (null when capture unavailable). Declared
  // after isPlaying to avoid a temporal-dead-zone error.
  const audioLevels = useAudioSpectrum(!!isPlaying && !fullscreenHidden, 5);
  const beatPulseActive =
    !isExpanded &&
    isPlaying &&
    settings.expBeats !== false &&
    !imageBanner &&
    !textBanner &&
    !notification &&
    !systemEvent &&
    !isCopied;

  // Anchored clock for the collapsed pill lyric. We anchor on the latest
  // SMTC position (+ its age) and extrapolate with wall-clock time, so the
  // current lyric line stays in sync instead of lagging behind.
  const collapsedAnchorRef = useRef({ pos: 0, at: Date.now() });

  useEffect(() => {
    if (!mediaState) return;
    if (mediaState.position === 0 && collapsedAnchorRef.current.pos > 1 && isPlaying) return;
    const ageSec = (mediaState.positionAgeMs || 0) / 1000;
    const pos = (mediaState.position || 0) + (isPlaying ? ageSec : 0);
    collapsedAnchorRef.current = { pos, at: Date.now() };
    setCollapsedPos(pos);
  }, [mediaState?.position, mediaState?.positionAgeMs, mediaState?.title, isPlaying]);

  useEffect(() => {
    if (!isPlaying || fullscreenHidden) return undefined;
    const timer = setInterval(() => {
      const { pos, at } = collapsedAnchorRef.current;
      const dur = mediaState?.duration || 0;
      let next = pos + (Date.now() - at) / 1000;
      if (dur > 0 && next > dur) next = dur;
      setCollapsedPos(next);
    }, 250);
    return () => clearInterval(timer);
  }, [isPlaying, mediaState?.duration]);

  // Collapse when the OS window loses focus (user clicked another app).
  // Guard with openTimeRef so opening the island (which grabs focus)
  // does not immediately collapse it.
  useEffect(() => {
    const unsub = window.electronAPI?.onIslandBlur?.(() => {
      if (!isExpanded) return;
      if (Date.now() - openTimeRef.current < 400) return;
      setIsExpanded(false);
    });
    return () => unsub?.();
  }, [isExpanded]);

  // Line source for the collapsed pill: word-level timings if available,
  // otherwise a parsed LRC fallback (many tracks only have syncedLyrics).
  const pillLineSource = (wordSync && wordSync.length) ? wordSync : parseLrc(lyrics);
  const collapsedLine = (() => {
    if (!pillLineSource || !pillLineSource.length) return null;
    let idx = -1;
    for (let i = 0; i < pillLineSource.length; i++) {
      const s = pillLineSource[i].start_ms / 1000;
      const e = pillLineSource[i].end_ms / 1000;
      if (collapsedPos >= s && collapsedPos < e) return pillLineSource[i];
      if (collapsedPos >= s) idx = i;
    }
    return idx >= 0 ? pillLineSource[idx] : null;
  })();
  const collapsedLyric = collapsedLine ? collapsedLine.text : null;
  const collapsedLineTiming = collapsedLine
    ? { start: collapsedLine.start_ms / 1000, end: collapsedLine.end_ms / 1000 }
    : null;

  // ----------------------------------------------------------
  // Linger logic: keep music pill for 1 min after playback stops/pauses
  // ----------------------------------------------------------
  useEffect(() => {
    if (isPlaying) {
      setShouldShowMedia(true);
      if (lingerTimerRef.current) {
        clearTimeout(lingerTimerRef.current);
        lingerTimerRef.current = null;
      }
    } else if (hasMedia && shouldShowMedia) {
      // If paused, shrink back to circle after 60 seconds of inactivity
      if (!lingerTimerRef.current) {
        lingerTimerRef.current = setTimeout(() => {
          setShouldShowMedia(false);
          lingerTimerRef.current = null;
        }, 60000); // 1 minute
      }
    } else if (!hasMedia) {
      // No session: shrink immediately
      setShouldShowMedia(false);
      if (lingerTimerRef.current) {
        clearTimeout(lingerTimerRef.current);
        lingerTimerRef.current = null;
      }
    }
  }, [isPlaying, hasMedia]);

  // ----------------------------------------------------------
  // Interactions: click-outside (close) + Escape (close)
  // ----------------------------------------------------------
  // Note: we listen on 'click' (bubble), not 'mousedown' (capture).
  // 'mousedown' fires before the island's own onClick that opens it,
  // which used to close the island the instant it opened. 'click'
  // fires after openTimeRef has been set, so the guard below works.
  // We intentionally do NOT close on window blur: losing focus to the
  // taskbar / another window should not collapse the island.
  useEffect(() => {
    if (!isExpanded) return;

    const handleClickOutside = (e) => {
      if (Date.now() - openTimeRef.current < 300) return;
      if (islandRef.current && !islandRef.current.contains(e.target)) {
        setIsExpanded(false);
      }
    };

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setIsExpanded(false);
    };

    document.addEventListener('click', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('click', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isExpanded]);

  // ----------------------------------------------------------
  // Dimensions and Mouse Interaction
  // ----------------------------------------------------------
  const isAttached = displayMode === 'attached';

  const edgeFade = typeof settings.edgeFade === 'number' ? settings.edgeFade : 100;
  // Per-tab expanded sizes: each section gets just enough room, never full screen.
  const TAB_SIZES = {
    player: { width: 480, height: 248 },
    buffer: { width: 480, height: 300 },
    shelf: { width: 480, height: 300 },
    text: { width: 480, height: 320 },
    focus: { width: 480, height: 258 },
    weather: { width: 480, height: 220 },
  };
  const dimensions = useMemo(() => {
    const rad = Math.round((roundness / 100) * 40);
    const lower = Math.round(rad * Math.min(1, edgeFade / 100));
    if (isExpanded) {
      const size = TAB_SIZES[activeTab] || TAB_SIZES.player;
      return {
        width: size.width,
        height: size.height,
        borderRadius: isAttached ? `0px 0px ${lower}px ${lower}px` : `${rad}px`,
      };
    }
    // Wide banners first so the island is already the right width on the
    // first render (no narrow->wide jump when copying).
    if (download || imageBanner || textBanner) {
      return {
        width: 480,
        height: 48,
        borderRadius: isAttached ? '0px 0px 22px 22px' : '22px',
      };
    }

    // Copy indicator (when notifications enabled) — also wide immediately.
    if (isCopied && settings.clipNotif !== false) {
      return {
        width: 480,
        height: 40,
        borderRadius: isAttached ? '0px 0px 20px 20px' : '20px',
      };
    }
    const w = shouldShowMedia ? 356 : 340;
    return {
      width: w,
      height: 40,
      borderRadius: isAttached ? '0px 0px 20px 20px' : '20px',
    };
  }, [isExpanded, activeTab, shouldShowMedia, isAttached, isCopied, imageBanner, textBanner, download, roundness, edgeFade]);

  useEffect(() => {
    if (isExpanded) {
      window.electronAPI?.setIgnoreMouseEvents(false);
    } else {
      window.electronAPI?.setIgnoreMouseEvents(true, { forward: true });
    }
  }, [isExpanded]);

  // Keep the OS window sized to the (scaled) content so nothing clips or
  // leaves empty space at any zoom level. The window must be big enough for
  // the visual size after the CSS scale(), plus a small margin for shadow.
  useEffect(() => {
    const scale = Math.max(0.5, (typeof settings.scale === 'number' ? settings.scale : 100) / 100);
    const MARGIN = 24;
    const w = Math.ceil(dimensions.width * scale) + MARGIN;
    const h = Math.ceil(dimensions.height * scale) + MARGIN;
    // Debounce so rapid dimension changes (tab switching, transient banners)
    // collapse into one window resize instead of restarting the animation.
    const t = setTimeout(() => {
      // Moving/resizing the OS window under the cursor fires spurious
      // mouseleave/mouseenter; guard against collapsing during that window.
      resizeGuardRef.current = Date.now() + 500;
      window.electronAPI?.setWindowSize?.(w, h);
    }, 40);
    return () => clearTimeout(t);
  }, [dimensions.width, dimensions.height, settings.scale]);

  const collapse = useCallback(() => setIsExpanded(false), []);

  // ----------------------------------------------------------
  // Collapsed content
  // ----------------------------------------------------------
  const renderCollapsed = () => {
    if (download && settings.downloadNotif !== false) {
      const total = download.totalBytes || 0;
      const recv = download.receivedBytes || 0;
      const pct = total > 0 ? Math.min(100, Math.round((recv / total) * 100)) : 0;
      const fmt = (b) => b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} МБ` : `${Math.max(0, Math.round(b / 1024))} КБ`;
      const speedTxt = download.speed > 0 ? `${fmt(download.speed)}/с` : '';
      const done = download.state === 'completed';
      const failed = download.state === 'failed' || download.state === 'interrupted';
      return (
        <motion.div
          key="download-banner"
          className="island-collapsed-content"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.18 }}
          style={{ justifyContent: 'flex-start', paddingLeft: '10px', gap: '10px' }}
        >
          <div className="island-thumb-circle" style={{ background: failed ? 'rgba(255,80,80,0.2)' : 'rgba(52,199,89,0.22)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={failed ? '#ff6b6b' : '#34C759'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          </div>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '3px' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {download.filename}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '10.5px', color: 'rgba(255,255,255,0.55)', whiteSpace: 'nowrap' }}>
                {done ? 'Загружено' : failed ? 'Ошибка' : `${fmt(recv)}${total ? ' · ' + fmt(total) : ''}${speedTxt ? ' · ' + speedTxt : ''}`}
              </span>
              {!done && !failed && (
                <div style={{ flex: 1, height: '3px', borderRadius: '2px', background: 'rgba(255,255,255,0.12)', overflow: 'hidden', minWidth: '40px' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: '#34C759', borderRadius: '2px', transition: 'width 0.25s ease' }} />
                </div>
              )}
            </div>
          </div>
          {done && (
            <button
              onClick={(e) => { e.stopPropagation(); window.electronAPI?.openPath?.(download.savePath); }}
              style={{ background: '#fff', color: '#000', border: 'none', borderRadius: '14px', padding: '5px 12px', fontSize: '11px', fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}
            >
              Открыть
            </button>
          )}
        </motion.div>
      );
    }

    if (textBanner) {
      return (
        <motion.div
          key="text-banner"
          className="island-collapsed-content"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.18 }}
          style={{ justifyContent: 'flex-start', paddingLeft: '12px', gap: '10px' }}
        >
          <div className="island-thumb-circle" style={{ background: 'rgba(255,255,255,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
          </div>
          <div className="island-pill-info" style={{ flex: 1, minWidth: 0 }}>
            <span className="pill-title">Текст скопирован</span>
            <span className="pill-artist" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{textBanner.text.slice(0, 40)}</span>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); addNoteFromText(textBanner.text); setDismissedBannerId(textBanner.id); setActiveTab('text'); }}
            style={{ background: 'rgba(255,255,255,0.14)', color: '#fff', border: 'none', borderRadius: '14px', padding: '5px 12px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}
          >
            В заметки
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); handleOpenQrWithText(textBanner.text); }}
            style={{ background: '#fff', color: '#000', border: 'none', borderRadius: '14px', padding: '5px 14px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}
          >
            QR
          </button>
        </motion.div>
      );
    }

    if (imageBanner) {
      return (
        <motion.div
          key="image-banner"
          className="island-collapsed-content"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.18 }}
          style={{ justifyContent: 'flex-start', paddingLeft: '10px', gap: '10px' }}
        >
          <img src={imageBanner.imageDataUrl} alt="" className="island-thumb-circle" style={{ pointerEvents: 'none', borderRadius: '8px' }} />
          <div className="island-pill-info" style={{ flex: 1, minWidth: 0 }}>
            <span className="pill-title">Картинка скопирована</span>
            <span className="pill-artist">{imageBanner.preview || ''}</span>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); window.electronAPI?.clipboardSaveImage?.(imageBanner.id); }}
            style={{ background: '#fff', color: '#000', border: 'none', borderRadius: '14px', padding: '5px 14px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}
          >
            Сохранить
          </button>
        </motion.div>
      );
    }

    if (notification) {
      return (
        <IslandToast
          keyName="notification"
          accent="rgba(99,179,237,0.25)"
          icon={(
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
          )}
          title={notification.app || 'Уведомление'}
          subtitle={notification.title || ''}
        />
      );
    }

    if (systemEvent) {
      const accentMap = {
        capslock: 'rgba(255,196,0,0.22)',
        volume: `${effectiveAccent}38`,
        battery: 'rgba(52,199,89,0.22)',
      };
      let icon = null;
      let title = '';
      if (systemEvent.type === 'capslock') {
        icon = (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 4L4 12h5v8h6v-8h5z" />
          </svg>
        );
        title = systemEvent.enabled ? 'Caps Lock включён' : 'Caps Lock выключен';
      } else if (systemEvent.type === 'volume') {
        icon = (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 5 6 9H2v6h4l5 4z" />
            <path d="M15.5 8.5a5 5 0 0 1 0 7" />
          </svg>
        );
        title = `Громкость ${systemEvent.level}%`;
      } else if (systemEvent.type === 'battery') {
        icon = (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="7" width="16" height="10" rx="2" />
            <line x1="22" y1="11" x2="22" y2="13" />
          </svg>
        );
        title = `Батарея ${systemEvent.level}%${systemEvent.charging ? ' ⚡' : ''}`;
      }
      return (
        <IslandToast
          keyName={`sys-${systemEvent.type}`}
          accent={accentMap[systemEvent.type] || 'rgba(255,255,255,0.15)'}
          icon={icon}
          title={title}
        />
      );
    }

    if (isCopied && settings.clipNotif !== false) {
      let icon = null;
      let subtitle = "Content copied";
      
      switch (clipboardType) {
        case 'text':
          icon = (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
              <polyline points="10 9 9 9 8 9"></polyline>
            </svg>
          );
          subtitle = "Text copied";
          break;
        case 'file':
          icon = (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
            </svg>
          );
          subtitle = "File copied";
          break;
        case 'image':
          icon = (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
              <circle cx="8.5" cy="8.5" r="1.5"></circle>
              <polyline points="21 15 16 10 5 21"></polyline>
            </svg>
          );
          subtitle = "Image copied";
          break;
        default:
          icon = (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
          );
          subtitle = "Copied";
      }

      return (
        <motion.div
          key="copied"
          className="island-collapsed-content"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          style={{ justifyContent: 'flex-start', paddingLeft: '10px' }}
        >
          <div className="island-thumb-circle" style={{ background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: '8px' }}>
            {icon}
          </div>

          <div className="island-pill-info" style={{ pointerEvents: 'none' }}>
            <span className="pill-title">Copied</span>
            <span className="pill-artist">{subtitle}</span>
          </div>
        </motion.div>
      );
    }

    if (shouldShowMedia) {
      return (
        <motion.div
          key="pill"
          className="island-collapsed-content music-pill"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          {mediaState?.artwork && mediaState.artwork.length > 20 ? (
            <img
              src={`data:image/jpeg;base64,${mediaState.artwork}`}
              alt=""
              className="island-thumb-circle"
              style={{ pointerEvents: 'none' }}
            />
          ) : (
            <div className="island-thumb-circle island-thumb-placeholder" style={{ pointerEvents: 'none' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 18V5l12-2v13" />
                <circle cx="6" cy="18" r="3" />
                <circle cx="18" cy="16" r="3" />
              </svg>
            </div>
          )}

          <div className="music-pill-info" style={{ flex: 1, minWidth: 0, overflow: 'hidden', marginLeft: '10px' }}>
            {pillLyricOn && collapsedLyric && collapsedLineTiming ? (
              <div className="music-pill-title" style={{ overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                {renderKaraokeLine(collapsedLyric, {
                  ...collapsedLineTiming,
                  progress:
                    collapsedLineTiming.end > collapsedLineTiming.start
                      ? Math.max(0, Math.min(1, (collapsedPos - collapsedLineTiming.start) / (collapsedLineTiming.end - collapsedLineTiming.start)))
                      : 0,
                }, effectiveAccent)}
              </div>
            ) : (
              <div className="music-pill-title" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {mediaState?.title || 'Unknown'}
              </div>
            )}
          </div>

          <div className="music-pill-wave">
            {isPlaying ? (
              <SoundWave color={effectiveAccent} size="large" power={settings.wavePower} clock={collapsedPos} levels={audioLevels} />
            ) : (
              <motion.div
                className="island-idle-dot"
                animate={{ opacity: [0.4, 0.8, 0.4] }}
                transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
              />
            )}
          </div>
        </motion.div>
      );
    }

    // Idle state: clock, language, weather, date
    return (
      <motion.div
        key="idle"
        className="island-collapsed-content idle-bar"
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.8 }}
      >
        <div className="idle-group-left">
          <span className="idle-clock">{currentTime}</span>
          {settings.capslock !== false && <span className="idle-lang">{systemInfo?.lang || '—'}</span>}
        </div>
        <div className="idle-group-right">
          <span className="idle-weather">
            {systemInfo?.weather
              ? `${systemInfo.weather.icon} ${systemInfo.weather.temp}°`
              : '—'}
          </span>
          <span className="idle-date">{formatDate(true)}</span>
          {settings.battery !== false && battery && (
            <span className="idle-battery">{battery.percent}%{battery.charging ? ' ⚡' : ''}</span>
          )}
        </div>
      </motion.div>
    );
  };

  const hasCamera = privacyState?.camera?.length > 0;
  const hasMic = privacyState?.microphone?.length > 0;

  const renderIndicator = (type, color) => {
    return (
      <motion.div
        key={`indicator-${type}`}
        layout
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.8 }}
        style={{
          width: '28px',
          height: '28px',
          borderRadius: '50%',
          backgroundColor: '#000000',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          boxShadow: isAttached ? '0 4px 12px rgba(0,0,0,0.5)' : '0 2px 8px rgba(0,0,0,0.6)',
          zIndex: 10,
          marginTop: isAttached ? '6px' : '6px', // Align roughly with the center of the 40px island
        }}
        onClick={(e) => {
          e.stopPropagation();
          onSetMode(`privacy-${type}`);
          if (!isExpanded) {
            onExpandRefresh?.();
            setExpandSignal((n) => n + 1);
            applyOpenTab();
            setIsExpanded(true);
          }
        }}
      >
        <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: color, boxShadow: `0 0 6px ${color}` }} />
      </motion.div>
    );
  };

  return (
    <div className={`island-container ${isAttached ? 'island-container--attached' : 'island-container--pill'}`} style={{ transform: `scale(${(typeof settings.scale === 'number' ? settings.scale : 100) / 100})`, transformOrigin: 'top center', height: '100%' }}>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', justifyContent: 'center' }}>
        <motion.div
          ref={islandRef}
          className={`island ${isExpanded ? 'expanded' : 'collapsed'} ${isAttached ? 'island--attached' : 'island--pill'}`}
        style={(() => {
          const t = settings.theme || 'Классика';
          const map = {
            'Классика': '#000000',
            'Минимал': '#141416',
            'Неон': '#0a1024',
            'Мягкий': '#1a1a1e',
            'Лес': '#0d1a12',
            'Закат': '#1c0f14',
            'Щелчок': '#0b0b0d',
          };
          const shadows = [];
          if (settings.shadow !== false) shadows.push('0 8px 30px rgba(0,0,0,0.55)');
          if (settings.lightBorder !== false) shadows.push('inset 0 1px 0 rgba(255,255,255,0.08)');
          const glass = settings.expGlass === true;
          const base = map[t] || '#000000';
          // Under glass keep a hint of the theme color so it does not vanish.
          const glassBg = base === '#000000' ? 'rgba(20,20,24,0.55)' : `${base}cc`;
          return {
            background: glass ? glassBg : base,
            boxShadow: shadows.length ? shadows.join(', ') : 'none',
            backdropFilter: glass ? 'blur(18px) saturate(1.3)' : undefined,
            WebkitBackdropFilter: glass ? 'blur(18px) saturate(1.3)' : undefined,
            cursor: isExpanded ? 'default' : 'pointer',
            pointerEvents: fullscreenHidden ? 'none' : undefined,
            borderRadius: fullscreenHidden ? '8px' : dimensions.borderRadius,
            overflow: 'hidden',
            // clip-path forces the actual clipping to follow the rounded shape
            // even while Framer's `layout` overrides border-radius mid-animation.
            clipPath: fullscreenHidden ? 'inset(0 round 8px)' : `inset(0 round ${dimensions.borderRadius})`,
            WebkitClipPath: fullscreenHidden ? 'inset(0 round 8px)' : `inset(0 round ${dimensions.borderRadius})`,
            transition: 'border-radius 0.25s ease, clip-path 0.25s ease',
          };
        })()}
        transition={fullscreenHidden ? { duration: 0.42, ease: [0.32, 0.72, 0, 1] } : (() => {
          const a = settings.anim;
          if (a === 'Пружина') return { type: 'spring', stiffness: 500, damping: 22 };
          if (a === 'Плавно') return { type: 'tween', duration: 0.3, ease: 'easeInOut' };
          if (a === 'Волна') return { type: 'spring', stiffness: 300, damping: 30 };
          if (a === 'Желе') return { type: 'spring', stiffness: 220, damping: 14 };
          if (a === 'Тянучка') return { type: 'spring', stiffness: 120, damping: 20 };
          if (a === 'Мяч') return { type: 'spring', stiffness: 700, damping: 12, mass: 0.8 };
          if (a === 'Резинка') return { type: 'spring', stiffness: 600, damping: 18, mass: 0.9 };
          if (a === 'Щелчок') return { type: 'spring', stiffness: 800, damping: 40 };
          if (a === 'Пузырь') return { type: 'spring', stiffness: 400, damping: 26, mass: 1.2 };
          return SPRING;
        })()}
        whileHover={fullscreenHidden ? {} : { scale: 1.03 }}
        animate={fullscreenHidden
          ? { width: 44, height: 16, x: 0, y: -12, scale: 0.4, opacity: 0 }
          : {
              width: dimensions.width,
              height: dimensions.height,
              x: magnet.x,
              y: magnet.y,
              opacity: 1,
              scale: (settings.liveDrop && isPlaying)
                ? [1, 1 + 0.01 * Math.max(0, Math.min(2, (typeof settings.wavePower === 'number' ? settings.wavePower : 100) / 100)), 1]
                : 1,
            }}
        onClick={() => {
          if (!isExpanded) {
            cancelHoverOpen();
            openTimeRef.current = Date.now();
            window.electronAPI?.forceMediaUpdate?.();
            onExpandRefresh?.();
            setExpandSignal((n) => n + 1);
            applyOpenTab();
            setIsExpanded(true);
          }
        }}
        onDragEnter={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!isExpanded) {
            setIsExpanded(true);
            setActiveTab('shelf');
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          const files = Array.from(e.dataTransfer.files);
          if (files.length > 0) {
            if (!isExpanded) setIsExpanded(true);
            setActiveTab('shelf');
            // Передаём файлы в ShelfWidget через глобальное состояние или пропс
            window.dispatchEvent(new CustomEvent('shelf-drop', { detail: files }));
          }
        }}
        onMouseEnter={() => {
          setIsHovered(true);
          window.electronAPI?.setIgnoreMouseEvents(false);
          if (hoverCloseTimerRef.current) {
            clearTimeout(hoverCloseTimerRef.current);
            hoverCloseTimerRef.current = null;
          }
          expandFromHover();
        }}
        onMouseLeave={() => {
          setIsHovered(false);
          cancelHoverOpen();
          // Ignore the transient mouseleave caused by our own window resize.
          if (Date.now() < resizeGuardRef.current) return;
          // Auto-collapse shortly after the cursor leaves the island, instead
          // of waiting for an outside click. The delay avoids collapsing while
          // the cursor briefly crosses a gap.
          if (isExpanded) {
            if (hoverCloseTimerRef.current) clearTimeout(hoverCloseTimerRef.current);
            hoverCloseTimerRef.current = setTimeout(() => {
              hoverCloseTimerRef.current = null;
              // The OS window may have moved/resized under the cursor, firing a
              // spurious mouseleave. Before collapsing, verify the cursor is
              // really outside the island rect.
              const el = islandRef.current;
              if (el && lastMouseRef.current) {
                const r = el.getBoundingClientRect();
                const { x, y } = lastMouseRef.current;
                if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return;
              }
              setIsExpanded(false);
            }, 350);
          } else {
            window.electronAPI?.setIgnoreMouseEvents(true, { forward: true });
          }
        }}
      >
        {/* Bottom inner glow — clipped by the island so it lights the inside
            of the bottom edge, not the outside. */}
        <div
          className={`island-glow ${isPlaying && settings.liveEdge !== false ? 'island-glow--breathing' : ''}`}
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: '22px',
            pointerEvents: 'none',
            '--glow-color': isPlaying && effectiveAccent !== '#ffffff' ? effectiveAccent : 'transparent',
          }}
        />
        <IslandBeats active={beatPulseActive} color={effectiveAccent} power={settings.beatPower} />

        {/* Pomodoro remaining-time outline (conic gradient ring) */}
        {pomoState?.running && pomoState?.durationMs > 0 && (
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: 'inherit',
              pointerEvents: 'none',
              zIndex: 3,
              padding: '2.5px',
              background: `conic-gradient(${effectiveAccent} ${(Math.max(0, Math.min(1, pomoState.remainingMs / pomoState.durationMs)) * 360).toFixed(1)}deg, transparent 0)`,
              WebkitMask: 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)',
              WebkitMaskComposite: 'xor',
              mask: 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)',
              maskComposite: 'exclude',
              opacity: pomoState.paused ? 0.35 : 1,
              transition: 'opacity 0.2s ease',
              filter: `drop-shadow(0 0 4px ${effectiveAccent}aa)`,
            }}
          />
        )}

        <AnimatePresence mode="wait">
          {isExpanded ? (
            <motion.div
              key="expanded"
              className="island-expanded-content"
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.92 }}
              transition={{ duration: 0.2 }}
              style={{ '--accent': effectiveAccent, transition: '--accent 0.4s ease' }}
            >
              <IslandMenu activeTab={activeTab} onTabChange={setActiveTab} onOpenQr={handleOpenQr} hiddenTabs={settings.hiddenTabs || []} />
              <div style={{ flex: 1, overflow: 'auto' }}>
                <AnimatePresence mode="wait">
                  <motion.div
                    key={activeTab}
                    initial={{ opacity: 0, x: 8 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -8 }}
                    transition={{ duration: 0.16 }}
                    style={{ height: '100%' }}
                  >
                {activeTab === 'player' && (
                  hasMedia ? (
                    <MusicWidget
                      mediaState={mediaState}
                      isPlaying={isPlaying}
                      initialPosition={collapsedPos}
                      expandSignal={expandSignal}
                      accentColor={effectiveAccent}
                      settings={settings}
                      lyrics={settings.syncLyrics === false ? null : lyrics}
                      wordSync={settings.syncLyrics === false ? null : wordSync}
                      onPlayPause={onPlayPause}
                      onNext={onNext}
                      onPrevious={onPrevious}
                      onSeek={onSeek}
                      onOpenSource={onOpenSource}
                    />
                  ) : (
                    <IdleWidget
                      currentTime={currentTime}
                      currentDate={formatDate()}
                      systemInfo={systemInfo}
                      pinned={Array.isArray(pinnedItems) ? pinnedItems : []}
                      onAdd={async () => {
                        const picked = await window.electronAPI?.pickShortcut?.();
                        if (picked) {
                          const next = Array.isArray(pinnedItems) ? [...pinnedItems, picked] : [picked];
                          setPinnedItems?.(next);
                          window.electronAPI?.pinnedSave?.(next);
                        }
                      }}
                      onDropFiles={(files) => {
                        const items = files.map((f) => ({
                          id: `pin_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                          name: f.name,
                          path: window.electronAPI?.getPathForFile?.(f) || f.path,
                          ext: (f.name.split('.').pop() || '').toLowerCase(),
                          addedAt: Date.now(),
                        }));
                        const next = Array.isArray(pinnedItems) ? [...pinnedItems, ...items] : items;
                        setPinnedItems?.(next);
                        window.electronAPI?.pinnedSave?.(next);
                      }}
                      onRemove={(idx) => {
                        const next = (pinnedItems || []).filter((_, i) => i !== idx);
                        setPinnedItems?.(next);
                        window.electronAPI?.pinnedSave?.(next);
                      }}
                      onOpen={(item) => window.electronAPI?.openPath?.(item.path)}
                    />
                  )
                )}
                {activeTab === 'buffer' && <BufferWidget items={clipboardHistory} />}
                {activeTab === 'shelf' && <ShelfWidget items={shelfItems} setItems={setShelfItems} />}
                {activeTab === 'text' && <TextWidget qrSignal={qrSignal} qrPresetText={qrPresetText} />}
                {activeTab === 'focus' && (
                  <div style={{ position: 'relative', height: '100%', paddingBottom: '10px', boxSizing: 'border-box' }}>
                    <div
                      aria-hidden="true"
                      style={{
                        position: 'absolute',
                        inset: '-8px -12px',
                        borderRadius: 'inherit',
                        background: `radial-gradient(120% 90% at 50% 0%, ${effectiveAccent}22, transparent 70%)`,
                        pointerEvents: 'none',
                      }}
                    />
                    <div style={{ position: 'relative', height: '100%' }}>
                      <PomodoroWidget accentColor={effectiveAccent} settings={settings} />
                    </div>
                  </div>
                )}
                {activeTab === 'weather' && <WeatherWidget weather={systemInfo?.weather} />}
                  </motion.div>
                </AnimatePresence>
              </div>

            </motion.div>
          ) : (
            <React.Fragment key="collapsed">{renderCollapsed()}</React.Fragment>
          )}
        </AnimatePresence>
        </motion.div>

        {/* Separate Privacy Indicators */}
        <AnimatePresence>
          {!isExpanded && hasCamera && renderIndicator('camera', '#34C759')}
          {!isExpanded && hasMic && renderIndicator('microphone', '#FF9500')}
        </AnimatePresence>
      </div>
    </div>
  );
}

export default DynamicIsland;
