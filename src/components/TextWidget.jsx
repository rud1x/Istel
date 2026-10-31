import React, { useEffect, useMemo, useRef, useState } from 'react';
import qrcode from 'qrcode-generator';
import { loadNotes, saveNotes, subscribeNotes } from '../utils/notesStore';

const LS_TASKS = 'island_tasks_v1';

function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

const pillBase = {
  padding: '5px 14px',
  borderRadius: '14px',
  border: 'none',
  cursor: 'pointer',
  fontSize: '12px',
  transition: 'all 0.15s',
};

function SubTabs({ tab, onChange }) {
  const tabs = [
    { id: 'notes', label: 'Заметки' },
    { id: 'qr', label: 'QR-код' },
    { id: 'tasks', label: 'Задачи' },
  ];
  return (
    <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', marginBottom: '8px' }}>
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={(e) => { e.stopPropagation(); onChange(t.id); }}
          style={{
            ...pillBase,
            background: tab === t.id ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.05)',
            color: tab === t.id ? '#fff' : 'rgba(255,255,255,0.6)',
          }}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

function NotesTab() {
  const [notes, setNotes] = useState(() => loadNotes());
  const [activeId, setActiveId] = useState(null);

  useEffect(() => saveNotes(notes), [notes]);

  // React to notes added from outside (copied text -> "В заметки").
  useEffect(() => subscribeNotes((next) => {
    if (Array.isArray(next)) setNotes(next);
  }), []);

  useEffect(() => {
    if (notes.length && activeId == null) setActiveId(notes[0].id);
  }, [notes, activeId]);

  const active = notes.find((n) => n.id === activeId) || null;

  const addNote = () => {
    const id = Date.now();
    const n = { id, title: 'Новая заметка', text: '' };
    setNotes((prev) => [n, ...prev]);
    setActiveId(id);
  };

  const updateActive = (text) => {
    setNotes((prev) => prev.map((n) => (n.id === activeId ? { ...n, text, title: text.slice(0, 18) || 'Новая заметка' } : n)));
  };

  const words = active ? (active.text.trim() ? active.text.trim().split(/\s+/).length : 0) : 0;
  const chars = active ? active.text.length : 0;

  const copy = () => {
    if (active?.text) navigator.clipboard?.writeText(active.text);
  };

  const clear = () => updateActive('');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', height: '100%' }}>
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
        {notes.map((n) => (
          <button
            key={n.id}
            onClick={(e) => { e.stopPropagation(); setActiveId(n.id); }}
            style={{
              ...pillBase,
              padding: '4px 10px',
              background: n.id === activeId ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.05)',
              color: n.id === activeId ? '#fff' : 'rgba(255,255,255,0.6)',
              maxWidth: '120px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {n.title}
          </button>
        ))}
        <button onClick={(e) => { e.stopPropagation(); addNote(); }} style={{ ...pillBase, padding: '4px 10px', background: 'rgba(255,255,255,0.05)', color: '#fff' }}>+</button>
      </div>

      <textarea
        value={active?.text || ''}
        onChange={(e) => updateActive(e.target.value)}
        placeholder="Нажмите, чтобы писать..."
        style={{
          flex: 1,
          minHeight: '90px',
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '12px',
          color: '#fff',
          padding: '10px',
          fontSize: '12px',
          resize: 'none',
          outline: 'none',
        }}
      />

      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'rgba(255,255,255,0.45)' }}>
        <span>Слов: {words} · Символов: {chars}</span>
        <span style={{ display: 'flex', gap: '10px' }}>
          <button onClick={(e) => { e.stopPropagation(); copy(); }} style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontSize: '11px' }}>Копировать</button>
          <button onClick={(e) => { e.stopPropagation(); clear(); }} style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontSize: '11px' }}>Очистить</button>
        </span>
      </div>
    </div>
  );
}

function QrCanvas({ text, size = 150 }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, size, size);

    if (!text.trim()) {
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, size, size);
      return;
    }

    // Local QR generation — no network, no third-party API.
    // qrcode-generator is CommonJS; under Vite ESM interop the default
    // import can be either the function itself or { default: fn }.
    const qrGen = typeof qrcode === 'function' ? qrcode : (qrcode && qrcode.default);
    let qr;
    try {
      if (typeof qrGen !== 'function') throw new Error('qrcode lib not a function');
      qr = qrGen(0, 'M');
      // qrcode-generator's 'Byte' mode treats each char as one byte (Latin-1),
      // which corrupts non-ASCII text (e.g. Cyrillic). Encode the string to
      // UTF-8 first and feed the raw bytes so the QR decodes correctly.
      const utf8Bytes = (() => {
        try {
          return new TextEncoder().encode(String(text));
        } catch {
          return null;
        }
      })();
      if (utf8Bytes) {
        let byteStr = '';
        for (let i = 0; i < utf8Bytes.length; i++) byteStr += String.fromCharCode(utf8Bytes[i]);
        qr.addData(byteStr, 'Byte');
      } else {
        qr.addData(String(text), 'Byte');
      }
      qr.make();
    } catch (e) {
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, size, size);
      return;
    }

    const count = qr.getModuleCount();
    const quiet = 4; // required quiet zone (in modules)
    const total = count + quiet * 2;
    // Integer scale so every module is exactly the same pixel size —
    // fractional scaling is what makes QR codes look "ragged".
    const scale = Math.max(1, Math.floor(size / total));
    const drawSize = total * scale;
    const offset = Math.floor((size - drawSize) / 2);

    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#000';
    for (let r = 0; r < count; r++) {
      for (let c = 0; c < count; c++) {
        if (qr.isDark(r, c)) {
          ctx.fillRect(
            offset + (c + quiet) * scale,
            offset + (r + quiet) * scale,
            scale,
            scale
          );
        }
      }
    }
  }, [text, size]);

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      style={{ width: '100%', height: '100%', display: 'block', imageRendering: 'pixelated' }}
    />
  );
}

function QrTab({ presetText }) {
  const [text, setText] = useState(presetText || '');

  useEffect(() => {
    if (presetText) setText(presetText);
  }, [presetText]);
  const canvasWrapRef = useRef(null);

  const hasQr = !!text.trim();

  const fromClipboard = async () => {
    try {
      const t = await navigator.clipboard?.readText();
      if (t) setText(t);
    } catch {}
  };

  const copyText = () => { if (text) navigator.clipboard?.writeText(text); };

  const saveQr = () => {
    if (!hasQr) return;
    const canvas = canvasWrapRef.current?.querySelector('canvas');
    if (!canvas) return;
    try {
      const url = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = url;
      a.download = 'qrcode.png';
      a.click();
    } catch {}
  };

  return (
    <div style={{ display: 'flex', gap: '10px', flex: 1, minHeight: 0 }}>
      <div ref={canvasWrapRef} style={{ width: '150px', height: '150px', flexShrink: 0, borderRadius: '12px', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        <QrCanvas text={text} size={150} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, gap: '6px' }}>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Текст для QR-кода"
          style={{ flex: 1, minHeight: '60px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', color: '#fff', padding: '8px', fontSize: '12px', resize: 'none', outline: 'none' }}
        />
        <div style={{ display: 'flex', gap: '10px', fontSize: '11px', color: 'rgba(255,255,255,0.6)' }}>
          <button onClick={(e) => { e.stopPropagation(); fromClipboard(); }} style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '11px' }}>Из буфера</button>
          <button onClick={(e) => { e.stopPropagation(); copyText(); }} style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '11px' }}>Копировать</button>
          <button onClick={(e) => { e.stopPropagation(); saveQr(); }} style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '11px' }}>Сохранить</button>
        </div>
      </div>
    </div>
  );
}

function TasksTab() {
  const [tasks, setTasks] = useState(() => load(LS_TASKS, []));
  const [input, setInput] = useState('');

  useEffect(() => save(LS_TASKS, tasks), [tasks]);

  const add = () => {
    const t = input.trim();
    if (!t) return;
    setTasks((prev) => [...prev, { id: Date.now(), text: t, done: false }]);
    setInput('');
  };

  const toggle = (id) => setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
  const removeDone = () => setTasks((prev) => prev.filter((t) => !t.done));

  const remaining = tasks.filter((t) => !t.done).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1, minHeight: 0 }}>
      <div style={{ display: 'flex', gap: '6px' }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); add(); } }}
          placeholder="Новая задача — Enter"
          style={{ flex: 1, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', color: '#fff', padding: '8px 10px', fontSize: '12px', outline: 'none' }}
        />
        <button onClick={(e) => { e.stopPropagation(); add(); }} style={{ ...pillBase, background: 'rgba(255,255,255,0.1)', color: '#fff' }}>+</button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {tasks.map((t) => (
          <div key={t.id} onClick={(e) => { e.stopPropagation(); toggle(t.id); }} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 4px', cursor: 'pointer' }}>
            <span style={{ width: '16px', height: '16px', borderRadius: '50%', border: t.done ? 'none' : '1.5px solid rgba(255,255,255,0.4)', background: t.done ? '#34C759' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {t.done && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="3"><path d="M20 6L9 17l-5-5" /></svg>}
            </span>
            <span style={{ fontSize: '12px', textDecoration: t.done ? 'line-through' : 'none', color: t.done ? 'rgba(255,255,255,0.4)' : '#fff' }}>{t.text}</span>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'rgba(255,255,255,0.45)' }}>
        <span>Осталось: {remaining} из {tasks.length}</span>
        <button onClick={(e) => { e.stopPropagation(); removeDone(); }} style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontSize: '11px' }}>Удалить выполненные</button>
      </div>
    </div>
  );
}

function TextWidget({ qrSignal = 0, qrPresetText = '' }) {
  const [tab, setTab] = useState('notes');

  useEffect(() => {
    if (qrSignal > 0) setTab('qr');
  }, [qrSignal]);
  return (
    <div style={{ padding: '8px', color: '#fff', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <SubTabs tab={tab} onChange={setTab} />
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {tab === 'notes' && <NotesTab />}
        {tab === 'qr' && <QrTab presetText={qrPresetText} />}
        {tab === 'tasks' && <TasksTab />}
      </div>
    </div>
  );
}

export default TextWidget;
