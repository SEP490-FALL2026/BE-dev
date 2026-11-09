// Circuit breaker for the translation engine (one instance per direction in the coordinator).
// Failures = compute-deadline hits, kills, crashes, transient load failures.
// 3 failures within 5 min => OPEN (immediate UNAVAILABLE). Cooldown 30 s, doubling to 5 min on probe failure.
// After the cooldown exactly one probe is admitted (HALF_OPEN). Integrity failure => PERMANENT.
export class CircuitBreaker {
  #now;
  #failures = [];
  #openedAt = 0;
  #probeInFlight = false;

  constructor({
    threshold = 3,
    windowMs = 300_000,
    baseCooldownMs = 30_000,
    maxCooldownMs = 300_000,
    now = Date.now,
  } = {}) {
    this.threshold = threshold;
    this.windowMs = windowMs;
    this.baseCooldownMs = baseCooldownMs;
    this.maxCooldownMs = maxCooldownMs;
    this.cooldownMs = baseCooldownMs;
    this.state = 'CLOSED'; // CLOSED | OPEN | HALF_OPEN | PERMANENT
    this.#now = now;
    this.opens = 0;
    this.permanentReason = null;
  }

  /** @returns {{ok:true, probe:boolean} | {ok:false, reason:string}} */
  tryAcquire() {
    switch (this.state) {
      case 'CLOSED':
        return { ok: true, probe: false };
      case 'PERMANENT':
        return { ok: false, reason: 'PERMANENT' };
      case 'OPEN':
        if (this.#now() - this.#openedAt < this.cooldownMs) return { ok: false, reason: 'OPEN' };
        this.state = 'HALF_OPEN';
        this.#probeInFlight = true;
        return { ok: true, probe: true };
      case 'HALF_OPEN':
        if (this.#probeInFlight) return { ok: false, reason: 'HALF_OPEN_PROBE_IN_FLIGHT' };
        this.#probeInFlight = true;
        return { ok: true, probe: true };
      default:
        return { ok: false, reason: 'UNKNOWN' };
    }
  }

  /** The probe finished without a verdict (abandoned before running, cache hit, ...): let another probe in. */
  releaseProbe() {
    this.#probeInFlight = false;
  }

  recordSuccess({ probe = false } = {}) {
    if (probe && this.state === 'HALF_OPEN') {
      this.state = 'CLOSED';
      this.cooldownMs = this.baseCooldownMs;
      this.#failures = [];
      this.#probeInFlight = false;
    }
  }

  recordFailure(kind, { probe = false } = {}) {
    const t = this.#now();
    if (this.state === 'CLOSED') {
      this.#failures = this.#failures.filter((f) => t - f.t < this.windowMs);
      this.#failures.push({ t, kind });
      if (this.#failures.length >= this.threshold) this.#open(t);
    } else if (this.state === 'HALF_OPEN' && probe) {
      this.cooldownMs = Math.min(this.cooldownMs * 2, this.maxCooldownMs);
      this.#open(t);
    }
    // OPEN / PERMANENT / non-probe failure while HALF_OPEN: ignored (cooldown is measured from the original open).
  }

  permanent(reason = 'integrity') {
    this.state = 'PERMANENT';
    this.permanentReason = reason;
    this.#probeInFlight = false;
  }

  #open(t) {
    this.state = 'OPEN';
    this.#openedAt = t;
    this.#probeInFlight = false;
    this.#failures = [];
    this.opens++;
  }

  snapshot() {
    return { state: this.state, cooldownMs: this.cooldownMs, opens: this.opens, recentFailures: this.#failures.length };
  }
}
