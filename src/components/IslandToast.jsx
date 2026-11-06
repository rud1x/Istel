import React from 'react';
import { motion } from 'framer-motion';

/**
 * Unified toast card shown inside the island (collapsed pill or an expanded
 * overlay). One component keeps caps/volume/battery/copy/download/notification
 * visually consistent while allowing a few style presets.
 *
 * props:
 *  - icon: React node rendered in a colored circle
 *  - accent: tint color used by the icon circle and progress bar
 *  - title / subtitle: main and secondary lines
 *  - action: React node rendered on the right (optional)
 *  - progress: 0..1 remaining lifetime (optional) -> thin line at bottom
 *  - variant: 'glass' | 'accent' | 'minimal'
 *  - showIcon / showProgress: per-user toggles
 *  - keyName: animation key
 */
export default function IslandToast({
  icon,
  accent = 'rgba(255,255,255,0.15)',
  title,
  subtitle,
  action,
  progress,
  variant = 'glass',
  showIcon = true,
  showProgress = true,
  keyName = 'toast',
  position = 'bottom',
  animation = 'slide',
  accentTint = true,
}) {
  const isAccent = variant === 'accent';
  const isMinimal = variant === 'minimal';

  const animProps = {
    slide: { initial: { opacity: 0, y: position === 'top' ? -6 : 6, scale: 0.97 }, animate: { opacity: 1, y: 0, scale: 1 }, exit: { opacity: 0, y: position === 'top' ? -6 : 6, scale: 0.97 } },
    fade: { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } },
    pop: { initial: { opacity: 0, scale: 0.85 }, animate: { opacity: 1, scale: 1 }, exit: { opacity: 0, scale: 0.85 } },
  }[animation] || { initial: { opacity: 0, y: 6 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: 6 } };

  return (
    <motion.div
      key={keyName}
      className={`island-collapsed-content island-toast island-toast--${variant}`}
      initial={animProps.initial}
      animate={animProps.animate}
      exit={animProps.exit}
      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
      style={{
        position: 'relative',
        justifyContent: 'flex-start',
        paddingLeft: '10px',
        gap: '10px',
        overflow: 'hidden',
        borderRadius: 'inherit',
        background: isAccent || accentTint
          ? `linear-gradient(90deg, ${accent}3d, ${accent}10)`
          : isMinimal
            ? 'transparent'
            : 'linear-gradient(90deg, rgba(255,255,255,0.06), rgba(255,255,255,0.015))',
        boxShadow: isMinimal ? 'none' : 'inset 0 1px 0 rgba(255,255,255,0.06)',
      }}
    >
      {isAccent && (
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: '2px',
            background: accent,
            opacity: 0.9,
          }}
        />
      )}

      {showIcon && (
        <div
          className="island-thumb-circle"
          style={{
            background: isMinimal ? 'transparent' : accent,
            border: isMinimal ? `1px solid ${accent}` : 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            color: '#fff',
          }}
        >
          {icon}
        </div>
      )}

      <div className="island-pill-info" style={{ flex: 1, minWidth: 0, pointerEvents: 'none', display: 'flex', flexDirection: 'column', gap: '2px' }}>
        <span className="pill-title" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
        {subtitle && (
          <span className="pill-artist" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{subtitle}</span>
        )}
      </div>

      {action}

      {showProgress && typeof progress === 'number' && progress >= 0 && (
        <div style={{ position: 'absolute', left: 0, bottom: 0, height: '2px', width: '100%', background: 'rgba(255,255,255,0.08)' }}>
          <div style={{ height: '100%', width: `${Math.max(0, Math.min(1, progress)) * 100}%`, background: accent, transition: 'width 0.25s linear' }} />
        </div>
      )}
    </motion.div>
  );
}
