import React from 'react';

function WeatherWidget({ weather }) {
  const w = weather || null;
  return (
    <div style={{ padding: '8px', color: '#fff', fontSize: '13px', height: '100%', display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div style={{ fontWeight: 600 }}>Погода</div>
      {w ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <span style={{ fontSize: '38px', lineHeight: 1 }}>{w.icon || '☁'}</span>
          <div>
            <div style={{ fontSize: '24px', fontWeight: 600 }}>{w.temp}°</div>
            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)' }}>{w.text || ''}</div>
            {w.city ? <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', marginTop: '2px' }}>{w.city}</div> : null}
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.4)', fontSize: '12px' }}>
          Не удалось загрузить погоду. Укажите город в настройках.
        </div>
      )}
    </div>
  );
}

export default WeatherWidget;
