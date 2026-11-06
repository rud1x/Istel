import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Check } from 'phosphor-react';

// Full theme creator: a live island preview, solid or gradient background,
// accent color and a name. Returns { name, bg, dot, gradient } on save.
const PRESETS = [
  { name: 'Ночной', bg: '#0b0b12', dot: '#8b5cf6' },
  { name: 'Океан', bg: '#071a2b', dot: '#38bdf8' },
  { name: 'Закат', bg: '#1c0f14', dot: '#fb7185' },
  { name: 'Лес', bg: '#0d1a12', dot: '#4ade80' },
];

function previewBackground(mode, bg, bg2, angle) {
  if (mode === 'gradient') {
    return `linear-gradient(${angle}deg, ${bg} 0%, ${bg2} 100%)`;
  }
  return bg;
}

export default function ThemeCreatorModal({ onClose, onSave, initial = null }) {
  const isEdit = !!initial;
  const initGrad = typeof initial?.bg === 'string' && initial.bg.includes('gradient');
  const gradMatch = initGrad ? initial.bg.match(/linear-gradient\((\d+)deg,\s*([^,]+),\s*([^)]+)\)/) : null;
  const [name, setName] = useState(initial?.name || '');
  const [mode, setMode] = useState(initGrad ? 'gradient' : 'solid'); // 'solid' | 'gradient'
  const [bg, setBg] = useState(gradMatch ? gradMatch[2].trim() : (initial?.bg || '#101014'));
  const [bg2, setBg2] = useState(gradMatch ? gradMatch[3].trim() : '#2a1a44');
  const [angle, setAngle] = useState(gradMatch ? Number(gradMatch[1]) : 135);
  const [dot, setDot] = useState(initial?.dot || '#a78bfa');

  const stageBg = previewBackground(mode, bg, bg2, angle);
  const canSave = name.trim().length > 0;

  const save = () => {
    if (!canSave) return;
    onSave({
      name: name.trim(),
      bg: mode === 'gradient' ? `linear-gradient(${angle}deg, ${bg}, ${bg2})` : bg,
      dot,
      gradient: mode === 'gradient',
    });
  };

  const modal = (
    <div className="tcm-backdrop" onClick={onClose}>
      <div className="tcm" onClick={(e) => e.stopPropagation()}>
        <div className="tcm__head">
          <div>
            <div className="tcm__title">{isEdit ? 'Редактировать тему' : 'Своя тема'}</div>
            <div className="tcm__sub">Собери оформление и посмотри, как оно выглядит</div>
          </div>
          <button type="button" className="tcm__close" onClick={onClose} aria-label="Закрыть">
            <X size={16} />
          </button>
        </div>

        <div className="tcm__body">
          {/* Live preview */}
          <div className="tcm__preview">
            <div className="tcm__stage" style={{ background: stageBg }}>
              <div className="tcm__island" style={{ background: stageBg }}>
                <div className="tcm__island-art" style={{ background: `linear-gradient(135deg, ${dot}, ${dot}88)` }} />
                <div className="tcm__island-lines">
                  <span style={{ background: dot }} />
                  <span style={{ background: 'rgba(255,255,255,0.35)' }} />
                </div>
                <div className="tcm__island-wave" style={{ color: dot }}>
                  <i style={{ height: 5 }} /><i style={{ height: 9 }} /><i style={{ height: 6 }} />
                </div>
              </div>
            </div>
          </div>

          {/* Controls */}
          <div className="tcm__controls">
            <label className="tcm__label">Название</label>
            <input
              className="tcm__input"
              placeholder="Например, Полночь"
              value={name}
              maxLength={24}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') save(); }}
            />

            <label className="tcm__label">Фон</label>
            <div className="tcm__seg">
              <button type="button" className={mode === 'solid' ? 'is-active' : ''} onClick={() => setMode('solid')}>Сплошной</button>
              <button type="button" className={mode === 'gradient' ? 'is-active' : ''} onClick={() => setMode('gradient')}>Градиент</button>
            </div>

            <div className="tcm__colors">
              <label className="tcm__color">
                <span>{mode === 'gradient' ? 'Цвет 1' : 'Цвет'}</span>
                <input type="color" value={bg} onChange={(e) => setBg(e.target.value)} />
              </label>
              {mode === 'gradient' && (
                <label className="tcm__color">
                  <span>Цвет 2</span>
                  <input type="color" value={bg2} onChange={(e) => setBg2(e.target.value)} />
                </label>
              )}
              <label className="tcm__color">
                <span>Акцент</span>
                <input type="color" value={dot} onChange={(e) => setDot(e.target.value)} />
              </label>
            </div>

            {mode === 'gradient' && (
              <>
                <label className="tcm__label">Угол градиента: {angle}°</label>
                <input
                  type="range"
                  min="0"
                  max="360"
                  value={angle}
                  className="tcm__range"
                  onChange={(e) => setAngle(Number(e.target.value))}
                />
              </>
            )}

            <div className="tcm__presets">
              {PRESETS.map((p) => (
                <button
                  key={p.name}
                  type="button"
                  className="tcm__preset"
                  title={p.name}
                  style={{ background: p.bg }}
                  onClick={() => { setMode('solid'); setBg(p.bg); setDot(p.dot); }}
                >
                  <span style={{ background: p.dot }} />
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="tcm__foot">
          <button type="button" className="tcm__btn" onClick={onClose}>Отмена</button>
          <button type="button" className="tcm__btn tcm__btn--accent" disabled={!canSave} onClick={save}>
            <Check size={14} /> {isEdit ? 'Сохранить изменения' : 'Сохранить тему'}
          </button>
        </div>
      </div>
    </div>
  );

  // Portal to <body>: otherwise position:fixed is trapped inside .st-section
  // (which has overflow:hidden + a transform animation), so the modal renders
  // clipped inside the theme block instead of covering the whole window.
  return createPortal(modal, document.body);
}
