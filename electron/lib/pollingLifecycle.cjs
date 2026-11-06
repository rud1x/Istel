'use strict';
// CommonJS mirror of ./pollingLifecycle.mjs (kept in sync; tested via the
// .mjs version). Electron main is CommonJS and cannot require() ESM.

function restartPolling(holder, setFn) {
  if (holder && holder.pollTimer != null) {
    clearInterval(holder.pollTimer);
    holder.pollTimer = null;
  }
  const handle = setFn();
  if (holder) holder.pollTimer = handle;
  return handle;
}

function createSuspendState(entries = []) {
  return { suspended: false, entries };
}

function applySuspendState(state, shouldSuspend, ops) {
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

module.exports = { restartPolling, createSuspendState, applySuspendState };
