'use strict';
// CommonJS mirror of ./configIO.mjs (kept in sync; tested via the .mjs
// version). Electron main is CommonJS.

function mergeConfig(defaults, userJson) {
  if (!userJson || typeof userJson !== 'object') return { ...defaults };
  return { ...defaults, ...userJson };
}

function parseConfigText(text) {
  if (text == null || text.trim() === '') return { corrupt: false, parsed: null };
  try {
    const parsed = JSON.parse(text);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { corrupt: true, parsed: null };
    }
    return { corrupt: false, parsed };
  } catch {
    return { corrupt: true, parsed: null };
  }
}

function tempConfigPath(configPath) {
  return `${configPath}.tmp`;
}

function corruptBackupPath(configPath, stamp) {
  return `${configPath}.corrupt.${stamp}.bak`;
}

module.exports = { mergeConfig, parseConfigText, tempConfigPath, corruptBackupPath };
