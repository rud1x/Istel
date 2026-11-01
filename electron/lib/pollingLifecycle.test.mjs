import test from 'node:test';
import assert from 'node:assert';
import { restartPolling, createSuspendState, applySuspendState } from './pollingLifecycle.mjs';

// ---- B2: startPolling must never create parallel timers ----

test('restartPolling clears an existing timer before starting a new one', () => {
  let clearCalls = 0;
  const originalClear = globalThis.clearInterval;
  globalThis.clearInterval = () => { clearCalls += 1; };
  try {
    const holder = { pollTimer: 'old-handle' };
    const handle = restartPolling(holder, () => 'new-handle');
    assert.strictEqual(clearCalls, 1, 'existing timer must be cleared');
    assert.strictEqual(handle, 'new-handle');
    assert.strictEqual(holder.pollTimer, 'new-handle');
  } finally {
    globalThis.clearInterval = originalClear;
  }
});

test('restartPolling starts cleanly when no timer exists', () => {
  const holder = { pollTimer: null };
  const handle = restartPolling(holder, () => 42);
  assert.strictEqual(handle, 42);
  assert.strictEqual(holder.pollTimer, 42);
});

// ---- B3: suspend state machine fires on every real transition ----

function makeOps() {
  const log = [];
  return {
    log,
    ops: {
      stopManager: (m) => log.push(`stop:${m.name}`),
      startManager: (m, startFn) => log.push(`start:${m.name}${startFn ? ':custom' : ''}`),
      log: (msg) => log.push(msg),
    },
  };
}

test('applySuspendState stops managers once on suspend', () => {
  const { log, ops } = makeOps();
  const state = createSuspendState([{ name: 'media', manager: { name: 'media' }, wasRunning: false }]);
  const changed = applySuspendState(state, true, ops);
  assert.strictEqual(changed, true);
  assert.deepStrictEqual(log, ['stop:media']);
  assert.strictEqual(state.suspended, true);
});

test('applySuspendState is a no-op when state does not change', () => {
  const { log, ops } = makeOps();
  const state = createSuspendState([{ name: 'media', manager: { name: 'media' }, wasRunning: false }]);
  applySuspendState(state, true, ops);
  log.length = 0;
  const changed = applySuspendState(state, true, ops);
  assert.strictEqual(changed, false, 'second suspend must be a no-op');
  assert.deepStrictEqual(log, []);
});

test('applySuspendState resumes only managers that were running', () => {
  const { log, ops } = makeOps();
  const state = createSuspendState([
    { name: 'media', manager: { name: 'media' }, wasRunning: false },
    { name: 'volume', manager: { name: 'volume' }, wasRunning: false },
  ]);
  applySuspendState(state, true, ops);
  log.length = 0;
  applySuspendState(state, false, ops);
  assert.deepStrictEqual(log, ['start:media', 'start:volume']);
});

test('applySuspendState resume with no prior suspend is a no-op', () => {
  const { log, ops } = makeOps();
  const state = createSuspendState([{ name: 'media', manager: { name: 'media' }, wasRunning: false }]);
  const changed = applySuspendState(state, false, ops);
  assert.strictEqual(changed, false);
  assert.deepStrictEqual(log, []);
});

test('applySuspendState uses a custom startFn when provided', () => {
  const { log, ops } = makeOps();
  const state = createSuspendState([
    { name: 'media', manager: { name: 'media' }, wasRunning: false, startFn: () => {} },
  ]);
  applySuspendState(state, true, ops);
  log.length = 0;
  applySuspendState(state, false, ops);
  assert.deepStrictEqual(log, ['start:media:custom']);
});
