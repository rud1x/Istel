import React, { useState, useRef, useEffect } from 'react';
import { ClipboardText, Image as ImageIcon, File, X, Trash, Check } from 'phosphor-react';

function BufferWidget({ items = [] }) {
  const [copiedId, setCopiedId] = useState(null);
  const copiedTimerRef = useRef(null);

  // Clear any pending "copied" timeout on unmount (R5) so we never setState
  // on an unmounted component when the tab is switched quickly.
  useEffect(() => () => {
    if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
  }, []);

  const handlePaste = (item) => {
    window.electronAPI?.clipboardPaste?.(item.id);
    setCopiedId(item.id);
    if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    copiedTimerRef.current = setTimeout(() => setCopiedId((cur) => (cur === item.id ? null : cur)), 1200);
  };

  const handleDelete = (e, item) => {
    e.stopPropagation();
    window.electronAPI?.clipboardDelete?.(item.id);
  };

  const handleClear = (e) => {
    e.stopPropagation();
    window.electronAPI?.clipboardClear?.();
  };

  return (
    <div style={{ padding: '8px', color: '#fff', height: '100%', display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: 'rgba(255,255,255,0.5)' }}>
        <span>Клик — вставить · ПКМ — удалить</span>
        {items.length > 0 && (
          <button
            onClick={handleClear}
            style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontSize: '11px' }}
          >
            <Trash size={12} /> Очистить
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.4)', fontSize: '12px' }}>
          Буфер пуст
        </div>
      ) : (
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {items.map((item) => (
            <div
              key={item.id}
              onClick={() => handlePaste(item)}
              onContextMenu={(e) => { e.preventDefault(); handleDelete(e, item); }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '8px',
                background: 'rgba(255,255,255,0.05)',
                borderRadius: '10px',
                cursor: 'pointer',
                transition: 'background 0.15s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.1)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
            >
              <div style={{ width: '36px', height: '36px', flexShrink: 0, borderRadius: '8px', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.06)' }}>
                {item.type === 'image' && item.imageDataUrl ? (
                  <img src={item.imageDataUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : item.type === 'file' ? (
                  <File size={18} />
                ) : item.type === 'image' ? (
                  <ImageIcon size={18} />
                ) : (
                  <ClipboardText size={18} />
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '12px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {item.type === 'image' ? `Изображение ${item.preview || ''}` : (item.preview || '')}
                </div>
                <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)' }}>
                  {item.type === 'image' ? 'Изображение' : item.type === 'file' ? 'Файл' : 'Текст'}
                </div>
              </div>
              {copiedId === item.id ? (
                <span style={{ display: 'flex', alignItems: 'center', gap: '3px', color: '#34C759', fontSize: '11px', flexShrink: 0 }}>
                  <Check size={14} /> Скопировано
                </span>
              ) : (
                <button
                  onClick={(e) => handleDelete(e, item)}
                  style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', padding: '2px' }}
                >
                  <X size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default BufferWidget;
