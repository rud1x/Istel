'use strict';
// Tolerant file writer for temp PowerShell scripts. A leftover app instance or
// antivirus can hold a lock on the script file (EBUSY/EPERM). In that case the
// file already exists and is usable, so we skip the write instead of throwing
// and aborting startup (which previously hid the island entirely).

const fs = require('fs');

const LOCK_CODES = new Set(['EBUSY', 'EPERM', 'EACCES']);

function safeWriteFileSync(filePath, content, encoding = 'utf8') {
  try {
    fs.writeFileSync(filePath, content, encoding);
    return true;
  } catch (e) {
    if (e && LOCK_CODES.has(e.code) && fs.existsSync(filePath)) {
      return false;
    }
    throw e;
  }
}

module.exports = { safeWriteFileSync };
