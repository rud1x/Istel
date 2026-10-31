// ============================================================
// Sound Wave Animation
// Renders equalizer bars from REAL FFT levels when provided
// (`levels` = array of 0..1). Falls back to a position-driven
// pseudo-wave (`clock`) or self-animation otherwise.
// ============================================================

import React, { useEffect, useRef, useState } from 'react';

function SoundWave({ color = '#ffffff', size = 'small', power = 100, clock = null, levels = null }) {
  const isLarge = size === 'large';
  const barCount = isLarge ? 5 : 4;
  const barWidth = isLarge ? 3.5 : 2.5;
  const powerScale = Math.max(0.35, Math.min(1.8, (Number(power) || 100) / 100));
  const base = isLarge ? 20 : 14;
  const height = base * powerScale;
  const gap = isLarge ? 2.5 : 2;

  const [, forceTick] = useState(0);
  const rafRef = useRef(0);

  // Only self-tick when we have a clock but no real levels.
  useEffect(() => {
    if (clock == null || levels) return undefined;
    let alive = true;
    const loop = () => {
      if (!alive) return;
      forceTick((n) => (n + 1) % 100000);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => { alive = false; cancelAnimationFrame(rafRef.current); };
  }, [clock, levels]);

  // Resolve per-bar normalized heights.
  const norm = (() => {
    if (Array.isArray(levels) && levels.length) {
      // Resample real levels to barCount bars.
      const out = [];
      for (let i = 0; i < barCount; i++) {
        const idx = Math.floor((i / barCount) * levels.length);
        out.push(Math.max(0.12, Math.min(1, levels[idx] || 0)));
      }
      return out;
    }
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
        if (norm) {
          style.height = `${Math.max(3, base * norm[i] * powerScale)}px`;
          style.transition = 'height 80ms linear';
        } else {
          style.animationDelay = `${[0, 0.12, 0.24, 0.08, 0.18][i]}s`;
          style.animationDuration = `${[0.45, 0.55, 0.4, 0.5, 0.42][i]}s`;
        }
        return <span key={i} className="sound-bar" style={style} />;
      })}
    </div>
  );
}

export default SoundWave;
