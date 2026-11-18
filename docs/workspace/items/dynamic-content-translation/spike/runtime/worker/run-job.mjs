// Job execution core of the worker, separated from the process shell so it can be tested with a fake adapter.
//
// Adapter contract (spike/quality/lib/generate-adapter.mjs):
//   translateSegment(handle, text, opts) -> { text, inputTokens, generatedTokens, endedWithEos,
//                                             finishReason: 'eos' | 'max_new_tokens' | 'stopped' }
// A job is COMPLETE only if every segment ended with finishReason 'eos' (and endedWithEos agrees). Anything else is an
// incomplete job and the partial text is dropped: done{complete:false, reason:'TRUNCATED'|'DEADLINE'|'CANCELLED'|'INCOMPLETE'}.
// 'TRUNCATED' = a segment reached max_new_tokens without EOS: such text is cut mid-sentence and must neither be cached
// nor shown as a translation. The job stops at the first truncated segment (the remaining compute would be wasted).
import { createDeadlineCriterion } from '../deadline-criteria.mjs';

const hasCode = (code) => Object.assign(new Error(code), { code });

/**
 * @returns {Promise<object>} the `done` IPC payload (without type/jobId decoration beyond jobId).
 * Throws on adapter errors and with code CRITERION_NOT_INVOKED (the caller maps both to `error{code}`).
 */
export async function runJob({
  jobId,
  segments,
  computeDeadlineEpochMs,
  handle,
  translateSegment,
  StoppingCriteria,
  isCancelled,
  rssMb = () => 0,
  now = Date.now,
  maxNewTokensOverride = null,
  extraStats = {},
}) {
  const t0 = now();
  const outputs = [];
  const agg = {
    steps: 0,
    maxStepGapMs: 0,
    firstStepMs: 0,
    overrunMs: null,
    inputTokens: 0,
    maxNewTokens: 0,
    generatedTokens: 0,
  };
  let hit = false;
  let wasCancelled = false;
  let truncatedSegment = null;
  let truncatedFinishReason = null;
  let incomplete = false;
  // Default budget min(512, 2*inputTokens+16) is applied by the adapter (it knows the input token count); a test/bench
  // override is an INTEGER passed through. The reported budget comes from the adapter result.
  if (maxNewTokensOverride !== null && !(Number.isInteger(maxNewTokensOverride) && maxNewTokensOverride > 0))
    throw hasCode('BAD_MAX_NEW_TOKENS');

  for (let i = 0; i < segments.length; i++) {
    if (isCancelled()) {
      wasCancelled = true;
      break;
    }
    if (now() >= computeDeadlineEpochMs) {
      hit = true;
      agg.overrunMs = now() - computeDeadlineEpochMs;
      break;
    }
    const criterion = createDeadlineCriterion(StoppingCriteria, { computeDeadlineEpochMs, isCancelled, now });
    const tc = now();
    // PLAIN ARRAY, not a StoppingCriteriaList instance (a list instance was not invoked in the measured versions).
    const r = await translateSegment(handle, segments[i], {
      ...(maxNewTokensOverride === null ? {} : { maxNewTokens: maxNewTokensOverride }),
      stoppingCriteria: [criterion],
    });
    if (criterion.calls === 0) throw hasCode('CRITERION_NOT_INVOKED'); // cannot claim enforcement
    agg.steps += criterion.calls;
    agg.maxStepGapMs = Math.max(agg.maxStepGapMs, criterion.maxStepGapMs);
    agg.firstStepMs = Math.max(agg.firstStepMs, criterion.firstCallAt - tc);
    if (r && Number.isFinite(r.inputTokens)) {
      agg.inputTokens = Math.max(agg.inputTokens, r.inputTokens);
    }
    if (r && Number.isFinite(r.maxNewTokens)) agg.maxNewTokens = Math.max(agg.maxNewTokens, r.maxNewTokens);
    if (r && Number.isFinite(r.generatedTokens)) agg.generatedTokens += r.generatedTokens;

    if (criterion.hit) {
      hit = true;
      agg.overrunMs = criterion.overrunMs;
      break;
    }
    if (criterion.cancelled) {
      wasCancelled = true;
      break;
    }
    if (r && r.finishReason === 'max_new_tokens') {
      truncatedSegment = i;
      truncatedFinishReason = r.finishReason;
      break;
    }
    if (r && r.finishReason === 'eos' && r.endedWithEos === true && typeof r.text === 'string') {
      outputs.push(r.text);
      continue;
    }
    // 'stopped' without our flags, contradictory or unknown result: fail closed
    incomplete = true;
    break;
  }

  const complete =
    !hit && !wasCancelled && truncatedSegment === null && !incomplete && outputs.length === segments.length;
  const reason = complete
    ? undefined
    : hit
      ? 'DEADLINE'
      : wasCancelled
        ? 'CANCELLED'
        : truncatedSegment !== null
          ? 'TRUNCATED'
          : 'INCOMPLETE';
  const stats = {
    runMs: now() - t0,
    ...agg,
    path: 'direct-generate',
    segments: segments.length,
    rssMb: rssMb(),
    ...extraStats,
  };
  if (truncatedSegment !== null) {
    stats.truncatedSegment = truncatedSegment;
    stats.truncatedFinishReason = truncatedFinishReason;
  }
  return {
    jobId,
    outputs: complete ? outputs : [],
    complete,
    deadlineHit: hit,
    cancelled: wasCancelled,
    reason,
    stats,
  };
}
