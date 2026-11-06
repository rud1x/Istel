// ============================================================
// Sound Wave Animation
// Renders equalizer bars from REAL FFT levels when a live `spectrum`
// source is available (see useAudioSpectrum). Falls back to a
// position-driven pseudo-wave (`clock`) or CSS self-animation otherwise.
//
// Live levels are written straight to the bars' style via refs, so the
// visualizer never re-renders React (and never re-renders the island).
// ============================================================

import React, { useEffect, useRef } from 'react';

const MIN_LEVEL = 0.12;

function SoundWave({ color = '#ffffff', size = 'small', power = 100, clock = null, spectrum = null }) {
  const isLarge = size === 'large';
  const barCount = isLarge ? 5 : 4;
  const barWidth = isLarge ? 3.5 : 2.5;
  const powerScale = Math.max(0.35, Math.min(1.8, (Number(power) || 100) / 100));
  const base = isLarge ? 20 : 14;
  const height = base * powerScale;
  const gap = isLarge ? 2.5 : 2;

  const live = !!spectrum?.available;
  const barsRef = useRef([]);

  useEffect(() => {
    if (!live) return undefined;
    return spectrum.subscribe((levels) => {
      const bars = barsRef.current;
      for (let i = 0; i < barCount; i++) {
        const el = bars[i];
        if (!el) continue;
        // Resample real levels to barCount bars.
        const idx = Math.floor((i / barCount) * levels.length);
        const v = Math.max(MIN_LEVEL, Math.min(1, levels[idx] || 0));
        el.style.height = `${Math.max(3, base * v * powerScale)}px`;
      }
    });
  }, [live, spectrum, barCount, base, powerScale]);

  // Per-bar normalized heights for the non-live modes.
  const norm = (() => {
    if (live) return null;
    if (clock != null) {
      const t = Number(clock) || 0;
      return Array.from({ length: barCount }).map((_, i) => {
        const phase = t * (3.1 + i * 0.7) + i * 1.3;
        const v = 0.5 + 0.5 * Math.sin(phase) * Math.cos(phase * 0.37);
        return Math.max(0.18, Math.min(1, v));
      });
    }
    return null;
  })();

  return (
    <div
      className="sound-wave"
      style={{ height: `${height}px`, gap: `${gap}px` }}
      aria-hidden="true"
    >
      {Array.from({ length: barCount }).map((_, i) => {
        const style = { width: `${barWidth}px`, backgroundColor: color };
        if (live) {
          // Height is driven by the spectrum subscription above.
          style.height = `${Math.max(3, base * MIN_LEVEL * powerScale)}px`;
          style.transition = 'height 80ms linear';
        } else if (norm) {
          style.height = `${Math.max(3, base * norm[i] * powerScale)}px`;
          style.transition = 'height 80ms linear';
        } else {
          style.animationDelay = `${[0, 0.12, 0.24, 0.08, 0.18][i]}s`;
          style.animationDuration = `${[0.45, 0.55, 0.4, 0.5, 0.42][i]}s`;
        }
        return (
          <span
            key={i}
            ref={(el) => { barsRef.current[i] = el; }}
            className="sound-bar"
            style={style}
          />
        );
      })}
    </div>
  );
}

export default SoundWave;
