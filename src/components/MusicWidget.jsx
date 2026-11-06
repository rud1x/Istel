import React, { useRef, useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import SoundWave from './SoundWave';

function MusicWidget({
  mediaState,
  isPlaying,
  initialPosition = 0,
  expandSignal = 0,
  accentColor = '#ffffff',
  settings = {},
  lyrics,
  wordSync,
  onPlayPause,
  onNext,
  onPrevious,
  onSeek,
  onOpenSource,
}) {
  const seekTrackRef = useRef(null);
  const lastTrackKeyRef = useRef('');
  const lastIsPlayingRef = useRef(isPlaying);
  const [isSeeking, setIsSeeking] = useState(false);
  const [seekPreview, setSeekPreview] = useState(null);
  const [displayPosition, setDisplayPosition] = useState(
    initialPosition > 1 ? initialPosition : (mediaState?.position || 0)
  );

  // Anchored clock: we keep the last authoritative position from SMTC plus
  // the performance.now() timestamp when it arrived. Between SMTC updates we
  // extrapolate from that anchor instead of incrementing a local counter, so
  // the widget clock never drifts away from the real player time.
  const anchorRef = useRef({
    pos: initialPosition > 1 ? initialPosition : (mediaState?.position || 0),
    at: Date.now(),
  });

  if (!mediaState || mediaState.status === 'no_session') {
    return (
      <div className="music-widget music-empty">
        <div className="music-empty-icon">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M9 18V5l12-2v13" />
            <circle cx="6" cy="18" r="3" />
            <circle cx="18" cy="16" r="3" />
          </svg>
        </div>
        <span className="music-empty-text">Нет активного трека</span>
      </div>
    );
  }

  const duration = mediaState.duration || 0;
  const mediaPosition = mediaState.position || 0;
  // Consider playback running unless it is explicitly paused/stopped.
  const pbStatus = (mediaState.playbackStatus || '').toLowerCase();
  const playing = mediaState.status === 'active' && pbStatus !== 'paused' && pbStatus !== 'stopped';
  const position = isSeeking ? (seekPreview || 0) : displayPosition;

  // Fallback: parse LRC (syncedLyrics) into timed lines if wordSync is absent.
  const parsedLines = (() => {
    if (wordSync && wordSync.length) return null;
    if (!lyrics || typeof lyrics !== 'string') return null;
    const out = [];
    const re = /\[(\d+):(\d+(?:\.\d+)?)\](.*)/g;
    let m;
    while ((m = re.exec(lyrics)) !== null) {
      const min = parseInt(m[1], 10);
      const sec = parseFloat(m[2]);
      const text = (m[3] || '').trim();
      if (text) out.push({ text, start_ms: (min * 60 + sec) * 1000 });
    }
    for (let i = 0; i < out.length; i++) {
      out[i].end_ms = i + 1 < out.length ? out[i + 1].start_ms : out[i].start_ms + 5000;
    }
    return out.length ? out : null;
  })();
  const progress = duration > 0 ? (position / duration) * 100 : 0;
  const barColor = accentColor !== '#ffffff' ? accentColor : '#fff';

  // Re-anchor whenever a fresh SMTC position arrives (track change, pause,
  // seek, or the periodic 500ms update). Everything downstream derives from
  // this anchor, so there is no accumulating drift.
  // We remember the last raw SMTC position. Many players report a STATIC
  // position (e.g. always 0.3s) and rely on the OS timeline being inferred;
  // the PowerShell query also takes ~1s. So we only re-anchor when the raw
  // position actually CHANGES (seek, track change, resume), and otherwise let
  // the local 100ms clock run smoothly from the last anchor.
  const lastRawPosRef = useRef(null);

  useEffect(() => {
    if (isSeeking) return;

    const trackKey = `${mediaState.source || ''}|${mediaState.title || ''}|${mediaState.artist || ''}|${duration}`;
    const isNewTrack = trackKey !== lastTrackKeyRef.current;

    if (isNewTrack) {
      lastTrackKeyRef.current = trackKey;
      lastRawPosRef.current = mediaPosition;
      const age0 = playing ? (mediaState.positionAgeMs || 0) / 1000 : 0;
      const clamped = clampPosition(mediaPosition + age0, duration);
      anchorRef.current = { pos: clamped, at: Date.now() };
      setDisplayPosition(clamped);
      return;
    }

    // Real position = SMTC snapshot + age since LastUpdatedTime (while playing).
    const ageSec = playing ? (mediaState.positionAgeMs || 0) / 1000 : 0;
    const effective = mediaPosition + ageSec;

    // Position didn't actually change — keep the local clock running.
    if (lastRawPosRef.current === mediaPosition) return;
    lastRawPosRef.current = mediaPosition;

    // A real change (seek or resume). Snap to it, but ignore a transient 0.
    if (playing && mediaPosition === 0 && anchorRef.current.pos > 1) return;

    const clamped = clampPosition(effective, duration);
    anchorRef.current = { pos: clamped, at: Date.now() };
    setDisplayPosition(clamped);
  }, [mediaState.source, mediaState.title, mediaState.artist, mediaState.status, mediaState.playbackStatus, duration, mediaPosition, mediaState.positionAgeMs, isSeeking, playing]);

  useEffect(() => {
    const wasPlaying = lastIsPlayingRef.current;
    if (wasPlaying !== isPlaying && !isSeeking) {
      anchorRef.current = { pos: clampPosition(mediaPosition, duration), at: Date.now() };
      setDisplayPosition(clampPosition(mediaPosition, duration));
    }
    lastIsPlayingRef.current = isPlaying;
  }, [isPlaying, isSeeking, mediaPosition, duration]);

  // Smooth 100ms tick: extrapolate from the anchor using wall-clock time.
  // This never drifts because each new SMTC update re-anchors the clock.
  useEffect(() => {
    if (isSeeking || !playing || duration <= 0) return undefined;
    const timer = setInterval(() => {
      const { pos, at } = anchorRef.current;
      const elapsed = (Date.now() - at) / 1000;
      const next = clampPosition(pos + elapsed, duration);
      setDisplayPosition(next);
    }, 100);
    return () => clearInterval(timer);
  }, [isSeeking, playing, duration]);

  function clampPosition(value, maxDuration) {
    if (!Number.isFinite(value) || value < 0) return 0;
    if (!maxDuration || maxDuration <= 0) return value;
    return value > maxDuration ? maxDuration : value;
  }

  const getSeekPosition = useCallback((clientX) => {
    if (!seekTrackRef.current || !duration) return 0;
    const rect = seekTrackRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return ratio * duration;
  }, [duration]);

  const handleSeekStart = useCallback((e) => {
    e.stopPropagation();
    e.preventDefault();
    setIsSeeking(true);
    const pos = getSeekPosition(e.clientX);
    setSeekPreview(pos);

    const handleMove = (ev) => {
      const p = getSeekPosition(ev.clientX);
      setSeekPreview(p);
    };

    const handleUp = (ev) => {
      const p = getSeekPosition(ev.clientX);
      setIsSeeking(false);
      setSeekPreview(null);
      setDisplayPosition(clampPosition(p, duration));
      onSeek?.(p);
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
    };

    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
  }, [getSeekPosition, onSeek]);

  // Pick the single line that is currently being sung.
  // Falls back to the last line whose start is <= position (so we keep
  // showing something during instrumental gaps), or the first line.
  const lineSource = (wordSync && wordSync.length) ? wordSync : parsedLines;
  const activeLineIdx = (() => {
    if (!lineSource || !lineSource.length) return -1;
    let idx = -1;
    for (let i = 0; i < lineSource.length; i++) {
      const s = lineSource[i].start_ms / 1000;
      const e = lineSource[i].end_ms / 1000;
      if (position >= s && position < e) return i;
      if (position >= s) idx = i;
    }
    return idx;
  })();
  const activeLine = activeLineIdx >= 0 ? lineSource[activeLineIdx] : null;

  const sourceLabel = (() => {
    const s = (mediaState.source || '').toLowerCase();
    if (s.includes('yandex')) return 'Яндекс Музыка';
    if (s.includes('spotify')) return 'Spotify';
    if (s.includes('chrome') || s.includes('msedge')) return 'Браузер';
    if (s.includes('aimp')) return 'AIMP';
    if (s.includes('vlc')) return 'VLC';
    return '';
  })();

  const bgArt = mediaState.artwork && mediaState.artwork.length > 20 ? `data:image/jpeg;base64,${mediaState.artwork}` : null;
  const bgMode = settings.playerBg || 'Без фона';
  // "Сияние" is a soft gradient derived from the accent color; "Обложка"
  // blurs the actual album art. They used to look identical because both
  // used the artwork.
  const isGlow = bgMode === 'Сияние';
  const hasBg = bgMode !== 'Без фона' && (isGlow || !!bgArt);

  const bgStyle = hasBg
    ? { borderRadius: '14px', padding: '6px' }
    : undefined;

  return (
    <div className="music-widget" style={bgStyle}>
      {hasBg && (
        isGlow ? (
          <div
            className="music-bg music-bg--glow"
            style={{
              backgroundImage: 'none',
              background: accentColor === '#ffffff' 
                ? `radial-gradient(120% 120% at 30% 0%, rgba(139, 92, 246, 0.4) 0%, rgba(139, 92, 246, 0.1) 45%, transparent 75%)`
                : `radial-gradient(120% 120% at 30% 0%, ${accentColor}66 0%, ${accentColor}22 45%, transparent 75%)`,
            }}
          />
        ) : (
          <div
            className="music-bg music-bg--cover"
            style={{ backgroundImage: `url(${bgArt})` }}
          />
        )
      )}
      <div className="music-top">
        <div className="music-header">
          <div className="music-art-container" style={{ position: 'relative' }}>
            {mediaState.artwork && mediaState.artwork.length > 20 ? (
              <img src={`data:image/jpeg;base64,${mediaState.artwork}`} alt="" className="music-art" />
            ) : (
              <div className="music-art music-art-placeholder">♪</div>
            )}
          </div>
          <div className="music-info">
            <div className="music-title-row">
              <span className="music-title">{mediaState.title || 'Unknown Track'}</span>
              {isPlaying && settings.playerAnim !== 'Без анимации' && (
                <span className={`music-eq-mini ${settings.playerAnim === 'Пульс и полоски' ? 'music-eq-mini--strips' : ''}`} style={{ color: accentColor }}>
                  <i /><i /><i />
                  {settings.playerAnim === 'Пульс и полоски' && <><i /><i /></>}
                </span>
              )}
            </div>
            <div className="music-artist">{mediaState.artist || 'Unknown Artist'}</div>
            <div className="music-source">
              {activeLine && activeLine.text ? activeLine.text : (sourceLabel || '')}
            </div>
          </div>
        </div>

        <div className="music-controls">
          <button className="music-btn" onClick={(e) => { e.stopPropagation(); onPrevious(); }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6 8.5 6V6z" /></svg>
          </button>
          <button className="music-btn music-btn-play" onClick={(e) => { e.stopPropagation(); onPlayPause(); }}>
            {isPlaying ? (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg>
            ) : (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
            )}
          </button>
          <button className="music-btn" onClick={(e) => { e.stopPropagation(); onNext(); }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" /></svg>
          </button>
        </div>
      </div>

      <div className="music-seekbar-container">
        <div className="music-time-row">
          <span>{formatTime(position)}</span>
          <span>{duration > 0 ? '-' + formatTime(Math.max(0, duration - position)) : formatTime(duration)}</span>
        </div>
        <div ref={seekTrackRef} className="music-seekbar-track" onMouseDown={handleSeekStart}>
          <div className="music-seekbar-fill" style={{ width: `${progress}%`, background: barColor }} />
        </div>
      </div>

      <div className="music-footer">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M11 5L6 9H2v6h4l5 4V5z" />
          <path d="M15.5 8.5a5 5 0 0 1 0 7" />
        </svg>
      </div>
    </div>
  );
}

function formatTime(seconds) {
  if (!seconds || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export default MusicWidget;
