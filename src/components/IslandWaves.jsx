import React, { useEffect, useRef } from 'react';

// Renders a soft wavy glow along the bottom edge of the island that ripples
// while music is playing. Implemented with an SVG path whose amplitude is
// animated via requestAnimationFrame so it reads as a living, breathing edge.
function IslandWaves({ playing, color = '#ffffff' }) {
  const pathRef = useRef(null);
  const rafRef = useRef(0);
  const tRef = useRef(0);

  useEffect(() => {
    const path = pathRef.current;
    if (!path) return undefined;

    const W = 480;
    const H = 12;
    const baseY = H / 2;
    const draw = () => {
      const amp = playing ? 3 : 0.6;
      const t = tRef.current;
      let d = `M0,${baseY}`;
      for (let x = 0; x <= W; x += 6) {
        const y = baseY + Math.sin((x / W) * Math.PI * 6 + t) * amp;
        d += ` L${x},${y.toFixed(2)}`;
      }
      path.setAttribute('d', d);
      if (playing) tRef.current += 0.08;
      rafRef.current = requestAnimationFrame(draw);
    };
    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [playing]);

  return (
    <svg
      width="100%"
      height="12"
      viewBox="0 0 480 12"
      preserveAspectRatio="none"
      style={{ position: 'absolute', left: 0, right: 0, bottom: -4, pointerEvents: 'none', zIndex: 1, opacity: playing ? 0.8 : 0.35 }}
    >
      <path
        ref={pathRef}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        style={{ filter: `drop-shadow(0 0 4px ${color})` }}
      />
    </svg>
  );
}

export default IslandWaves;
