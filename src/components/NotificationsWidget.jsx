import React from 'react';

function NotificationsWidget({ notifications = [] }) {
  return (
    <div style={{ padding: '8px', color: '#fff', fontSize: '13px' }}>
      <div style={{ fontWeight: 600, marginBottom: '8px' }}>Уведомления</div>
      {notifications.length === 0 ? (
        <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '12px' }}>Нет уведомлений</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {notifications.map((n, i) => (
            <div key={i} style={{ padding: '8px', background: 'rgba(255,255,255,0.06)', borderRadius: '8px', fontSize: '12px' }}>
              <div style={{ fontWeight: 500 }}>{n.app}</div>
              {n.title && <div style={{ color: 'rgba(255,255,255,0.6)', marginTop: '2px' }}>{n.title}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default NotificationsWidget;
