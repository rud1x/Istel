import React, { useState } from 'react';

function NotesWidget() {
  const [note, setNote] = useState('');

  return (
    <div style={{ padding: '8px', color: '#fff', fontSize: '13px' }}>
      <div style={{ fontWeight: 600, marginBottom: '8px' }}>Заметки</div>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Нажмите, чтобы писать..."
        style={{
          width: '100%',
          height: '80px',
          background: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: '8px',
          color: '#fff',
          padding: '8px',
          fontSize: '12px',
          resize: 'none',
          outline: 'none',
        }}
      />
    </div>
  );
}

export default NotesWidget;
