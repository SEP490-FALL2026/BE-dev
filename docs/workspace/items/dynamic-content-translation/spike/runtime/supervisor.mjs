// Worker-process supervisor. The WORKER PROCESS IS THE SLOT.
//
// Slot rule: a slot is released ONLY when (a) that worker sent done/error for its job, (b) a cancelled job's model
// load finished (the worker answered; no run was started), or (c) that worker's 'exit' event fired (crash or our own
// SIGKILL). Never on caller timeout / abort / compute deadline / timers. A new process is spawned into a slot only
// after the previous process's 'exit' event, so live workers <= concurrency at all times.
//
// Job states: QUEUED -> RUNNING -> (CANCEL_REQUESTED) -> DONE | ABANDONED | FAILED   (QUEUED -> ABANDONED on removal)
// Model states (per worker, per direction): UNLOADED -> LOADING -> READY | FAILED -> DISPOSING -> UNLOADED
//   (FAILED is tracked per direction with exponential backoff, or permanent).
// Clocks owned here: computeDeadline (run-SENT + computeMaxMs, where run is sent to a worker that is READY for the
//   direction, i.e. after spawn + model load; enforced cooperatively IN the worker, this side only flags it and sends
//   cancel), the kill timer (computeDeadline + killGraceMs, or cancel + killGraceMs when a cancel arrives while the job
//   is executing) and the load timer (loadTimeoutMs, spawn + model load). The caller's responseDeadline lives in the
//   coordinator and bounds the total for each waiter.
import { EventEmitter } from 'node:events';

export const mono = () => Number(process.hrtime.bigint() / 1000n) / 1000; // monotonic ms (float)

export class Supervisor extends EventEmitter {
  constructor({
    spawn,
    concurrency = 1,
    computeMaxMs = 10_000,
    killGraceMs = 3_000,
    loadTimeoutMs = 30_000,
    loadBackoffMinMs = 1_000,
    loadBackoffMaxMs = 60_000,
    shutdownGraceMs = 5_000,
    exitWaitMs = 2_000, // bound on waiting for a killed/errored child's 'exit' before consulting the child's own fields
    deadlineCancel = true, // at the compute deadline also send `cancel` (belt and braces); false = rely on the worker's own criterion
  } = {}) {
    super();
    if (typeof spawn !== 'function') throw new TypeError('spawn(ctx) => ChildProcess is required');
    Object.assign(this, { spawnFn: spawn, concurrency, computeMaxMs, killGraceMs, loadTimeoutMs, loadBackoffMinMs, loadBackoffMaxMs, shutdownGraceMs, exitWaitMs, deadlineCancel });
    this.slots = Array.from({ length: concurrency }, (_, id) => ({
      id,
      child: null,
      pid: null,
      exiting: false,
      job: null,
      models: new Map(), // direction -> 'LOADING' | 'READY' | 'DISPOSING' (absent = UNLOADED)
      loadTimer: null,
      deadlineTimer: null,
      killTimer: null,
      killAtMono: null,
      spawnSeen: false,
      exitWatchTimer: null,
      shutdownSent: false,
      unloadWaiters: new Map(),
    }));
    this.queue = [];
    this.dirs = new Map(); // direction -> { permanent, failures, backoffMs, backoffUntil }
    this.shuttingDown = false;
    this.shutdownPromise = null;
    this.spawnIndex = 0;
    this.nextJobId = 1;
  }

  // ---- public API ----------------------------------------------------------------------------------------------

  get queuedCount() {
    return this.queue.length;
  }

  get liveWorkers() {
    return this.slots.filter((s) => s.child).length;
  }

  get runningCount() {
    return this.slots.filter((s) => s.job).length;
  }

  modelState(slotId, direction) {
    return this.slots[slotId].models.get(direction) ?? 'UNLOADED';
  }

  directionState(direction) {
    const d = this.#dir(direction);
    const inBackoff = d.backoffUntil > mono();
    let state = 'UNLOADED';
    if (d.permanent || inBackoff) state = 'FAILED';
    else if (this.slots.some((s) => s.models.get(direction) === 'READY')) state = 'READY';
    else if (this.slots.some((s) => s.models.get(direction) === 'LOADING')) state = 'LOADING';
    return { state, permanent: d.permanent, backoffMs: d.backoffMs, backoffUntil: d.backoffUntil };
  }

  enqueue({ direction, segments }) {
    const job = {
      id: this.nextJobId++,
      direction,
      segments,
      state: 'QUEUED',
      phase: null,
      slotId: null,
      enqueuedAt: mono(),
      dispatchedAt: null,
      runSentAt: null,
      computeDeadlineEpochMs: null,
      cancelRequested: false,
      deadlineFlag: false,
      killReason: null,
      settledFlag: false,
    };
    job.settled = new Promise((resolve) => {
      job.resolve = resolve;
    });
    this.#emit('enqueue', { jobId: job.id, direction });
    if (this.shuttingDown) {
      this.#settle(job, { state: 'ABANDONED', reason: 'SHUTDOWN', complete: false });
      return job;
    }
    this.queue.push(job);
    this.#pump();
    return job;
  }

  /** QUEUED -> ABANDONED. Returns false when the job is not queued (already dispatched). */
  removeQueued(job) {
    const i = this.queue.indexOf(job);
    if (i < 0) return false;
    this.queue.splice(i, 1);
    this.#settle(job, { state: 'ABANDONED', reason: 'REMOVED_QUEUED', complete: false });
    return true;
  }

  /**
   * Ask the worker to stop. QUEUED jobs are simply removed. RUNNING jobs go to CANCEL_REQUESTED: the slot stays held
   * until the worker answers (done) or exits. Idempotent.
   */
  cancel(job) {
    if (job.state === 'QUEUED') return this.removeQueued(job);
    if (job.state !== 'RUNNING') return false; // CANCEL_REQUESTED already, or terminal
    const slot = this.slots[job.slotId];
    job.state = 'CANCEL_REQUESTED';
    job.cancelRequested = true;
    if (job.phase === 'EXECUTING') {
      this.#emit('cancelSent', { jobId: job.id, slot: slot.id });
      this.#send(slot, { type: 'cancel', jobId: job.id });
      // The worker must acknowledge within the grace after a cancel, not only after the compute deadline.
      this.#armKill(slot, 'unresponsive', Math.min(slot.killAtMono ?? Infinity, mono() + this.killGraceMs));
    }
    // LOADING: model load is a blocking native call; the load result is awaited, then no run is sent.
    return true;
  }

  /** Dispose one direction's pipelines in every idle worker that has it READY: READY -> DISPOSING -> UNLOADED. */
  unload(direction) {
    const waits = [];
    for (const slot of this.slots) {
      if (slot.job || !slot.child || slot.models.get(direction) !== 'READY') continue;
      slot.models.set(direction, 'DISPOSING');
      waits.push(new Promise((resolve) => slot.unloadWaiters.set(direction, resolve)));
      this.#send(slot, { type: 'unload', direction });
    }
    return Promise.all(waits).then(() => undefined);
  }

  /**
   * stop admission -> settle queued -> cancel running -> wait done (<= shutdownGraceMs) -> `shutdown` message
   * (worker disposes pipelines, exits 0) -> SIGKILL when the grace expires -> resolve after every exit.
   */
  shutdown() {
    if (this.shutdownPromise) return this.shutdownPromise;
    this.shuttingDown = true;
    this.#emit('shutdownStart');
    this.shutdownPromise = new Promise((resolve) => {
      this.resolveShutdown = resolve;
    });
    for (const job of this.queue.splice(0)) this.#settle(job, { state: 'ABANDONED', reason: 'SHUTDOWN', complete: false });
    for (const slot of this.slots) if (slot.job) this.cancel(slot.job);
    this.shutdownHardTimer = setTimeout(() => {
      for (const slot of this.slots) {
        if (!slot.child) continue;
        if (slot.job) slot.job.killReason = 'shutdown-grace';
        this.#kill(slot, 'shutdown-grace');
      }
    }, this.shutdownGraceMs);
    this.#shutdownProgress();
    return this.shutdownPromise;
  }

  // ---- internals -----------------------------------------------------------------------------------------------

  #dir(direction) {
    let d = this.dirs.get(direction);
    if (!d) {
      d = { permanent: false, failures: 0, backoffMs: 0, backoffUntil: 0 };
      this.dirs.set(direction, d);
    }
    return d;
  }

  #emit(type, extra = {}) {
    this.emit('event', { t: mono(), wall: Date.now(), type, ...extra });
  }

  #settle(job, outcome) {
    if (job.settledFlag) return;
    job.settledFlag = true;
    job.state = outcome.state;
    const full = { jobId: job.id, direction: job.direction, ...outcome };
    this.#emit('settled', { jobId: job.id, state: outcome.state, reason: outcome.reason });
    job.resolve(full);
  }

  #shutdownProgress() {
    if (!this.shuttingDown) return;
    for (const slot of this.slots) {
      if (slot.child && !slot.job && !slot.exiting && !slot.shutdownSent) {
        slot.shutdownSent = true;
        this.#emit('shutdownSent', { slot: slot.id, pid: slot.pid });
        this.#send(slot, { type: 'shutdown' });
      }
    }
    if (this.liveWorkers === 0) {
      clearTimeout(this.shutdownHardTimer);
      this.resolveShutdown?.();
    }
  }

  #pump() {
    if (this.shuttingDown) return;
    while (this.queue.length) {
      const job = this.queue[0];
      const d = this.#dir(job.direction);
      if (d.permanent) {
        this.queue.shift();
        this.#settle(job, { state: 'FAILED', reason: 'DIRECTION_PERMANENT', complete: false });
        continue;
      }
      const free = this.slots.filter((s) => !s.job && !s.exiting);
      if (!free.length) return;
      const slot = free.find((s) => s.models.get(job.direction) === 'READY') ?? free[0];
      if (slot.models.get(job.direction) !== 'READY' && d.backoffUntil > mono()) {
        this.queue.shift();
        this.#settle(job, { state: 'FAILED', reason: 'LOAD_BACKOFF', complete: false });
        continue;
      }
      this.queue.shift();
      this.#dispatch(slot, job);
    }
  }

  #dispatch(slot, job) {
    job.state = 'RUNNING';
    job.phase = 'STARTING';
    job.slotId = slot.id;
    job.dispatchedAt = mono();
    slot.job = job; // the compute clock is NOT started here: see #startRun

    this.#emit('dispatch', { jobId: job.id, slot: slot.id });
    if (!slot.child && !this.#spawn(slot)) return; // sync spawn failure: slot released and job settled already
    this.#advance(slot);
  }

  /**
   * The compute clock starts HERE: `run` is about to be sent to a worker whose model for this direction is READY (after
   * spawn + load). computeDeadline = now + computeMaxMs, enforced cooperatively in the worker; the kill timer is
   * computeDeadline + killGraceMs. Spawn + model load are bounded by loadTimeoutMs instead, and every waiter's response
   * deadline (coordinator) still bounds the total, so nothing is unbounded.
   */
  #startRun(slot, job) {
    job.phase = 'EXECUTING';
    job.runSentAt = mono();
    job.computeDeadlineEpochMs = Date.now() + this.computeMaxMs;
    slot.deadlineTimer = setTimeout(() => this.#onComputeDeadline(slot, job), this.computeMaxMs);
    this.#armKill(slot, 'unresponsive', job.runSentAt + this.computeMaxMs + this.killGraceMs);
    this.#emit('runSent', { jobId: job.id, slot: slot.id, computeDeadlineEpochMs: job.computeDeadlineEpochMs });
  }

  #armKill(slot, reason, atMono) {
    clearTimeout(slot.killTimer);
    slot.killAtMono = atMono;
    slot.killTimer = setTimeout(
      () => {
        slot.killTimer = null;
        if (slot.job) slot.job.killReason ??= reason;
        this.#kill(slot, reason);
      },
      Math.max(0, atMono - mono()),
    );
  }

  #clearJobTimers(slot) {
    clearTimeout(slot.deadlineTimer);
    clearTimeout(slot.killTimer);
    slot.deadlineTimer = null;
    slot.killTimer = null;
    slot.killAtMono = null;
  }

  #onComputeDeadline(slot, job) {
    slot.deadlineTimer = null;
    if (slot.job !== job) return;
    job.deadlineFlag = true;
    this.#emit('deadline', { jobId: job.id, slot: slot.id });
    if (this.deadlineCancel) this.cancel(job); // belt and braces: the worker enforces the deadline itself; this just asks again
  }

  /** @returns {boolean} false when no child could be created (the job is already settled and the slot released). */
  #spawn(slot) {
    const spawnIndex = this.spawnIndex++;
    let child = null;
    let code = null;
    try {
      child = this.spawnFn({ slotId: slot.id, spawnIndex });
    } catch (e) {
      code = String(e?.code ?? e?.name ?? 'Error').slice(0, 40); // never the message
    }
    if (!child || typeof child.on !== 'function') {
      this.#spawnFailed(slot, { phase: 'sync', code: code ?? 'NO_CHILD', spawnIndex, pump: false });
      return false;
    }
    slot.child = child;
    slot.pid = child.pid;
    slot.spawnSeen = false;
    slot.exiting = false;
    slot.shutdownSent = false;
    slot.models.clear();
    child.stdout?.resume();
    child.stderr?.resume();
    child.once('spawn', () => {
      if (slot.child === child) slot.spawnSeen = true;
    });
    child.on('message', (msg) => this.#onMessage(slot, child, msg));
    child.once('exit', (c, signal) => this.#onExit(slot, child, c, signal));
    child.on('error', (err) => this.#onChildError(slot, child, err));
    this.#emit('spawn', { slot: slot.id, pid: child.pid, spawnIndex });
    return true;
  }

  /**
   * A ChildProcess 'error' (Node docs: emitted when the process could not be spawned, could not be killed, a message
   * could not be sent, or it was aborted; 'exit' MAY OR MAY NOT follow). Two different situations:
   *  (a) NO CHILD EXISTS: pid undefined and no 'spawn' event yet -> there is no OS process to wait for. Release the slot
   *      now, settle the job SPAWN_FAILED, count it in the breaker, go on with the queue. A later 'exit' is ignored.
   *  (b) CHILD IS ALIVE (pid defined or 'spawn' seen; IPC/kill error): never release a live process's slot. Kill it by
   *      OUR handle and wait for 'exit'; the exit-wait bound (see #onExitWatch) covers a lost 'exit' event.
   */
  #onChildError(slot, child, err) {
    if (slot.child !== child) return;
    const code = String(err?.code ?? err?.name ?? 'Error').slice(0, 40);
    if (child.pid === undefined && !slot.spawnSeen) {
      this.#spawnFailed(slot, { phase: 'async', code, pump: true });
      return;
    }
    this.#emit('childError', { slot: slot.id, pid: slot.pid, code });
    if (slot.job) slot.job.killReason ??= 'child-error';
    this.#kill(slot, 'child-error');
  }

  #spawnFailed(slot, { phase, code, spawnIndex = null, pump }) {
    clearTimeout(slot.loadTimer);
    clearTimeout(slot.exitWatchTimer);
    slot.loadTimer = null;
    slot.exitWatchTimer = null;
    slot.child = null; // detached: its late events are ignored by the slot.child !== child guards
    slot.pid = null;
    slot.exiting = false;
    slot.spawnSeen = false;
    slot.models.clear();
    for (const w of slot.unloadWaiters.values()) w();
    slot.unloadWaiters.clear();
    this.#emit('spawnFailed', { slot: slot.id, phase, code, spawnIndex });
    const job = slot.job;
    if (job) {
      this.#release(slot, 'spawn-failed');
      this.emit('failure', { kind: 'spawnFailed', direction: job.direction, jobId: job.id });
      this.#settle(job, { state: 'FAILED', reason: 'SPAWN_FAILED', complete: false });
    }
    if (pump) {
      this.#pump();
      this.#shutdownProgress();
    }
  }

  #send(slot, msg) {
    try {
      slot.child?.send(msg, () => {});
    } catch {
      /* channel closed: the exit event follows */
    }
  }

  #advance(slot) {
    const job = slot.job;
    if (!job) return;
    const state = slot.models.get(job.direction);
    if (state === 'READY') {
      this.#startRun(slot, job);
      this.#send(slot, {
        type: 'run',
        jobId: job.id,
        direction: job.direction,
        segments: job.segments,
        computeDeadlineEpochMs: job.computeDeadlineEpochMs,
        maxNewTokensRule: 'min(512,2*inputTokens+16)',
      });
    } else if (state === 'LOADING' || state === 'DISPOSING') {
      /* wait for loaded / loadFailed / unloaded */
    } else {
      slot.models.set(job.direction, 'LOADING');
      job.phase = 'LOADING';
      this.#emit('loadStart', { slot: slot.id, direction: job.direction });
      this.#send(slot, { type: 'load', direction: job.direction });
      slot.loadTimer = setTimeout(() => this.#onLoadTimeout(slot, job), this.loadTimeoutMs);
    }
  }

  #onLoadTimeout(slot, job) {
    slot.loadTimer = null;
    if (slot.job !== job || job.phase !== 'LOADING') return;
    job.killReason = 'load-timeout';
    this.#noteTransientLoadFailure(job.direction, job.id);
    this.#kill(slot, 'load-timeout');
  }

  #kill(slot, reason) {
    const child = slot.child;
    if (!child || slot.exiting) return;
    slot.exiting = true;
    this.#emit('killSent', { slot: slot.id, pid: slot.pid, reason });
    this.#signalKill(child);
    this.#armExitWatch(slot, child);
  }

  /** SIGKILL through our own handle. kill() may throw or return false (Node docs: false = signal not delivered). */
  #signalKill(child) {
    try {
      return child.kill('SIGKILL') !== false;
    } catch {
      return false;
    }
  }

  #armExitWatch(slot, child) {
    clearTimeout(slot.exitWatchTimer);
    slot.exitWatchTimer = setTimeout(() => this.#onExitWatch(slot, child), this.exitWaitMs);
  }

  /**
   * 'exit' did not arrive within exitWaitMs after a kill. The slot is marked dead ONLY when the child's own fields say
   * the process is gone: `exitCode !== null || signalCode !== null || pid === undefined` (Node: both fields are null
   * while the child runs). Anything else is treated as alive: SIGKILL again, wait again, and the slot stays held, so
   * live processes can never exceed the concurrency. A synthetic exit is flagged in the event log.
   */
  #onExitWatch(slot, child) {
    slot.exitWatchTimer = null;
    if (slot.child !== child) return;
    const dead = (child.exitCode !== null && child.exitCode !== undefined) || (child.signalCode !== null && child.signalCode !== undefined) || child.pid === undefined;
    if (dead) {
      this.#onExit(slot, child, child.exitCode ?? null, child.signalCode ?? null, true);
      return;
    }
    this.#emit('exitWaitExpired', { slot: slot.id, pid: slot.pid });
    this.#signalKill(child);
    this.#armExitWatch(slot, child);
  }

  #noteTransientLoadFailure(direction, jobId) {
    const d = this.#dir(direction);
    d.failures++;
    d.backoffMs = Math.min(this.loadBackoffMaxMs, this.loadBackoffMinMs * 2 ** (d.failures - 1));
    d.backoffUntil = mono() + d.backoffMs;
    this.emit('failure', { kind: 'loadTransient', direction, jobId });
  }

  #release(slot, by) {
    const job = slot.job;
    slot.job = null;
    this.#clearJobTimers(slot);
    this.#emit('release', { slot: slot.id, jobId: job?.id ?? null, by });
  }

  #onMessage(slot, child, msg) {
    if (slot.child !== child || !msg || typeof msg.type !== 'string') return;
    const job = slot.job;
    switch (msg.type) {
      case 'loaded': {
        clearTimeout(slot.loadTimer);
        slot.loadTimer = null;
        slot.models.set(msg.direction, 'READY');
        const d = this.#dir(msg.direction);
        d.failures = 0;
        d.backoffMs = 0;
        d.backoffUntil = 0;
        this.#emit('loaded', { slot: slot.id, direction: msg.direction, ms: msg.ms, lockMs: msg.lockMs, rssMb: msg.rssMb });
        if (job && job.direction === msg.direction && job.phase === 'LOADING') {
          if (job.cancelRequested) {
            // cancelled (by waiters / compute deadline / shutdown) while the blocking load ran: do not start the run
            this.#release(slot, 'cancelled-before-run');
            this.#settle(job, { state: 'ABANDONED', reason: job.deadlineFlag ? 'DEADLINE' : 'CANCELLED', complete: false, deadlineHit: job.deadlineFlag, cancelled: !job.deadlineFlag });
            if (job.deadlineFlag) this.emit('failure', { kind: 'deadline', direction: job.direction, jobId: job.id });
            this.#pump();
            this.#shutdownProgress();
          } else {
            this.#advance(slot);
          }
        }
        break;
      }
      case 'loadFailed': {
        clearTimeout(slot.loadTimer);
        slot.loadTimer = null;
        slot.models.delete(msg.direction);
        const permanent = msg.permanent === true;
        const code = typeof msg.code === 'string' && /^[A-Z0-9_]{1,40}$/.test(msg.code) ? msg.code : undefined; // short machine code only
        this.#emit('loadFailed', { slot: slot.id, direction: msg.direction, permanent, code });
        if (permanent) {
          this.#dir(msg.direction).permanent = true;
          this.emit('failure', { kind: 'permanent', direction: msg.direction, jobId: job?.id ?? null });
        } else {
          this.#noteTransientLoadFailure(msg.direction, job?.id ?? null);
        }
        if (job && job.direction === msg.direction) {
          this.#release(slot, 'loadFailed');
          this.#settle(job, { state: 'FAILED', reason: 'LOAD_FAILED', permanent, code, complete: false });
        }
        this.#pump();
        this.#shutdownProgress();
        break;
      }
      case 'started':
        if (job && job.id === msg.jobId) this.#emit('started', { jobId: job.id, slot: slot.id });
        break;
      case 'done': {
        if (!job || job.id !== msg.jobId) return;
        this.#emit('done', { jobId: job.id, slot: slot.id, complete: msg.complete === true });
        this.#release(slot, 'done');
        const complete = msg.complete === true && !msg.deadlineHit && !msg.cancelled;
        // The worker may see our belt-and-braces cancel before it notices the deadline itself: both mean "deadline".
        const deadlineHit = !complete && (msg.deadlineHit === true || job.deadlineFlag);
        if (deadlineHit) this.emit('failure', { kind: 'deadline', direction: job.direction, jobId: job.id });
        // TRUNCATED: a segment hit max_new_tokens without EOS. A fact about the output, reported by the worker; it is
        // NOT an engine-health failure (no breaker count: one pathological input must not take the feature down).
        const truncated = !complete && !deadlineHit && msg.reason === 'TRUNCATED';
        this.#settle(job, {
          state: complete ? 'DONE' : truncated ? 'FAILED' : 'ABANDONED',
          reason: complete ? undefined : deadlineHit ? 'DEADLINE' : truncated ? 'TRUNCATED' : job.cancelRequested || msg.cancelled === true ? 'CANCELLED' : 'INCOMPLETE',
          complete,
          outputs: complete ? msg.outputs : undefined,
          deadlineHit,
          cancelled: !complete && !deadlineHit && !truncated && msg.cancelled === true,
          stats: msg.stats,
        });
        this.#pump();
        this.#shutdownProgress();
        break;
      }
      case 'error': {
        if (!job || job.id !== msg.jobId) return;
        this.#emit('error', { jobId: job.id, slot: slot.id, code: msg.code });
        this.#release(slot, 'error');
        this.#settle(job, { state: 'FAILED', reason: 'ERROR', code: String(msg.code).slice(0, 40), complete: false });
        this.#pump();
        this.#shutdownProgress();
        break;
      }
      case 'unloaded': {
        slot.models.delete(msg.direction);
        slot.unloadWaiters.get(msg.direction)?.();
        slot.unloadWaiters.delete(msg.direction);
        if (job) this.#advance(slot);
        break;
      }
      default:
        break;
    }
  }

  #onExit(slot, child, code, signal, synthetic = false) {
    if (slot.child !== child) return;
    clearTimeout(slot.loadTimer);
    clearTimeout(slot.exitWatchTimer);
    slot.loadTimer = null;
    slot.exitWatchTimer = null;
    slot.spawnSeen = false;
    slot.child = null;
    const pid = slot.pid;
    slot.pid = null;
    slot.exiting = false;
    slot.models.clear();
    for (const w of slot.unloadWaiters.values()) w();
    slot.unloadWaiters.clear();
    this.#emit('exit', { slot: slot.id, pid, code, signal, ...(synthetic ? { synthetic: true } : {}) });
    const job = slot.job;
    if (job) {
      this.#release(slot, 'exit');
      if (job.killReason === 'child-error') {
        this.emit('failure', { kind: 'crash', direction: job.direction, jobId: job.id });
        this.#settle(job, { state: 'FAILED', reason: 'CHILD_ERROR', complete: false });
      } else if (job.killReason === 'load-timeout') {
        this.#settle(job, { state: 'FAILED', reason: 'LOAD_TIMEOUT', complete: false });
      } else if (job.killReason) {
        if (job.killReason !== 'shutdown-grace') this.emit('failure', { kind: 'kill', direction: job.direction, jobId: job.id });
        this.#settle(job, { state: 'ABANDONED', reason: 'KILLED', complete: false, killed: true, deadlineHit: job.deadlineFlag });
      } else {
        this.emit('failure', { kind: 'crash', direction: job.direction, jobId: job.id });
        this.#settle(job, { state: 'FAILED', reason: 'CRASHED', complete: false });
      }
    } else if (!this.shuttingDown && code !== 0) {
      this.emit('failure', { kind: 'crash', direction: null, jobId: null });
    }
    this.#pump();
    this.#shutdownProgress();
  }
}
