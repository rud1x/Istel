import React, { useEffect, useState } from 'react';
import { Plus, CloudSun, File, Image as ImageIcon, Link, AppWindow } from 'phosphor-react';

function fileKind(name) {
  const ext = (name.split('.').pop() || '').toLowerCase();
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'].includes(ext)) return 'image';
  if (['exe', 'lnk', 'bat', 'cmd'].includes(ext)) return 'app';
  if (['url', 'html', 'htm'].includes(ext)) return 'link';
  return 'file';
}

function PinIcon({ kind }) {
  if (kind === 'image') return <ImageIcon size={20} />;
  if (kind === 'app') return <AppWindow size={20} />;
  if (kind === 'link') return <Link size={20} />;
  return <File size={20} />;
}

function PinThumb({ item }) {
  const kind = fileKind(item.name);
  const [thumb, setThumb] = useState(null);
  useEffect(() => {
    let alive = true;
    if (kind === 'image' && window.electronAPI?.shelfThumbnail) {
      window.electronAPI.shelfThumbnail(item.path).then((url) => { if (alive && url) setThumb(url); });
    }
    return () => { alive = false; };
  }, [item.path, kind]);
  if (thumb) return <img src={thumb} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />;
  return <PinIcon kind={kind} />;
}

function IdleWidget({ currentTime, currentDate, systemInfo, pinned = [], onAdd, onDropFiles, onRemove, onOpen }) {
  const weather = systemInfo?.weather;

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const files = Array.from(e.dataTransfer.files);
    if (files.length) onDropFiles?.(files);
  };

  return (
    <div style={{ padding: '8px 4px', color: '#fff', display: 'flex', flexDirection: 'column', gap: '12px', height: '100%' }}>
      {/* Clock + weather */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
        <div style={{ flexShrink: 0 }}>
          <div style={{ fontSize: '40px', fontWeight: 300, lineHeight: 1, letterSpacing: '-1px' }}>{currentTime}</div>
          <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', marginTop: '5px', fontWeight: 500 }}>{currentDate}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 11px', borderRadius: '14px', background: 'rgba(255,255,255,0.05)', flexShrink: 0 }}>
          <CloudSun size={19} weight="fill" style={{ color: 'rgba(255,255,255,0.75)' }} />
          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.1 }}>
            <span style={{ fontSize: '15px', fontWeight: 600 }}>{weather ? `${weather.temp}°` : '—'}</span>
            <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)', maxWidth: '110px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {weather ? (weather.city || weather.text || 'Погода') : 'Погода'}
            </span>
          </div>
        </div>
      </div>

      {/* Pinned shortcuts */}
      <div
        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
        onDrop={handleDrop}
        style={{ flex: 1, display: 'flex', flexWrap: 'wrap', gap: '8px', alignContent: 'flex-start', padding: '2px', minHeight: 0, overflowY: 'hidden' }}
      >
        {pinned.map((item, i) => (
          <div
            key={item.id || i}
            onClick={() => onOpen?.(item)}
            onContextMenu={(e) => { e.preventDefault(); onRemove?.(i); }}
            title={item.name}
            style={{
              position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
              padding: '6px 4px', borderRadius: '10px', background: 'rgba(255,255,255,0.04)', cursor: 'pointer',
              textAlign: 'center', transition: 'background 0.15s', width: '66px',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.1)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
          >
            <div style={{ width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '8px', overflow: 'hidden', background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.85)' }}>
              <PinThumb item={item} />
            </div>
            <span style={{ fontSize: '9.5px', lineHeight: 1.15, wordBreak: 'break-word', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
              {item.name}
            </span>
          </div>
        ))}

        <button
          type="button"
          onClick={onAdd}
          title="Закрепить объект"
          style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '4px',
            border: '1px dashed rgba(255,255,255,0.2)', borderRadius: '10px', background: 'rgba(255,255,255,0.02)',
            color: 'rgba(255,255,255,0.6)', fontSize: '9.5px', cursor: 'pointer', minHeight: '66px', width: '66px', transition: 'background 0.2s',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.07)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')}
        >
          <Plus size={18} />
          Добавить
        </button>
      </div>
    </div>
  );
}

export default IdleWidget;
