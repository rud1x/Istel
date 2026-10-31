import React from 'react';
import { motion } from 'framer-motion';

/**
 * Unified toast card shown inside the collapsed island pill.
 * Same look for every notification type (caps, volume, battery,
 * copy, download, external notification).
 *
 * props:
 *  - icon: React node (phosphor icon) rendered in a colored circle
 *  - accent: circle background tint color
 *  - title: main line
 *  - subtitle: secondary line (optional)
 *  - action: React node (button) on the right (optional)
 *  - progress: 0..1 remaining lifetime (optional) -> thin line at bottom
 *  - keyName: animation key
 */
export default function IslandToast({ icon, accent = 'rgba(255,255,255,0.15)', title, subtitle, action, progress, keyName = 'toast' }) {
  return (
    <motion.div
      key={keyName}
      className="island-collapsed-content"
      initial={{ opacity: 0, y: -6, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -6, scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
      style={{
        position: 'relative',
        justifyContent: 'flex-start',
        paddingLeft: '10px',
        gap: '10px',
        overflow: 'hidden',
      }}
    >
      <div
        className="island-thumb-circle"
        style={{ background: accent, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: '#fff' }}
      >
        {icon}
      </div>

      <div className="island-pill-info" style={{ flex: 1, minWidth: 0, pointerEvents: 'none', display: 'flex', flexDirection: 'column', gap: '2px' }}>
        <span className="pill-title" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
        {subtitle && (
          <span className="pill-artist" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{subtitle}</span>
        )}
      </div>

      {action}

      {typeof progress === 'number' && progress >= 0 && (
        <div style={{ position: 'absolute', left: 0, bottom: 0, height: '2px', width: '100%', background: 'rgba(255,255,255,0.08)' }}>
          <div style={{ height: '100%', width: `${Math.max(0, Math.min(1, progress)) * 100}%`, background: accent, transition: 'width 0.25s linear' }} />
        </div>
      )}
    </motion.div>
  );
}
