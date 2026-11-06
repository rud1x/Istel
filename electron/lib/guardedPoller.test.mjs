import test from 'node:test';
import assert from 'node:assert';
import { createGuardedPoller } from './guardedPoller.mjs';

// Manual timer queue so tests are deterministic.
function fakeTimers() {
  const timers = new Map();
  let next = 1;
  return {
    setTimer: (fn, ms) => { const id = next++; timers.set(id, { fn, ms }); return id; },
    clearTimer: (id) => { timers.delete(id); },
    pending: () => timers.size,
    fire() {
      const [id, t] = timers.entries().next().value;
      timers.delete(id);
      t.fn();
    },
  };
}

const flush = () => new Promise((r) => setImmediate(r));

test('runs immediately on start and schedules the next tick after completion', async () => {
  const t = fakeTimers();
  let calls = 0;
  const p = createGuardedPoller(() => { calls++; }, 1000, t);
  p.start();
  assert.strictEqual(calls, 1);
  await flush();
  assert.strictEqual(t.pending(), 1);
  t.fire();
  await flush();
  assert.strictEqual(calls, 2);
});

test('never overlaps: no timer is scheduled while a run is in flight', async () => {
  const t = fakeTimers();
  let resolve;
  let calls = 0;
  const p = createGuardedPoller(() => { calls++; return new Promise((r) => { resolve = r; }); }, 500, t);
  p.start();
  await flush();
  assert.strictEqual(p.inFlight, true);
  assert.strictEqual(t.pending(), 0, 'must wait for the slow task');
  resolve();
  await flush();
  assert.strictEqual(t.pending(), 1);
  assert.strictEqual(calls, 1);
});

test('start is idempotent', async () => {
  const t = fakeTimers();
  let calls = 0;
  const p = createGuardedPoller(() => { calls++; }, 100, t);
  assert.strictEqual(p.start(), true);
  assert.strictEqual(p.start(), false);
  await flush();
  assert.strictEqual(calls, 1);
  assert.strictEqual(t.pending(), 1);
});

test('stop cancels the pending tick and an in-flight run schedules nothing', async () => {
  const t = fakeTimers();
  let resolve;
  const p = createGuardedPoller(() => new Promise((r) => { resolve = r; }), 100, t);
  p.start();
  p.stop();
  resolve();
  await flush();
  assert.strictEqual(t.pending(), 0);
  assert.strictEqual(p.running, false);
});

test('restart while a run is in flight does not start a second concurrent run', async () => {
  const t = fakeTimers();
  let resolve;
  let calls = 0;
  const p = createGuardedPoller(() => { calls++; return new Promise((r) => { resolve = r; }); }, 100, t);
  p.start();
  p.stop();
  p.start();
  assert.strictEqual(calls, 1, 'old run still in flight');
  resolve();
  await flush();
  assert.strictEqual(t.pending(), 1, 'completion schedules the next tick');
});

test('errors are reported and polling continues', async () => {
  const t = fakeTimers();
  const errors = [];
  let calls = 0;
  const p = createGuardedPoller(() => { calls++; throw new Error('x'); }, 100, { ...t, onError: (e) => errors.push(e.message) });
  p.start();
  await flush();
  assert.deepStrictEqual(errors, ['x']);
  assert.strictEqual(t.pending(), 1);
  t.fire();
  await flush();
  assert.strictEqual(calls, 2);
});
