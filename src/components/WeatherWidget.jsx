import React from 'react';

function WeatherWidget({ weather }) {
  const w = weather || null;
  if (!w) {
    return (
      <div style={{ padding: '16px', color: 'rgba(255,255,255,0.5)', fontSize: '13px', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
        Не удалось загрузить погоду. Укажите город в настройках.
      </div>
    );
  }

  return (
    <div style={{ padding: '12px 16px', color: '#fff', display: 'flex', flexDirection: 'column', height: '100%', gap: '16px', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', fontWeight: 500, marginBottom: '2px' }}>
            {w.city || 'Погода'}
          </div>
          <div style={{ fontSize: '38px', fontWeight: 600, lineHeight: 1, display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
            {w.temp}°
            <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', fontWeight: 400, marginTop: '6px' }}>
              ощущается как {w.feelsLike || w.temp}°
            </span>
          </div>
          <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.7)', marginTop: '4px' }}>{w.text}</div>
        </div>
        <div style={{ fontSize: '52px', lineHeight: 1 }}>{w.icon || '☁'}</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', background: 'rgba(255,255,255,0.03)', padding: '10px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
          <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Влажность</span>
          <span style={{ fontSize: '14px', fontWeight: 600 }}>{w.humidity != null ? `${w.humidity}%` : '—'}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', borderLeft: '1px solid rgba(255,255,255,0.06)', borderRight: '1px solid rgba(255,255,255,0.06)' }}>
          <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Ветер</span>
          <span style={{ fontSize: '14px', fontWeight: 600 }}>{w.wind != null ? `${w.wind} м/с` : '—'}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
          <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Осадки</span>
          <span style={{ fontSize: '14px', fontWeight: 600 }}>{w.precip != null ? `${w.precip} мм` : '0 мм'}</span>
        </div>
      </div>
    </div>
  );
}

export default WeatherWidget;
