import React, { useEffect, useState } from 'react';
import { File, Image as ImageIcon, Link, AppWindow, Plus, X, Folder } from 'phosphor-react';

function fileKind(name) {
  const ext = (name.split('.').pop() || '').toLowerCase();
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'].includes(ext)) return 'image';
  if (['exe', 'lnk', 'bat', 'cmd'].includes(ext)) return 'app';
  if (['url', 'html', 'htm'].includes(ext)) return 'link';
  if (['mp4', 'mkv', 'mov', 'avi', 'webm'].includes(ext)) return 'video';
  return 'file';
}

function ShelfIcon({ kind }) {
  if (kind === 'image') return <ImageIcon size={22} />;
  if (kind === 'app') return <AppWindow size={22} />;
  if (kind === 'link') return <Link size={22} />;
  if (kind === 'video') return <File size={22} />;
  return <File size={22} />;
}

function ShelfThumb({ item }) {
  const kind = fileKind(item.name);
  const [thumb, setThumb] = useState(null);

  useEffect(() => {
    let alive = true;
    if (kind === 'image' && window.electronAPI?.shelfThumbnail) {
      window.electronAPI.shelfThumbnail(item.path).then((url) => {
        if (alive && url) setThumb(url);
      });
    }
    return () => { alive = false; };
  }, [item.path, kind]);

  if (thumb) {
    return <img src={thumb} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />;
  }
  return <ShelfIcon kind={kind} />;
}

function ShelfWidget({ items, setItems }) {
  const safeItems = Array.isArray(items) ? items : [];

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const files = Array.from(e.dataTransfer.files);
    const newItems = files.map((f) => ({
      name: f.name,
      path: window.electronAPI?.getPathForFile?.(f) || f.path,
      type: 'file',
    }));
    setItems((prev) => {
      const updated = [...prev, ...newItems];
      window.electronAPI?.shelfSave?.(updated);
      return updated;
    });
  };

  const handleOpen = (item) => {
    window.electronAPI?.openPath?.(item.path);
  };

  const handleRemove = (e, idx) => {
    e.stopPropagation();
    setItems((prev) => {
      const updated = prev.filter((_, i) => i !== idx);
      window.electronAPI?.shelfSave?.(updated);
      return updated;
    });
  };

  return (
    <div
      style={{ padding: '8px', color: '#fff', height: '100%', display: 'flex', flexDirection: 'column', gap: '8px' }}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: 'rgba(255,255,255,0.5)' }}>
        <span>Клик — открыть · тащите в любое окно · ПКМ — меню</span>
      </div>

      {safeItems.length === 0 ? (
        <div style={{
          flex: 1,
          border: '1px dashed rgba(255,255,255,0.15)',
          borderRadius: '12px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          color: 'rgba(255,255,255,0.4)',
        }}>
          <Plus size={24} />
          <span>Перетащите файлы сюда</span>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(72px, 1fr))',
          gap: '10px',
          overflowY: 'auto',
          padding: '4px',
        }}>
          {safeItems.map((item, i) => (
            <div
              key={i}
              onClick={() => handleOpen(item)}
              onContextMenu={(e) => { e.preventDefault(); handleRemove(e, i); }}
              style={{
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '4px',
                padding: '6px',
                borderRadius: '10px',
                background: 'rgba(255,255,255,0.04)',
                cursor: 'pointer',
                textAlign: 'center',
                transition: 'background 0.15s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.1)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
            >
              <div style={{ width: '52px', height: '52px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '8px', overflow: 'hidden', background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.8)' }}>
                <ShelfThumb item={item} />
              </div>
              <span style={{
                fontSize: '10px',
                lineHeight: 1.2,
                wordBreak: 'break-word',
                maxWidth: '100%',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
              }}>
                {item.name}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default ShelfWidget;
