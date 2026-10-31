// ============================================================
// Island Beats — a soft light pulse that travels inside the pill
// while music is playing. No outer rings and no shadows.
// ============================================================

import React from 'react';

function IslandBeats({ active, color = '#3b82f6', power = 100 }) {
  const intensity = Math.max(0, Math.min(2, (Number(power) || 100) / 100));
  if (!active || intensity <= 0) return null;

  return (
    <div
      className="island-beats"
      aria-hidden="true"
      style={{
        '--beat-color': color,
        '--beat-opacity': Math.min(0.72, 0.24 + intensity * 0.24),
        '--beat-width': `${26 + intensity * 16}%`,
      }}
    >
      <span className="island-beat-sweep" />
      <span className="island-beat-sweep island-beat-sweep--delayed" />
    </div>
  );
}

export default IslandBeats;
