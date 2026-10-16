// Cooperative stop criterion for transformers.js generate().
// transformers.js calls each criterion once per decoder step (`criterion(input_ids)` -> boolean[] one per sequence).
// The truncated output is returned like a success, so the criterion's own `hit` / `cancelled` flags are the ONLY signal
// that the result is incomplete. Pass it as a PLAIN ARRAY: `generate({ stopping_criteria: [criterion] })`.
// The base class must be the library's own StoppingCriteria (a Callable); it is injected so this module has no
// dependency on transformers.js and can be unit-tested.

/** max_new_tokens rule: min(512, 2*inputTokens + 16). */
export function computeMaxNewTokens(inputTokens) {
  return Math.min(512, 2 * inputTokens + 16);
}

export function createDeadlineCriterion(StoppingCriteriaBase, { computeDeadlineEpochMs, isCancelled = () => false, now = Date.now }) {
  class DeadlineCriterion extends StoppingCriteriaBase {
    constructor() {
      super();
      this.calls = 0;
      this.hit = false;
      this.cancelled = false;
      this.overrunMs = null; // now - deadline at the step that stopped generation
      this.maxStepGapMs = 0; // longest gap between two consecutive invocations (~ one decoder step + loop turn)
      this.firstCallAt = null; // epoch ms of the first invocation (encoder + first decoder step ran before it)
      this._last = 0;
    }

    _call(input_ids) {
      const t = now();
      this.calls++;
      if (this.firstCallAt === null) this.firstCallAt = t;
      if (this._last) this.maxStepGapMs = Math.max(this.maxStepGapMs, t - this._last);
      this._last = t;
      if (!this.hit && !this.cancelled) {
        if (isCancelled()) this.cancelled = true;
        else if (t >= computeDeadlineEpochMs) {
          this.hit = true;
          this.overrunMs = t - computeDeadlineEpochMs;
        }
      }
      return new Array(input_ids.length).fill(this.hit || this.cancelled);
    }
  }
  return new DeadlineCriterion();
}
