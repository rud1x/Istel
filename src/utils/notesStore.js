// Shared notes storage. Kept in localStorage so both the Notes tab and
// external callers (e.g. "save copied text to notes") write to one place.

const LS_NOTES = 'island_notes_v1';
const EVENT = 'island-notes-changed';

export function loadNotes() {
  try {
    const raw = localStorage.getItem(LS_NOTES);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveNotes(notes) {
  try {
    localStorage.setItem(LS_NOTES, JSON.stringify(notes));
    window.dispatchEvent(new CustomEvent(EVENT, { detail: notes }));
  } catch {}
}

/**
 * Add a note from outside the Notes tab (e.g. a copied clipboard item).
 * Returns the created note.
 */
export function addNoteFromText(text) {
  const clean = String(text || '').trim();
  if (!clean) return null;
  const notes = loadNotes();
  const note = {
    id: Date.now() + Math.floor(Math.random() * 1000),
    title: clean.slice(0, 18) || 'Заметка',
    text: clean,
  };
  const next = [note, ...notes];
  saveNotes(next);
  return note;
}

export function subscribeNotes(cb) {
  const handler = (e) => cb(e.detail);
  window.addEventListener(EVENT, handler);
  // Cross-tab / other window updates.
  const storageHandler = (e) => {
    if (e.key === LS_NOTES) cb(loadNotes());
  };
  window.addEventListener('storage', storageHandler);
  return () => {
    window.removeEventListener(EVENT, handler);
    window.removeEventListener('storage', storageHandler);
  };
}
