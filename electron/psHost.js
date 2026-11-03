// ============================================================
// Persistent PowerShell host
// Spawning powershell.exe for every poll costs ~0.5 s of CPU per call
// (plus a csc.exe compile for every Add-Type), and the managers did that
// several times per second. Instead, each host is ONE long-lived
// powershell.exe that reads requests from stdin and answers on stdout.
// Types (Add-Type, WinRT) are loaded once per process via define().
//
// Protocol and back-off logic live in lib/psProtocol.mjs (unit tested).
// ============================================================

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const {
  encodeRequest, encodeCall, parseResponseLine, splitLines, nextRestartDelay,
} = require('./lib/psProtocol.cjs');

const SCRIPT_DIR = path.join(os.tmpdir(), 'island_scripts');
const HOST_SCRIPT = path.join(SCRIPT_DIR, 'ps_host.ps1');

// Request loop. Definitions are dot-sourced at script scope so the functions
// and variables they create persist between calls. $Error is cleared every
// iteration so a long-running host does not accumulate error records.
const HOST_SCRIPT_CONTENT = `
$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'
$__utf8 = New-Object System.Text.UTF8Encoding($false)
[Console]::InputEncoding = $__utf8
[Console]::OutputEncoding = $__utf8
$__in = [Console]::In
while ($true) {
  $__line = $__in.ReadLine()
  if ($null -eq $__line) { break }
  $__parts = $__line.Split([char]9)
  if ($__parts.Count -lt 4) { continue }
  $__id = $__parts[0]; $__kind = $__parts[1]; $__name = $__parts[2]
  $__ok = 1; $__out = ''
  try {
    $__payload = $__utf8.GetString([Convert]::FromBase64String($__parts[3]))
    if ($__kind -eq 'def') {
      . ([scriptblock]::Create($__payload)) | Out-Null
    } else {
      $__args = @()
      # PS 5.1 ConvertFrom-Json emits a JSON array as ONE object; pipe it
      # through ForEach-Object to enumerate the positional arguments.
      if ($__payload) { $__args = @($__payload | ConvertFrom-Json | ForEach-Object { $_ }) }
      $__res = & $__name @__args
      $__out = (@($__res) | ForEach-Object { [string]$_ }) -join [char]10
    }
  } catch {
    $__ok = 0; $__out = [string]$_
  }
  [Console]::Out.WriteLine('@@R' + [char]9 + $__id + [char]9 + $__ok + [char]9 + [Convert]::ToBase64String($__utf8.GetBytes([string]$__out)))
  [Console]::Out.Flush()
  $Error.Clear()
}
`;

function ensureHostScript() {
  if (!fs.existsSync(SCRIPT_DIR)) fs.mkdirSync(SCRIPT_DIR, { recursive: true });
  fs.writeFileSync(HOST_SCRIPT, HOST_SCRIPT_CONTENT, 'utf8');
}

// Definitions compile C# (Add-Type) and load WinRT; under startup load that
// can take several seconds, so they get a generous timeout of their own.
const DEFINE_TIMEOUT = 30000;

class PsHost {
  constructor(name) {
    this.name = name;
    this.defs = []; // { label, code } — replayed on every (re)spawn
    this.proc = null;
    // PowerShell executes requests one at a time, so we dispatch them one at
    // a time too. That way a call's timeout only measures its OWN run time,
    // not the time spent waiting behind the host start-up or other calls.
    this.queue = [];
    this.inflight = null;
    this.nextId = 1;
    this.buffer = '';
    this.spawnedAt = 0;
    this.restartDelay = 0;
    this.cooldownUntil = 0;
    this.disposed = false;
  }

  /**
   * Register PowerShell code (types, functions) the host needs. It runs once
   * per process: now if the host is up, otherwise on the next spawn.
   */
  define(label, code) {
    this.defs.push({ label, code });
    if (this.proc) this._enqueueDef(label, code);
  }

  /**
   * Call a function defined via define(). Resolves with its output text.
   * @param {string} fn
   * @param {Array} [args]
   * @param {{timeout?:number}} [opts]  max run time once dispatched
   */
  call(fn, args = [], { timeout = 5000 } = {}) {
    if (this.disposed) return Promise.reject(new Error(`[PsHost:${this.name}] disposed`));
    if (!this._ensureProcess()) {
      return Promise.reject(new Error(`[PsHost:${this.name}] restarting`));
    }
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      this._enqueue({ id, label: fn, line: encodeCall(id, fn, args), timeout, resolve, reject });
    });
  }

  dispose() {
    this.disposed = true;
    this._kill();
  }

  // ----------------------------------------------------------

  _ensureProcess() {
    if (this.proc) return true;
    if (Date.now() < this.cooldownUntil) return false;
    ensureHostScript();
    let proc;
    try {
      proc = spawn(
        'powershell.exe',
        ['-NoProfile', '-NoLogo', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', HOST_SCRIPT],
        { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] },
      );
    } catch (e) {
      console.log(`[PsHost:${this.name}] spawn failed:`, e.message);
      this._scheduleCooldown(0);
      return false;
    }
    this.proc = proc;
    this.buffer = '';
    this.spawnedAt = Date.now();
    proc.stdout.setEncoding('utf8');
    proc.stdout.on('data', (chunk) => this._onData(chunk));
    // Must be drained, otherwise a full stderr pipe blocks PowerShell.
    proc.stderr.on('data', () => {});
    proc.stdin.on('error', () => {});
    proc.on('error', (e) => console.log(`[PsHost:${this.name}] process error:`, e.message));
    proc.on('exit', (code) => this._onExit(proc, code));
    // Definitions go first so every later call can rely on them.
    for (const { label, code } of this.defs) this._enqueueDef(label, code);
    return true;
  }

  _enqueueDef(label, code) {
    const id = this.nextId++;
    this._enqueue({
      id,
      label: `define ${label}`,
      line: encodeRequest(id, 'def', label, code),
      timeout: DEFINE_TIMEOUT,
      resolve: () => {},
      reject: (e) => console.log(`[PsHost:${this.name}] define ${label} failed:`, e.message),
    });
  }

  _enqueue(item) {
    this.queue.push(item);
    this._pump();
  }

  _pump() {
    if (!this.proc || this.inflight || this.queue.length === 0) return;
    const item = this.queue.shift();
    this.inflight = item;
    item.timer = setTimeout(() => {
      // A hung call (e.g. a WinRT await that never completes) blocks the
      // host forever, so the only safe recovery is a fresh process.
      console.log(`[PsHost:${this.name}] ${item.label} timed out after ${item.timeout} ms, restarting host`);
      this._kill();
    }, item.timeout);
    try {
      this.proc.stdin.write(item.line);
    } catch (e) {
      console.log(`[PsHost:${this.name}] write failed:`, e.message);
      this._kill();
    }
  }

  _onData(chunk) {
    const { lines, rest } = splitLines(this.buffer + chunk);
    this.buffer = rest;
    for (const line of lines) {
      const res = parseResponseLine(line);
      const item = this.inflight;
      if (!res || !item || res.id !== item.id) continue;
      clearTimeout(item.timer);
      this.inflight = null;
      if (res.ok) item.resolve(res.out);
      else item.reject(new Error(res.out || `${item.label} failed`));
      this._pump();
    }
  }

  _onExit(proc, code) {
    if (this.proc !== proc) return;
    this.proc = null;
    const lived = Date.now() - this.spawnedAt;
    const err = new Error(`[PsHost:${this.name}] host exited (${code})`);
    const dropped = this.inflight ? [this.inflight, ...this.queue] : this.queue;
    this.inflight = null;
    this.queue = [];
    for (const item of dropped) {
      clearTimeout(item.timer);
      item.reject(err);
    }
    if (!this.disposed) {
      console.log(`[PsHost:${this.name}] exited with ${code} after ${lived} ms`);
      this._scheduleCooldown(lived);
    }
  }

  _scheduleCooldown(livedMs) {
    this.restartDelay = nextRestartDelay(this.restartDelay, livedMs);
    this.cooldownUntil = Date.now() + this.restartDelay;
  }

  _kill() {
    const proc = this.proc;
    if (!proc) return;
    try { proc.stdin.end(); } catch {}
    try { proc.kill(); } catch {}
    // 'exit' fires asynchronously; reject pending calls via _onExit then.
  }
}

// Two hosts so a slow or hung SMTC/WinRT call can never delay fullscreen
// detection (which must keep working while a game runs):
//   'media'  — SMTC media session, playback commands, audio endpoint volume
//   'system' — fullscreen detection, caps/keyboard layout, active window, privacy
const hosts = new Map();

function getHost(name) {
  if (!hosts.has(name)) hosts.set(name, new PsHost(name));
  return hosts.get(name);
}

function disposeAll() {
  for (const host of hosts.values()) host.dispose();
}

module.exports = { getHost, disposeAll, PsHost };
