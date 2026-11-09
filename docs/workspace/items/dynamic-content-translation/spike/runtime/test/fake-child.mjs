// In-memory ChildProcess double for supervisor tests that must control spawn/error/exit/kill EXACTLY (no OS process).
// Mirrors the parts of the Node ChildProcess contract the supervisor relies on:
//   pid (undefined when the spawn failed), exitCode / signalCode (null while running), kill() -> boolean (may throw),
//   send(msg, cb), 'spawn' / 'message' / 'error' / 'exit' events.
import { EventEmitter } from 'node:events';
import { Supervisor } from '../supervisor.mjs';

let nextPid = 50_000;

export class FakeChild extends EventEmitter {
  constructor({ noPid = false, autoSpawnEvent = true } = {}) {
    super();
    this.pid = noPid ? undefined : nextPid++;
    this.exitCode = null;
    this.signalCode = null;
    this.stdout = null;
    this.stderr = null;
    this.sent = [];
    this.killCalls = [];
    this.alive = !noPid;
    // behaviour knobs (mutable from tests)
    this.killThrows = false;
    this.killReturnsFalse = false;
    this.exitOnKill = true;
    this.onSend = null; // (msg, child) => void
    if (!noPid && autoSpawnEvent) setImmediate(() => this.emit('spawn'));
  }

  send(msg, cb) {
    this.sent.push(msg);
    cb?.(null);
    this.onSend?.(msg, this);
    return true;
  }

  kill(signal = 'SIGTERM') {
    this.killCalls.push(signal);
    if (this.killThrows) throw new Error('kill EPERM');
    if (this.killReturnsFalse) return false;
    if (this.exitOnKill && this.alive) setImmediate(() => this.die(null, signal));
    return true;
  }

  /** Terminate: set the code fields first (as Node does), then emit 'exit'. */
  die(code, signal) {
    if (!this.alive) return;
    this.alive = false;
    this.exitCode = code;
    this.signalCode = signal;
    this.emit('exit', code, signal);
  }

  /** Mark the process dead in the fields WITHOUT emitting 'exit' (the lost-event case). */
  dieSilently(code, signal) {
    this.alive = false;
    this.exitCode = code;
    this.signalCode = signal;
  }

  reply(msg) {
    this.emit('message', msg);
  }
}

/** A well-behaved worker: answers load with loaded and run with done, exits 0 on shutdown. */
export function wellBehaved(child) {
  child.onSend = (msg) => {
    setImmediate(() => {
      if (!child.alive) return;
      if (msg.type === 'load') child.reply({ type: 'loaded', direction: msg.direction, ms: 1 });
      else if (msg.type === 'run')
        child.reply({
          type: 'done',
          jobId: msg.jobId,
          outputs: msg.segments.map((s) => 'T:' + s),
          complete: true,
          deadlineHit: false,
          cancelled: false,
          stats: { runMs: 1 },
        });
      else if (msg.type === 'shutdown') child.die(0, null);
    });
  };
  return child;
}

/**
 * Supervisor over scripted fake children. `script(spawnIndex)` returns a FakeChild (use wellBehaved), or throws.
 * Returns { sup, children, events, ofType, aliveCount, maxAlive }.
 */
export function makeFakeSup(script, opts = {}) {
  const children = [];
  const events = [];
  let maxAlive = 0;
  const aliveCount = () => children.filter((c) => c.alive).length;
  const sup = new Supervisor({
    concurrency: 1,
    computeMaxMs: 3000,
    killGraceMs: 100,
    loadTimeoutMs: 1500,
    loadBackoffMinMs: 50,
    loadBackoffMaxMs: 200,
    shutdownGraceMs: 500,
    exitWaitMs: 150,
    spawn: ({ spawnIndex }) => {
      const c = script(spawnIndex);
      children.push(c);
      maxAlive = Math.max(maxAlive, aliveCount());
      return c;
    },
    ...opts,
  });
  sup.on('event', (e) => events.push(e));
  return {
    sup,
    children,
    events,
    ofType: (t, p = () => true) => events.filter((e) => e.type === t && p(e)),
    aliveCount,
    get maxAlive() {
      return Math.max(maxAlive, aliveCount());
    },
  };
}
