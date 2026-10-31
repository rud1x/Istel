// ============================================================
// Suspend Controller
// When a fullscreen game takes over, the island must not interfere:
// no audio polling (which can kick the game out of exclusive mode and
// kill its sound), no media/clipboard/system polling, no CPU churn.
// This controller stops every manager except the fullscreen detector,
// and restarts them when the game is gone.
// ============================================================

class SuspendController {
  constructor() {
    this.suspended = false;
    // Each entry: { name, manager, started } where started(manager) restarts.
    this.entries = [];
  }

  /**
   * Register a manager that should be paused during fullscreen.
   * @param {string} name
   * @param {object} manager  must expose stop() and (optionally) start()
   * @param {function} [startFn] custom restart (defaults to manager.start())
   */
  register(name, manager, startFn) {
    if (!manager) return;
    this.entries.push({
      name,
      manager,
      startFn: typeof startFn === 'function' ? startFn : () => manager.start?.(() => {}),
      wasRunning: false,
    });
  }

  suspend() {
    if (this.suspended) return;
    this.suspended = true;
    for (const entry of this.entries) {
      try {
        entry.wasRunning = true;
        if (typeof entry.manager.stop === 'function') entry.manager.stop();
        else if (typeof entry.manager.stopPolling === 'function') entry.manager.stopPolling();
      } catch (e) {
        console.log(`[Suspend] ${entry.name} stop failed:`, e.message);
      }
    }
    console.log('[Suspend] All managers paused for fullscreen.');
  }

  resume() {
    if (!this.suspended) return;
    this.suspended = false;
    for (const entry of this.entries) {
      if (!entry.wasRunning) continue;
      try {
        entry.startFn(entry.manager);
      } catch (e) {
        console.log(`[Suspend] ${entry.name} start failed:`, e.message);
      }
    }
    console.log('[Suspend] All managers resumed.');
  }

  setSuspended(hidden) {
    if (hidden) this.suspend();
    else this.resume();
  }
}

module.exports = SuspendController;
