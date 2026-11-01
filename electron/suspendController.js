// ============================================================
// Suspend Controller
// When a fullscreen game takes over, the island must not interfere:
// no audio polling (which can kick the game out of exclusive mode and
// kill its sound), no media/clipboard/system polling, no CPU churn.
// This controller stops every manager except the fullscreen detector,
// and restarts them when the game is gone.
//
// The transition logic lives in lib/pollingLifecycle.mjs and is unit
// tested. This file only adapts the managers to that pure state machine.
// ============================================================

const { createSuspendState, applySuspendState } = require('./lib/pollingLifecycle.cjs');

class SuspendController {
  constructor() {
    this._state = createSuspendState([]);
    this._ops = {
      stopManager: (manager) => {
        if (typeof manager.stop === 'function') manager.stop();
        else if (typeof manager.stopPolling === 'function') manager.stopPolling();
      },
      startManager: (manager, startFn) => {
        if (typeof startFn === 'function') startFn(manager);
        else if (typeof manager.start === 'function') manager.start(() => {});
      },
      log: (msg) => console.log(msg),
    };
  }

  get suspended() {
    return this._state.suspended;
  }

  /**
   * Register a manager that should be paused during fullscreen.
   * @param {string} name
   * @param {object} manager  must expose stop()/stopPolling() and start()
   * @param {function} [startFn] custom restart (defaults to manager.start())
   */
  register(name, manager, startFn) {
    if (!manager) return;
    this._state.entries.push({
      name,
      manager,
      startFn: typeof startFn === 'function' ? startFn : null,
      wasRunning: false,
    });
  }

  suspend() {
    const changed = applySuspendState(this._state, true, this._ops);
    if (changed) console.log('[Suspend] All managers paused for fullscreen.');
  }

  resume() {
    const changed = applySuspendState(this._state, false, this._ops);
    if (changed) console.log('[Suspend] All managers resumed.');
  }

  setSuspended(hidden) {
    if (hidden) this.suspend();
    else this.resume();
  }
}

module.exports = SuspendController;
