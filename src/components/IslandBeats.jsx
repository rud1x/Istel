// ============================================================
// Island Beats — a soft light pulse that travels inside the pill
// while music is playing.
// ============================================================

import React, { useEffect, useRef } from 'react';

function IslandBeats({ active, color = '#3b82f6', power = 100, spectrum = null }) {
  const elRef = useRef(null);
  const intensity = Math.max(0, Math.min(2, (Number(power) || 100) / 100));

  useEffect(() => {
    if (!active || intensity <= 0 || !spectrum?.available) return undefined;

    return spectrum.subscribe((levels) => {
      if (!elRef.current) return;
      // Вычисляем среднюю громкость для пульсации
      const avg = levels.reduce((a, b) => a + b, 0) / levels.length;
      const pulse = Math.min(1, avg * 1.5);
      
      // Обновляем CSS-переменные напрямую в DOM для максимальной производительности
      elRef.current.style.setProperty('--beat-opacity', String(Math.min(0.85, 0.15 + pulse * 0.7 * intensity)));
      elRef.current.style.setProperty('--beat-scale', String(1 + pulse * 0.05 * intensity));
    });
  }, [active, intensity, spectrum]);

  if (!active || intensity <= 0) return null;

  return (
    <div
      ref={elRef}
      className="island-beats"
      aria-hidden="true"
      style={{
        '--beat-color': color,
        '--beat-opacity': 0.24,
        '--beat-scale': 1,
        transition: 'transform 0.05s linear, background 0.05s linear',
      }}
    >
      <span className="island-beat-sweep" />
      <span className="island-beat-sweep island-beat-sweep--delayed" />
    </div>
  );
}

export default IslandBeats;
