// A poller that never overlaps itself: the next tick is scheduled only after
// the previous task settled. With setInterval a slow task (e.g. a PowerShell
// query under CPU load) stacks up parallel runs, which makes the load worse
// and snowballs into lag.

/**
 * @param {() => (Promise<any>|any)} task
 * @param {number} intervalMs  delay between the end of one run and the next
 * @param {{setTimer?:Function, clearTimer?:Function, onError?:Function}} [opts]
 */
export function createGuardedPoller(task, intervalMs, opts = {}) {
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
    /** Start polling; runs the first tick immediately. Idempotent. */
    start() {
      if (running) return false;
      running = true;
      // If a run from before a stop() is still in flight, its completion
      // schedules the next tick, so we never run two at once.
      if (!inFlight) tick();
      return true;
    },
    /** Stop polling. An in-flight run finishes but schedules nothing. */
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
