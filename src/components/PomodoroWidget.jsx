import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Play, Pause, ArrowCounterClockwise, Gear } from 'phosphor-react';

function fmt(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const PHASES = {
  work: { label: 'Работа', color: '#ff5a5f' },
  short: { label: 'Перерыв', color: '#34c759' },
  long: { label: 'Длинный перерыв', color: '#0a84ff' },
};

export default function PomodoroWidget({ accentColor = '#3b82f6', settings = {} }) {
  const [state, setState] = useState({ running: false, paused: false, phase: 'work', cyclesDone: 0, remainingMs: 0, durationMs: 0 });

  useEffect(() => {
    let alive = true;
    window.electronAPI?.pomodoroGetState?.().then((s) => { if (alive && s) setState(s); });
    const unsub = window.electronAPI?.onPomodoroState?.((s) => { if (alive && s) setState(s); });
    return () => { alive = false; unsub?.(); };
  }, []);

  const phase = PHASES[state.phase] || PHASES.work;
  const configuredWorkMs = (Number(settings.pomoWork) || 25) * 60000;
  const totalMs = state.durationMs > 0 ? state.durationMs : configuredWorkMs;
  const remaining = state.remainingMs > 0 ? state.remainingMs : totalMs;
  const pct = totalMs > 0 ? Math.max(0, Math.min(1, remaining / totalMs)) : 1;
  const SIZE = 112;
  const R = 46;
  const STROKE = 7;
  const circumference = 2 * Math.PI * R;
  const isIdle = !state.running || state.paused;

  const ctrlBtn = {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: '38px', height: '38px', borderRadius: '50%', cursor: 'pointer',
    transition: 'transform 0.12s, background 0.15s',
  };

  return (
    <div
      style={{
        position: 'relative',
        height: '100%',
        width: '100%',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start',
        gap: '10px', color: '#fff', padding: '2px 6px 0',
      }}
    >
      {/* Ring */}
      <div style={{ position: 'relative', width: `${SIZE}px`, height: `${SIZE}px` }}>
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
          <circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={STROKE} />
          <motion.circle
            cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none"
            stroke={phase.color} strokeWidth={STROKE} strokeLinecap="round"
            strokeDasharray={circumference}
            animate={{ strokeDashoffset: circumference * (1 - pct) }}
            transition={{ ease: 'linear', duration: 0.45 }}
            transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
            style={{ filter: `drop-shadow(0 0 6px ${phase.color}77)` }}
          />
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: '26px', fontWeight: 600, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.5px' }}>{fmt(remaining)}</span>
          <span style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: phase.color, marginTop: '1px' }}>{phase.label}</span>
        </div>
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <button
          type="button"
          onClick={() => window.electronAPI?.pomodoroReset?.()}
          title="Сброс"
          style={{ ...ctrlBtn, border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: 'rgba(255,255,255,0.55)' }}
        >
          <ArrowCounterClockwise size={15} />
        </button>

        <button
          type="button"
          onClick={() => (isIdle ? window.electronAPI?.pomodoroStart?.() : window.electronAPI?.pomodoroPause?.())}
          title={isIdle ? 'Старт' : 'Пауза'}
          style={{
            ...ctrlBtn, width: '48px', height: '48px',
            border: 'none', background: phase.color, color: '#fff',
            boxShadow: `0 5px 16px ${phase.color}66`,
          }}
        >
          {isIdle ? <Play size={19} weight="fill" /> : <Pause size={19} weight="fill" />}
        </button>

        <button
          type="button"
          onClick={() => window.electronAPI?.openSettings?.()}
          title="Настройки фокуса"
          style={{ ...ctrlBtn, border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: 'rgba(255,255,255,0.55)' }}
        >
          <Gear size={15} />
        </button>
      </div>

      <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)' }}>
        Помидоров завершено: {state.cyclesDone}
      </span>
    </div>
  );
}
