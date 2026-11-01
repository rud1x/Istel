const { clipboard, nativeImage } = require('electron');
const { cheapImageSignature, imageChanged } = require('./lib/clipboardFingerprint.cjs');

const POLL_INTERVAL = 800;
const MAX_HISTORY = 50;

class ClipboardManager {
  constructor() {
    this.lastText = '';
    this.lastFormats = [];
    this.lastImageSignature = null;
    this.pollTimer = null;
    this.callback = null;
    this.history = []; // [{ id, type, text?, imageDataUrl?, preview, timestamp }]
    this._idSeq = 1;
  }

  startPolling(callback) {
    this.callback = callback;

    this.lastFormats = clipboard.availableFormats();
    if (this.lastFormats.includes('text/plain')) {
      this.lastText = clipboard.readText();
    }

    const poll = () => {
      const currentFormats = clipboard.availableFormats();
      let changed = false;

      if (
        currentFormats.length !== this.lastFormats.length ||
        !currentFormats.every((val, index) => val === this.lastFormats[index])
      ) {
        changed = true;
      } else if (currentFormats.includes('text/plain')) {
        const currentText = clipboard.readText();
        if (currentText !== this.lastText) {
          changed = true;
          this.lastText = currentText;
        }
      }

      // Image-to-image copies don't change the format list, so we must
      // compare the actual bitmap to notice a new image.
      const isImage = currentFormats.includes('image/png') || currentFormats.includes('image/jpeg') || currentFormats.includes('image/bmp');
      if (isImage) {
        try {
          const img = clipboard.readImage();
          const sig = cheapImageSignature(img);
          if (imageChanged(sig, this.lastImageSignature)) {
            this.lastImageSignature = sig;
            changed = true;
          }
        } catch (e) {}
      }

      if (changed) {
        this.lastFormats = currentFormats;
        if (currentFormats.includes('text/plain')) {
          this.lastText = clipboard.readText();
        }
        this._captureCurrent();
        if (this.callback) {
          this.callback({ type: this._getType(currentFormats), timestamp: Date.now() });
        }
      }
    };

    this.pollTimer = setInterval(poll, POLL_INTERVAL);
  }

  stopPolling() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  getHistory() {
    return this.history;
  }

  pasteItem(id) {
    const item = this.history.find((h) => h.id === id);
    if (!item) return false;
    try {
      if (item.type === 'image' && item.imageDataUrl) {
        const img = nativeImage.createFromDataURL(item.imageDataUrl);
        clipboard.writeImage(img);
      } else if (item.text != null) {
        clipboard.writeText(item.text);
      } else {
        return false;
      }
      return true;
    } catch (e) {
      return false;
    }
  }

  deleteItem(id) {
    this.history = this.history.filter((h) => h.id !== id);
    return this.history;
  }

  clear() {
    this.history = [];
    return this.history;
  }

  _captureCurrent() {
    const formats = clipboard.availableFormats();
    const type = this._getType(formats);
    const entry = { id: this._idSeq++, type, timestamp: Date.now() };

    if (type === 'image') {
      try {
        const img = clipboard.readImage();
        if (img.isEmpty()) return;
        const dataUrl = img.toDataURL();
        entry.imageDataUrl = dataUrl;
        const size = img.getSize();
        entry.preview = `${size.width} × ${size.height}`;
      } catch (e) {
        return;
      }
    } else if (type === 'file') {
      const text = clipboard.readText();
      entry.text = text;
      entry.preview = (text || '').split(/\r?\n/).pop() || 'Файл';
    } else if (formats.includes('text/plain')) {
      const text = clipboard.readText();
      if (!text) return;
      entry.text = text;
      entry.preview = text.length > 120 ? text.slice(0, 120) + '…' : text;
    } else {
      return;
    }

    // Avoid duplicate consecutive identical entries
    const last = this.history[0];
    if (last && last.type === entry.type && last.text === entry.text && last.imageDataUrl === entry.imageDataUrl) {
      return;
    }

    this.history.unshift(entry);
    if (this.history.length > MAX_HISTORY) this.history.length = MAX_HISTORY;
  }

  _getType(formats) {
    if (formats.includes('image/png') || formats.includes('image/jpeg')) {
      return 'image';
    }
    if (formats.includes('text/uri-list')) {
      return 'file';
    }
    if (formats.some((f) => f.toLowerCase().includes('file'))) {
      return 'file';
    }
    if (formats.includes('text/plain')) {
      return 'text';
    }
    return 'generic';
  }
}

module.exports = ClipboardManager;
