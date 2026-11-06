import React, { useEffect, useRef, useState, useCallback } from 'react';
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

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function plainToHtml(value) {
  return escapeHtml(value).replace(/\n/g, '<br>');
}

const pillBase = {
  padding: '5px 14px',
  borderRadius: '14px',
  border: 'none',
  cursor: 'pointer',
  fontSize: '12px',
  transition: 'all 0.15s',
};

const toolBase = {
  minWidth: '28px',
  height: '28px',
  padding: '0 6px',
  borderRadius: '6px',
  border: 'none',
  background: 'transparent',
  color: 'rgba(255,255,255,0.55)',
  cursor: 'pointer',
  fontSize: '13px',
  fontWeight: 500,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  transition: 'all .15s',
};

function SubTabs({ tab, onChange }) {
  const tabs = [
    { id: 'notes', label: 'Редактор' },
    { id: 'qr', label: 'QR-код' },
    { id: 'tasks', label: 'Задачи' },
  ];
  return (
    <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', marginBottom: '8px' }}>
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
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

function ToolButton({ label, title, onClick, active = false, style }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onMouseDown={(e) => e.preventDefault()}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      style={{
        ...toolBase,
        background: active ? 'rgba(255,255,255,0.15)' : 'transparent',
        color: active ? '#fff' : toolBase.color,
        ...style,
      }}
    >
      {label}
    </button>
  );
}

function NotesTab({ onMakeQr }) {
  const [notes, setNotes] = useState(() => {
    const saved = loadNotes();
    return saved.length ? saved : [{ id: Date.now(), title: 'Новая заметка', text: '', html: '' }];
  });
  const [activeId, setActiveId] = useState(null);
  const editorRef = useRef(null);
  const [stats, setStats] = useState({ words: 0, chars: 0 });
  const [activeFormats, setActiveFormats] = useState({});

  useEffect(() => saveNotes(notes), [notes]);

  useEffect(() => subscribeNotes((next) => {
    if (Array.isArray(next)) setNotes(next);
  }), []);

  useEffect(() => {
    if (notes.length && activeId == null) setActiveId(notes[0].id);
  }, [notes, activeId]);

  const active = notes.find((n) => n.id === activeId) || null;

  // Load the active note into the contentEditable once per note switch.
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    const html = active?.html ?? plainToHtml(active?.text || '');
    if (el.innerHTML !== html) el.innerHTML = html;
    const text = el.innerText || '';
    setStats({
      words: text.trim() ? text.trim().split(/\s+/).length : 0,
      chars: text.length,
    });
  }, [activeId, active?._revision]);

  const updateFormats = useCallback(() => {
    try {
      setActiveFormats({
        bold: document.queryCommandState('bold'),
        italic: document.queryCommandState('italic'),
        underline: document.queryCommandState('underline'),
        strikeThrough: document.queryCommandState('strikeThrough'),
        insertUnorderedList: document.queryCommandState('insertUnorderedList'),
        insertOrderedList: document.queryCommandState('insertOrderedList'),
      });
    } catch {}
  }, []);

  useEffect(() => {
    document.addEventListener('selectionchange', updateFormats);
    return () => document.removeEventListener('selectionchange', updateFormats);
  }, [updateFormats]);

  const addNote = () => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    const n = { id, title: 'Новая заметка', text: '', html: '' };
    setNotes((prev) => [n, ...prev]);
    setActiveId(id);
  };

  const deleteNote = (id) => {
    const next = notes.filter((n) => n.id !== id);
    setNotes(next);
    if (id === activeId) setActiveId(next[0]?.id ?? null);
  };

  const commit = (html, text) => {
    if (!active) return;
    const clean = String(text || '');
    const title = clean.trim().split('\n')[0].slice(0, 18).trim() || 'Новая заметка';
    setNotes((prev) => prev.map((n) => (n.id === active.id ? { ...n, html, text: clean, title } : n)));
  };

  const onInput = () => {
    const el = editorRef.current;
    if (!el) return;
    const text = el.innerText || '';
    setStats({
      words: text.trim() ? text.trim().split(/\s+/).length : 0,
      chars: text.length,
    });
    commit(el.innerHTML, text);
  };

  const exec = (command, arg = null) => {
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    try { document.execCommand(command, false, arg); } catch {}
    onInput();
    updateFormats();
  };

  const insertFormat = (tag) => {
    exec('formatBlock', `<${tag}>`);
  };

  const cycleHeading = () => {
    const el = editorRef.current;
    if (!el) return;
    const block = (document.queryCommandValue('formatBlock') || '').toLowerCase();
    if (block === 'h1') insertFormat('h2');
    else if (block === 'h2') insertFormat('h3');
    else if (block === 'h3') insertFormat('p');
    else insertFormat('h1');
  };

  const onKeyDown = (e) => {
    const mod = e.ctrlKey || e.metaKey;
    if (!mod) return;
    const key = e.key.toLowerCase();
    if (key === 'b') { e.preventDefault(); exec('bold'); }
    else if (key === 'i') { e.preventDefault(); exec('italic'); }
    else if (key === 'u') { e.preventDefault(); exec('underline'); }
    else if (e.shiftKey && key === 'x') { e.preventDefault(); exec('strikeThrough'); }
    else if (e.shiftKey && key === '7') { e.preventDefault(); exec('insertOrderedList'); }
    else if (e.shiftKey && key === '8') { e.preventDefault(); exec('insertUnorderedList'); }
    else if (e.shiftKey && key === 'h') { e.preventDefault(); cycleHeading(); }
    else if (key === 'q') { e.preventDefault(); insertFormat('blockquote'); }
  };

  const onPaste = (e) => {
    e.preventDefault();
    const text = e.clipboardData?.getData('text/plain') || '';
    if (text) document.execCommand('insertText', false, text);
    onInput();
  };

  const plainText = () => (editorRef.current?.innerText || '').trim();

  const copy = () => {
    const t = plainText();
    if (t) navigator.clipboard?.writeText(t);
  };

  const makeQr = () => {
    const t = plainText();
    if (t) onMakeQr(t);
  };

  const clear = () => {
    const el = editorRef.current;
    if (!el) return;
    el.innerHTML = '';
    onInput();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', height: '100%', minHeight: 0, padding: '0 2px' }}>
      {/* Заголовки заметок */}
      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', flexShrink: 0 }}>
        {notes.map((n) => (
          <button
            key={n.id}
            type="button"
            onClick={(e) => { e.stopPropagation(); setActiveId(n.id); }}
            onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); deleteNote(n.id); }}
            title="ПКМ — удалить"
            style={{
              ...pillBase,
              padding: '3px 8px',
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
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); addNote(); }}
          style={{ ...pillBase, padding: '3px 8px', background: 'rgba(255,255,255,0.05)', color: '#fff' }}
        >
          +
        </button>
      </div>

      {/* Панель инструментов */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '2px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', padding: '2px 4px', flexShrink: 0 }}>
        <ToolButton label="Ж" title="Жирный (Ctrl+B)" onClick={() => exec('bold')} active={activeFormats.bold} style={{ fontWeight: 700 }} />
        <ToolButton label="К" title="Курсив (Ctrl+I)" onClick={() => exec('italic')} active={activeFormats.italic} style={{ fontStyle: 'italic' }} />
        <ToolButton label="Ч" title="Подчёркнутый (Ctrl+U)" onClick={() => exec('underline')} active={activeFormats.underline} style={{ textDecoration: 'underline' }} />
        <ToolButton label="З" title="Зачёркнутый (Ctrl+Shift+X)" onClick={() => exec('strikeThrough')} active={activeFormats.strikeThrough} style={{ textDecoration: 'line-through' }} />
        <ToolButton label="З1" title="Заголовок (Ctrl+Shift+H)" onClick={cycleHeading} />
        <ToolButton label="≔" title="Маркированный список (Ctrl+Shift+8)" onClick={() => exec('insertUnorderedList')} active={activeFormats.insertUnorderedList} />
        <ToolButton label="1." title="Нумерованный список (Ctrl+Shift+7)" onClick={() => exec('insertOrderedList')} active={activeFormats.insertOrderedList} />
        <div style={{ width: '1px', height: '16px', background: 'rgba(255,255,255,0.1)', margin: '0 4px' }} />
        <ToolButton label="×" title="Очистить" onClick={clear} style={{ fontSize: '16px', color: '#ff6b6b' }} />
        <div style={{ flex: 1 }} />
        <ToolButton label="↶" title="Отменить" onClick={() => exec('undo')} />
        <ToolButton label="↷" title="Повторить" onClick={() => exec('redo')} />
      </div>

      {/* Поле редактора */}
      <div
        ref={editorRef}
        contentEditable
        role="textbox"
        aria-multiline="true"
        spellCheck
        onInput={onInput}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        onKeyUp={updateFormats}
        onMouseUp={updateFormats}
        data-placeholder="Нажмите, чтобы писать…"
        className="rt-editor"
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: '10px',
          color: '#fff',
          padding: '8px 10px',
          fontSize: '13px',
          lineHeight: 1.5,
          outline: 'none',
        }}
      />

      {/* Статистика и действия */}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10.5px', color: 'rgba(255,255,255,0.45)', padding: '0 2px', flexShrink: 0 }}>
        <span>Слов: {stats.words} · Символов: {stats.chars}</span>
        <span style={{ display: 'flex', gap: '12px' }}>
          <button type="button" onClick={(e) => { e.stopPropagation(); copy(); }} style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '11px' }}>Копировать</button>
          <button type="button" onClick={(e) => { e.stopPropagation(); makeQr(); }} style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '11px' }}>QR</button>
          <button type="button" onClick={(e) => { e.stopPropagation(); clear(); }} style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '11px' }}>Очистить</button>
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

    const qrGen = typeof qrcode === 'function' ? qrcode : (qrcode && qrcode.default);
    let qr;
    try {
      if (typeof qrGen !== 'function') throw new Error('qrcode lib not a function');
      qr = qrGen(0, 'M');
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
    const quiet = 4;
    const total = count + quiet * 2;
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
          <button type="button" onClick={(e) => { e.stopPropagation(); fromClipboard(); }} style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '11px' }}>Из буфера</button>
          <button type="button" onClick={(e) => { e.stopPropagation(); copyText(); }} style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '11px' }}>Копировать</button>
          <button type="button" onClick={(e) => { e.stopPropagation(); saveQr(); }} style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '11px' }}>Сохранить</button>
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
        <button type="button" onClick={(e) => { e.stopPropagation(); add(); }} style={{ ...pillBase, background: 'rgba(255,255,255,0.1)', color: '#fff' }}>+</button>
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
        <button type="button" onClick={(e) => { e.stopPropagation(); removeDone(); }} style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontSize: '11px' }}>Удалить выполненные</button>
      </div>
    </div>
  );
}

function TextWidget({ qrSignal = 0, qrPresetText = '' }) {
  const [tab, setTab] = useState('notes');
  const [qrText, setQrText] = useState('');

  useEffect(() => {
    if (qrSignal > 0) setTab('qr');
  }, [qrSignal]);

  const makeQr = (text) => {
    setQrText(text);
    setTab('qr');
  };

  return (
    <div style={{ padding: '8px', color: '#fff', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <SubTabs tab={tab} onChange={setTab} />
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {tab === 'notes' && <NotesTab onMakeQr={makeQr} />}
        {tab === 'qr' && <QrTab presetText={qrText || qrPresetText} />}
        {tab === 'tasks' && <TasksTab />}
      </div>
    </div>
  );
}

export default TextWidget;
