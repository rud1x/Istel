// Pure, dependency-free helpers for polling lifecycles and the
// suspend/resume state machine. Extracted from the Electron managers so
// the logic can be unit-tested without Electron or PowerShell.

/**
 * Ensures a manager's polling is started at most once: if a timer is
 * already active it is cleared first, so a repeated startPolling() can
 * never create two parallel polls (the B2 bug).
 *
 * @param {object} holder  object with `pollTimer` (and optionally `clear`)
 * @param {function} setFn  schedules the interval and returns its handle
 * @returns {*} the new handle
 */
export function restartPolling(holder, setFn) {
  if (holder && holder.pollTimer != null) {
    clearInterval(holder.pollTimer);
    holder.pollTimer = null;
  }
  const handle = setFn();
  if (holder) holder.pollTimer = handle;
  return handle;
}

/**
 * Suspend/resume state machine shared by SuspendController.
 * Tracks whether each registered entry was running so resume() only
 * restarts what suspend() actually stopped, and never double-fires.
 *
 * @param {Array<{name:string, manager:object, startFn?:function, wasRunning:boolean}>} entries
 */
export function createSuspendState(entries = []) {
  return { suspended: false, entries };
}

/**
 * Apply a suspend/resume transition. Returns true when the state actually
 * changed (so callers can broadcast / log), false when it was a no-op.
 * This fixes the B3 bug where onHiddenChange only fired on `changed`.
 *
 * @param {object} state  result of createSuspendState
 * @param {boolean} shouldSuspend
 * @param {{stopManager:function,startManager:function,log?:function}} ops
 * @returns {boolean} whether the suspended flag flipped
 */
export function applySuspendState(state, shouldSuspend, ops) {
  const { stopManager, startManager, log } = ops;
  if (shouldSuspend === state.suspended) return false;
  state.suspended = shouldSuspend;
  for (const entry of state.entries) {
    if (!entry.manager) continue;
    try {
      if (shouldSuspend) {
        entry.wasRunning = true;
        stopManager(entry.manager);
      } else if (entry.wasRunning) {
        startManager(entry.manager, entry.startFn);
      }
    } catch (e) {
      if (log) log(`[Suspend] ${entry.name} transition failed: ${e.message}`);
    }
  }
  return true;
}
