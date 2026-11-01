// Pure helpers for config persistence (B14 atomic write, B15 corrupt
// recovery). The filesystem side is done by ConfigManager; these functions
// are pure and unit-tested.

/**
 * Merge loaded JSON over defaults without losing unknown user keys.
 * @param {object} defaults
 * @param {object|null} userJson
 * @returns {object}
 */
export function mergeConfig(defaults, userJson) {
  if (!userJson || typeof userJson !== 'object') return { ...defaults };
  return { ...defaults, ...userJson };
}

/**
 * Given the raw text of a config file, decide whether it is a corrupt
 * write (invalid JSON) that should be backed up and replaced.
 * @param {string|null} text
 * @returns {{ corrupt: boolean, parsed: object|null }}
 */
export function parseConfigText(text) {
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

/**
 * Temp path used for atomic rename.
 * @param {string} configPath
 * @returns {string}
 */
export function tempConfigPath(configPath) {
  return `${configPath}.tmp`;
}

/**
 * Backup path used when a corrupt config is found.
 * @param {string} configPath
 * @param {number} stamp  Date.now()
 * @returns {string}
 */
export function corruptBackupPath(configPath, stamp) {
  return `${configPath}.corrupt.${stamp}.bak`;
}
