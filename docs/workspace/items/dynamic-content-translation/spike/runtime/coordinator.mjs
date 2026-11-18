// Coordinator: the only entry point for translation requests.
//
//   translate({ organizationId, scope, text, storedSource, sourceOverride?, target, signal, deadlineAt })
//     -> { status: 'OK' | 'TIMEOUT' | 'UNAVAILABLE' | 'BUSY', text, cacheHit, stats,
//          sourceLanguage, effectiveSourceLanguage, sourceOverridden, textLanguage }
//
// AUTHORIZATION CONTRACT: the caller MUST authorize access to the source text (organization, record, field) BEFORE
// calling translate(). The cache and the in-flight map are keyed by (organizationId, scope, ...) digests and are
// consulted here without any further check. There is deliberately no API to read, list, peek or delete cache entries.
//
// On ANY non-OK status `text` is null and the product caller returns the ORIGINAL text (that mapping is the
// product's job, not this spike's). `stats.reason` is a short machine code, never raw text or a library message.
//
// Three clocks (see supervisor.mjs for the other two):
//   responseDeadline  per WAITER: arrival + timeoutMs (default 10 s, includes queue + cold load), also capped by the
//                     caller's `deadlineAt`; settles that waiter alone with TIMEOUT. It never cancels other waiters and
//                     never releases a worker slot.
//   computeDeadline   per JOB (supervisor): run-SENT + computeMaxMs (the run goes to a worker READY for the direction,
//                     i.e. after spawn + model load, which have their own loadTimeoutMs), enforced cooperatively in the worker.
//   kill timer        per JOB (supervisor): computeDeadline + killGraceMs.
import { CircuitBreaker } from './breaker.mjs';
import { normalizeText } from './cache.mjs';
import { splitSentences, joinSegments } from './segmenter.mjs';
import { mono } from './supervisor.mjs';

const DIRECTIONS = new Set(['vi-en', 'en-vi']);

const OUTCOME_STATUS = {
  DEADLINE: ['TIMEOUT', 'deadline'],
  KILLED: ['TIMEOUT', 'killed'],
  CRASHED: ['UNAVAILABLE', 'crash'],
  LOAD_FAILED: ['UNAVAILABLE', 'load-failed'],
  LOAD_TIMEOUT: ['UNAVAILABLE', 'load-timeout'],
  LOAD_BACKOFF: ['UNAVAILABLE', 'load-backoff'],
  DIRECTION_PERMANENT: ['UNAVAILABLE', 'permanent'],
  SHUTDOWN: ['UNAVAILABLE', 'shutdown'],
  CANCELLED: ['UNAVAILABLE', 'cancelled'],
  INCOMPLETE: ['UNAVAILABLE', 'incomplete'],
  TRUNCATED: ['UNAVAILABLE', 'truncated'],
  SPAWN_FAILED: ['UNAVAILABLE', 'spawn-failed'],
  CHILD_ERROR: ['UNAVAILABLE', 'child-error'],
  ERROR: ['UNAVAILABLE', 'error'],
  REMOVED_QUEUED: ['UNAVAILABLE', 'cancelled'],
};

export class Coordinator {
  constructor({
    supervisor,
    cache,
    identity,
    timeoutMs = 10_000,
    queueMax = 4,
    segmenter = splitSentences,
    breakerOptions = {},
  }) {
    this.sup = supervisor;
    this.cache = cache;
    this.identity = identity;
    this.timeoutMs = timeoutMs;
    this.queueMax = queueMax;
    this.segmenter = segmenter;
    this.breakerOptions = breakerOptions;
    /** key -> job; ONLY QUEUED / RUNNING jobs (a job leaves the map when it is cancelled or finished). */
    this.inflight = new Map();
    this.breakers = new Map();
    this.bySup = new Map();
    this.shuttingDown = false;
    this.maxInflightObserved = 0;
    this.sup.on('failure', (f) => this.#onSupervisorFailure(f));
  }

  get inflightSize() {
    return this.inflight.size;
  }

  snapshot() {
    return {
      inflight: this.inflight.size,
      maxInflightObserved: this.maxInflightObserved,
      queued: this.sup.queuedCount,
      cache: this.cache.stats(),
      breakers: Object.fromEntries([...this.breakers].map(([d, b]) => [d, b.snapshot()])),
    };
  }

  /**
   * `storedSource` is the language declared on the record (never changed here); `sourceOverride` is the reader's
   * `source=` parameter. effectiveSource = sourceOverride ?? storedSource drives the same-language shortcut, the model
   * direction and the cache key. (`source` is accepted as a legacy alias of storedSource.)
   *
   * Result metadata on EVERY result: sourceLanguage (stored), effectiveSourceLanguage, sourceOverridden, and
   * textLanguage = the language of the returned `text` as far as it is known: the target language for a translation;
   * for any result where the product shows the ORIGINAL text (non-OK, empty, same-language) it is the effective source
   * when nobody disputed it and null when the reader overrode the stored value (language disputed: the product omits
   * Content-Language).
   */
  async translate(req) {
    const storedSource = req.storedSource ?? req.source;
    const overridden = req.sourceOverride != null && req.sourceOverride !== storedSource;
    const effectiveSource = req.sourceOverride ?? storedSource;
    const r = await this.#translate({ ...req, effectiveSource });
    const translated = r.status === 'OK' && r.stats?.reason !== 'empty' && r.stats?.reason !== 'same-language';
    return {
      ...r,
      sourceLanguage: storedSource,
      effectiveSourceLanguage: effectiveSource,
      sourceOverridden: overridden,
      textLanguage: translated ? req.target : overridden ? null : effectiveSource,
    };
  }

  async #translate({ organizationId, scope, text, effectiveSource: source, target, signal, deadlineAt }) {
    const t0 = mono();
    const direction = `${source}-${target}`;
    const fail = (status, reason, extra = {}) => ({
      status,
      text: null,
      cacheHit: false,
      stats: { reason, totalMs: mono() - t0, ...extra },
    });
    if (this.shuttingDown) return fail('UNAVAILABLE', 'shutdown');
    if (source === target)
      return { status: 'OK', text: String(text), cacheHit: false, stats: { reason: 'same-language', totalMs: 0 } };
    if (!DIRECTIONS.has(direction)) return fail('UNAVAILABLE', 'unsupported-pair');
    const normalized = normalizeText(text);
    if (!normalized)
      return { status: 'OK', text: String(text), cacheHit: false, stats: { reason: 'empty', totalMs: 0 } };

    const key = this.cache.makeKey({ organizationId, scope, ...this.identity, source, target, text });
    const cached = this.cache.get(key);
    if (cached !== undefined) return { status: 'OK', text: cached, cacheHit: true, stats: { totalMs: mono() - t0 } };
    if (signal?.aborted) return fail('TIMEOUT', 'aborted');

    let job = this.inflight.get(key);
    let joined = true;
    if (!job) {
      joined = false;
      if (this.sup.directionState(direction).permanent) return fail('UNAVAILABLE', 'permanent');
      if (this.sup.queuedCount >= this.queueMax) return fail('BUSY', 'busy');
      const acquire = this.#breaker(direction).tryAcquire();
      if (!acquire.ok) return fail('UNAVAILABLE', acquire.reason === 'PERMANENT' ? 'permanent' : 'breaker-open');
      job = this.#createJob(key, direction, normalized, acquire.probe);
    }

    return new Promise((resolve) => {
      const waiter = { settled: false, resolve, arrivedAt: t0, joined, timer: null, onAbort: null };
      const cap = deadlineAt === undefined ? Infinity : deadlineAt - Date.now();
      const budget = Math.max(0, Math.min(this.timeoutMs, cap));
      waiter.timer = setTimeout(() => this.#leave(job, waiter, fail('TIMEOUT', 'timeout', { joined })), budget);
      if (signal) {
        waiter.onAbort = () => this.#leave(job, waiter, fail('TIMEOUT', 'aborted', { joined }));
        signal.addEventListener('abort', waiter.onAbort, { once: true });
        waiter.signal = signal;
      }
      job.waiters.add(waiter);
    });
  }

  async shutdown() {
    this.shuttingDown = true;
    await this.sup.shutdown();
    await new Promise((r) => setImmediate(r)); // let the settle handlers deliver UNAVAILABLE to the last waiters
  }

  // ---- internals -----------------------------------------------------------------------------------------------

  #breaker(direction) {
    let b = this.breakers.get(direction);
    if (!b) {
      b = new CircuitBreaker(this.breakerOptions);
      this.breakers.set(direction, b);
    }
    return b;
  }

  #createJob(key, direction, normalizedText, probe) {
    const supJob = this.sup.enqueue({ direction, segments: this.segmenter(normalizedText) });
    const job = {
      key,
      direction,
      supJob,
      waiters: new Set(),
      probe,
      failed: false,
      finished: false,
      createdAt: mono(),
    };
    this.bySup.set(supJob.id, job);
    if (supJob.settledFlag) {
      // settled synchronously (backoff / permanent / shutdown): handled below through the same path
    } else {
      this.inflight.set(key, job);
      this.maxInflightObserved = Math.max(this.maxInflightObserved, this.inflight.size);
    }
    supJob.settled.then((outcome) => this.#onOutcome(job, outcome));
    return job;
  }

  #leave(job, waiter, result) {
    if (waiter.settled) return;
    waiter.settled = true;
    clearTimeout(waiter.timer);
    waiter.signal?.removeEventListener('abort', waiter.onAbort);
    job.waiters.delete(waiter);
    waiter.resolve(result);
    if (job.waiters.size === 0 && !job.finished) this.#abandon(job);
  }

  /** Waiters reached 0: QUEUED -> remove; RUNNING -> cancel (slot stays held until the worker answers or exits). */
  #abandon(job) {
    if (this.inflight.get(job.key) === job) this.inflight.delete(job.key);
    if (job.supJob.state === 'QUEUED') this.sup.removeQueued(job.supJob);
    else if (job.supJob.state === 'RUNNING') this.sup.cancel(job.supJob);
  }

  #onSupervisorFailure({ kind, direction, jobId }) {
    const job = jobId == null ? null : this.bySup.get(jobId);
    const dir = direction ?? job?.direction;
    if (!dir) return;
    const breaker = this.#breaker(dir);
    if (kind === 'permanent') return breaker.permanent('integrity');
    if (job) job.failed = true;
    breaker.recordFailure(kind, { probe: job?.probe === true });
  }

  #onOutcome(job, outcome) {
    job.finished = true;
    this.bySup.delete(job.supJob.id);
    if (this.inflight.get(job.key) === job) this.inflight.delete(job.key);
    const breaker = this.#breaker(job.direction);
    const ok = outcome.state === 'DONE' && outcome.complete === true && !outcome.deadlineHit && !outcome.cancelled;
    let text = null;
    if (ok) {
      text = joinSegments(outcome.outputs);
      // Late results are cached too (complete, not deadline-hit, not cancelled); they are never delivered to a
      // waiter that already settled because settled waiters are no longer in job.waiters.
      this.cache.set(job.key, text);
    }
    if (job.probe) {
      if (ok) breaker.recordSuccess({ probe: true });
      else if (!job.failed) breaker.releaseProbe();
    }
    const stats = {
      jobId: outcome.jobId,
      reason: ok ? undefined : (OUTCOME_STATUS[outcome.reason] ?? ['UNAVAILABLE', 'error'])[1],
      runMs: outcome.stats?.runMs,
      steps: outcome.stats?.steps,
      code: outcome.code,
      worker: outcome.stats, // raw worker stats (timings, rss) for the benches; never contains text
    };
    for (const waiter of [...job.waiters]) {
      waiter.settled = true;
      clearTimeout(waiter.timer);
      waiter.signal?.removeEventListener('abort', waiter.onAbort);
      job.waiters.delete(waiter);
      const totalMs = mono() - waiter.arrivedAt;
      if (ok)
        waiter.resolve({ status: 'OK', text, cacheHit: false, stats: { ...stats, joined: waiter.joined, totalMs } });
      else {
        const [status] = OUTCOME_STATUS[outcome.reason] ?? ['UNAVAILABLE'];
        waiter.resolve({ status, text: null, cacheHit: false, stats: { ...stats, joined: waiter.joined, totalMs } });
      }
    }
  }
}
