// ============================================================
// Live Edge — a liquid, audio-reactive bottom edge for the island.
// Two smooth SVG waves rise from the bottom border. The front wave
// follows the live audio spectrum, the back wave trails behind at lower
// amplitude/opacity for depth.
//
// Raw FFT values spike toward peaks then collapse between beats, which
// makes an edge built directly on them twitch and then "freeze". We run
// every band through a VU-style envelope (fast attack, slow release) so
// the surface holds the music and glides down smoothly instead.
//
// Cheap: two paths recomputed at ~30fps, clipped by the island's own
// rounded clip-path. No React state changes on the audio hot path.
// ============================================================

import React, { useEffect, useRef } from 'react';

const W = 300; // viewBox width (stretched to fit by preserveAspectRatio="none")
const H = 24; // viewBox height
const SEG = 8; // number of surface sample points

// Build a filled wave path: smooth top edge + filled to the bottom.
// `bands` is sampled at SEG points (index i -> bands slot i when sized SEG).
function buildWavePath(amp, phase, bands) {
  const pts = [];
  for (let i = 0; i < SEG; i++) {
    const x = (W * i) / (SEG - 1);
    let band = 0.5;
    if (Array.isArray(bands) && bands.length) {
      const idx = Math.min(bands.length - 1, Math.round((i / (SEG - 1)) * (bands.length - 1)));
      band = Math.max(0, Math.min(1, bands[idx] || 0));
    }
    // Two sines so the surface never looks like a single clean ripple.
    const w = Math.sin(phase * 1.9 + i * 1.15) * 0.5 + Math.sin(phase * 1.1 + i * 0.6) * 0.5;
    const lift = amp * (0.35 + 0.65 * band) * (0.6 + 0.4 * w);
    const y = H - Math.max(1, 1.5 + lift);
    pts.push([x, y]);
  }

  // Smooth with quadratic segments through the midpoints.
  let d = `M 0 ${H} L 0 ${pts[0][1].toFixed(2)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i];
    const p1 = pts[i + 1];
    const mx = (p0[0] + p1[0]) / 2;
    d += ` Q ${mx.toFixed(2)} ${p0[1].toFixed(2)} ${p1[0].toFixed(2)} ${p1[1].toFixed(2)}`;
  }
  d += ` L ${W} ${H} Z`;
  return d;
}

function LiveEdge({ active = true, playing = false, color = '#ffffff', power = 100, spectrum = null }) {
  const backRef = useRef(null);
  const frontRef = useRef(null);
  const rafRef = useRef(0);
  const smoothRef = useRef(null); // SEG-slot envelope state

  // Use a ref for the latest levels so we don't re-render React.
  const levelsRef = useRef(null);

  useEffect(() => {
    if (!spectrum?.available) {
      levelsRef.current = null;
      return undefined;
    }
    return spectrum.subscribe((levels) => {
      levelsRef.current = levels;
    });
  }, [spectrum]);
  const playingRef = useRef(playing);
  playingRef.current = playing;

  const reduceMotion = typeof window !== 'undefined'
    && window.matchMedia
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => {
    if (!active || reduceMotion) {
      const flat = buildWavePath(1.5, 0, null);
      backRef.current?.setAttribute('d', flat);
      frontRef.current?.setAttribute('d', flat);
      return undefined;
    }

    if (!smoothRef.current || smoothRef.current.length !== SEG) {
      smoothRef.current = new Array(SEG).fill(0);
    }
    const smooth = smoothRef.current;

    const powerScale = Math.max(0.25, Math.min(2, (Number(power) || 100) / 100));
    let phase = 0;
    let last = 0;

    const loop = (t) => {
      rafRef.current = requestAnimationFrame(loop);
      if (t - last < 33) return; // ~30fps is plenty for a soft edge
      last = t;

      const playingNow = playingRef.current;
      const bands = levelsRef.current;
      phase += playingNow ? 0.05 : 0.02;

      // Envelope each slot: quick attack on rising energy, slow release on
      // falling energy. This is what stops the twitch-and-freeze look.
      let energy = 0;
      for (let i = 0; i < SEG; i++) {
        let target = 0;
        if (playingNow && Array.isArray(bands) && bands.length) {
          const idx = Math.min(bands.length - 1, Math.round((i / (SEG - 1)) * (bands.length - 1)));
          target = Math.max(0, Math.min(1, bands[idx] || 0));
        }
        const k = target > smooth[i] ? 0.5 : 0.07;
        smooth[i] += (target - smooth[i]) * k;
        energy += smooth[i];
      }
      energy /= SEG;

      const amp = (2 + energy * 14) * powerScale;
      frontRef.current?.setAttribute('d', buildWavePath(amp, phase, smooth));
      backRef.current?.setAttribute('d', buildWavePath(amp * 0.6, phase * 0.7 + 1.5, smooth));
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [active, power, reduceMotion]);

  const gidFront = 'le-front';
  const gidBack = 'le-back';

  return (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        height: '20px',
        pointerEvents: 'none',
        zIndex: 0,
        overflow: 'hidden',
        opacity: active ? 1 : 0,
        transition: 'opacity 0.4s ease',
      }}
    >
      <svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ display: 'block' }}>
        <defs>
          <linearGradient id={gidFront} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.9" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
          <linearGradient id={gidBack} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.4" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path ref={backRef} fill={`url(#${gidBack})`} />
        <path ref={frontRef} fill={`url(#${gidFront})`} />
      </svg>
    </div>
  );
}

export default LiveEdge;
