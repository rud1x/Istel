import React from 'react';
import { House, Clipboard, Folder, Cloud, Gear, PencilSimple, Timer } from 'phosphor-react';

const TABS = [
  { id: 'player', icon: House, label: 'Плеер' },
  { id: 'buffer', icon: Clipboard, label: 'Буфер' },
  { id: 'shelf', icon: Folder, label: 'Полка' },
  { id: 'text', icon: PencilSimple, label: 'Текст' },
  { id: 'focus', icon: Timer, label: 'Фокус' },
  { id: 'weather', icon: Cloud, label: 'Погода' },
];

function IslandMenu({ activeTab, onTabChange, onOpenQr, hiddenTabs = [] }) {
  const visibleTabs = TABS.filter((t) => t.id === 'player' || !(Array.isArray(hiddenTabs) && hiddenTabs.includes(t.id)));
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      gap: '4px',
      padding: '4px 6px',
      background: 'rgba(255,255,255,0.05)',
      borderRadius: '16px',
      marginBottom: '6px',
      flexShrink: 0,
      width: '100%',
    }}>
      {visibleTabs.map((tab) => {
        const isActive = activeTab === tab.id;
        const Icon = tab.icon;
        return (
          <button
            key={tab.id}
            onClick={(e) => { e.stopPropagation(); onTabChange(tab.id); }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: isActive ? '5px' : '0',
              padding: isActive ? '5px 12px' : '5px 7px',
              borderRadius: '12px',
              border: 'none',
              background: isActive ? 'rgba(255,255,255,0.12)' : 'transparent',
              color: isActive ? '#fff' : 'rgba(255,255,255,0.45)',
              fontSize: '12px',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={(e) => {
              if (!isActive) {
                e.currentTarget.style.transform = 'scale(1.08)';
                e.currentTarget.style.color = 'rgba(255,255,255,0.85)';
              }
            }}
            onMouseLeave={(e) => {
              if (!isActive) {
                e.currentTarget.style.transform = 'scale(1)';
                e.currentTarget.style.color = 'rgba(255,255,255,0.5)';
              }
            }}
          >
            <Icon size={14} weight={isActive ? 'fill' : 'regular'} />
            {isActive && <span>{tab.label}</span>}
          </button>
        );
      })}

      <div style={{ width: '1px', height: '20px', background: 'rgba(255,255,255,0.1)', margin: '0 4px' }} />

      <button
        onClick={(e) => { e.stopPropagation(); window.electronAPI?.openSettings?.(); }}
        title="Настройки"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '6px 8px',
          borderRadius: '16px',
          border: 'none',
          background: 'transparent',
          color: 'rgba(255,255,255,0.5)',
          cursor: 'pointer',
        }}
      >
        <Gear size={16} />
      </button>
    </div>
  );
}

export default IslandMenu;
