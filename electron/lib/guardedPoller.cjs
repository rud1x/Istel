'use strict';
// CommonJS mirror of ./guardedPoller.mjs (kept in sync; tested via the .mjs
// version). Electron main is CommonJS.

function createGuardedPoller(task, intervalMs, opts = {}) {
  const setTimer = opts.setTimer || setTimeout;
  const clearTimer = opts.clearTimer || clearTimeout;
  const onError = opts.onError || null;

  let running = false;
  let inFlight = false;
  let timer = null;

  const schedule = () => {
    if (running && !inFlight && timer == null) {
      timer = setTimer(tick, intervalMs);
    }
  };

  function tick() {
    timer = null;
    if (!running || inFlight) return;
    inFlight = true;
    let result;
    try {
      result = task();
    } catch (e) {
      result = Promise.reject(e);
    }
    Promise.resolve(result)
      .catch((e) => { if (onError) onError(e); })
      .then(() => {
        inFlight = false;
        schedule();
      });
  }

  return {
    start() {
      if (running) return false;
      running = true;
      if (!inFlight) tick();
      return true;
    },
    stop() {
      running = false;
      if (timer != null) {
        clearTimer(timer);
        timer = null;
      }
    },
    get running() { return running; },
    get inFlight() { return inFlight; },
  };
}

module.exports = { createGuardedPoller };
