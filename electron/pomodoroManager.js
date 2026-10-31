// ============================================================
// Pomodoro Manager
// Runs in the main process so the timer survives renderer reloads,
// window hiding and fullscreen suspend. Time is derived from a start
// timestamp (not a tick counter) to avoid drift.
// ============================================================

const { execFile } = require('child_process');

class PomodoroManager {
  constructor(monitorManager, configManager) {
    this.monitorManager = monitorManager;
    this.configManager = configManager;
    this.running = false;
    this.paused = false;
    this.phase = 'work'; // 'work' | 'short' | 'long'
    this.cyclesDone = 0;
    this.startedAt = 0;
    this.pausedRemainingMs = 0;
    this.durationMs = 0;
    this.tickTimer = null;
    this._lastEmitted = -1;
  }

  _durations() {
    const c = this.configManager;
    const workMin = Number(c?.get('pomoWork', 25)) || 25;
    const shortMin = Number(c?.get('pomoShort', 5)) || 5;
    const longMin = Number(c?.get('pomoLong', 15)) || 15;
    const untilLong = Number(c?.get('pomoUntilLong', 4)) || 4;
    return {
      work: workMin * 60000,
      short: shortMin * 60000,
      long: longMin * 60000,
      untilLong,
    };
  }

  getState() {
    const remainingMs = this.remainingMs();
    return {
      running: this.running,
      paused: this.paused,
      phase: this.phase,
      cyclesDone: this.cyclesDone,
      remainingMs,
      durationMs: this.durationMs,
    };
  }

  remainingMs() {
    if (!this.running) return 0;
    if (this.paused) return this.pausedRemainingMs;
    const elapsed = Date.now() - this.startedAt;
    return Math.max(0, this.durationMs - elapsed);
  }

  start() {
    // Called by main bootstrap: start the tick loop but not a session.
    if (!this.tickTimer) {
      this.tickTimer = setInterval(() => this._tick(), 1000);
    }
  }

  stop() {
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
  }

  // Re-apply durations after settings change. Only affects the current
  // phase if it is NOT actively running (idle or paused) — we never
  // silently cut a running timer.
  applySettings() {
    if (this.running && !this.paused) return this.getState();
    const d = this._durations();
    if (!this.running) {
      this.durationMs = d[this.phase] || d.work;
    } else if (this.paused) {
      // Keep the remaining ratio within the new duration.
      const ratio = this.durationMs > 0 ? this.pausedRemainingMs / this.durationMs : 1;
      this.durationMs = d[this.phase] || d.work;
      this.pausedRemainingMs = Math.round(this.durationMs * ratio);
    }
    this._emit();
    return this.getState();
  }

  startSession() {
    if (this.running && !this.paused) return this.getState();
    if (this.paused) {
      // Resume
      this.startedAt = Date.now() - (this.durationMs - this.pausedRemainingMs);
      this.paused = false;
    } else {
      const d = this._durations();
      this.phase = 'work';
      this.durationMs = d.work;
      this.startedAt = Date.now();
      this.running = true;
    }
    this._emit();
    return this.getState();
  }

  pause() {
    if (!this.running || this.paused) return this.getState();
    this.pausedRemainingMs = this.remainingMs();
    this.paused = true;
    this._emit();
    return this.getState();
  }

  reset() {
    this.running = false;
    this.paused = false;
    this.phase = 'work';
    this.cyclesDone = 0;
    this.durationMs = 0;
    this.pausedRemainingMs = 0;
    this._emit();
    return this.getState();
  }

  _tick() {
    if (!this.running || this.paused) return;
    if (this.remainingMs() <= 0) {
      this._finishPhase();
      return;
    }
    this._emit();
  }

  _finishPhase() {
    const d = this._durations();
    const finishedPhase = this.phase;

    let nextPhase = 'work';
    if (finishedPhase === 'work') {
      this.cyclesDone += 1;
      nextPhase = this.cyclesDone % d.untilLong === 0 ? 'long' : 'short';
    } else {
      nextPhase = 'work';
    }

    this.monitorManager.broadcastToAll('pomodoro-finished', {
      phase: finishedPhase,
      next: nextPhase,
      cyclesDone: this.cyclesDone,
    });

    // Completion sound (best-effort, respects pomoSound).
    if (this.configManager?.get('pomoSound', true) !== false) {
      try {
        execFile('powershell.exe', ['-NoProfile', '-Command', '[console]::beep(880,180); [console]::beep(1175,220)'], { timeout: 3000, windowsHide: true }, () => {});
      } catch {}
    }

    if (this.configManager.get('pomoAutoNext', true)) {
      this._beginPhase(nextPhase);
    } else {
      this.running = false;
      this.phase = nextPhase;
      this.durationMs = d[nextPhase];
      this._emit();
    }
  }

  _beginPhase(phase) {
    const d = this._durations();
    this.phase = phase;
    this.durationMs = d[phase];
    this.startedAt = Date.now();
    this.paused = false;
    this.running = true;
    this._emit();
  }

  _emit() {
    const state = this.getState();
    // Throttle: only emit on state change or every second
    this.monitorManager.broadcastToAll('pomodoro-state', state);
  }
}

module.exports = PomodoroManager;
