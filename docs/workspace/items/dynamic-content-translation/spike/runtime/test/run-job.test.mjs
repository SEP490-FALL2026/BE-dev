// Truncation + done-payload logic of the worker, tested with a FAKE adapter (no model). Interface assumed from
// spike/quality/lib/generate-adapter.mjs: translateSegment(handle, text, opts) ->
//   { text, inputTokens, generatedTokens, endedWithEos, finishReason: 'eos'|'max_new_tokens'|'stopped' }
// A job is complete ONLY if every segment finished with 'eos'.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runJob } from '../worker/run-job.mjs';
import { computeMaxNewTokens } from '../deadline-criteria.mjs';
import { defaultMaxNewTokens } from '../../quality/lib/generate-adapter.mjs';

class StoppingCriteriaBase {}

const eos = (text, extra = {}) => ({ text, inputTokens: 5, generatedTokens: 6, endedWithEos: true, finishReason: 'eos', ...extra });

/** Fake adapter: results[i] is a result object, or a function (opts, text) => result. It invokes the criterion once like the library. */
function fakeAdapter(results, { callCriterion = true, onCall } = {}) {
  const calls = [];
  return {
    calls,
    translateSegment: async (handle, text, opts) => {
      calls.push({ handle, text, opts });
      onCall?.(calls.length - 1, opts);
      if (callCriterion) for (const c of opts.stoppingCriteria ?? []) c._call([[1]]);
      const r = results[calls.length - 1];
      return typeof r === 'function' ? r(opts, text) : r;
    },
  };
}

const base = (extra = {}) => ({
  jobId: 7,
  direction: 'vi-en',
  segments: ['a', 'b', 'c'],
  computeDeadlineEpochMs: Date.now() + 60_000,
  handle: { h: 1 },
  StoppingCriteria: StoppingCriteriaBase,
  isCancelled: () => false,
  rssMb: () => 1,
  ...extra,
});

test('all segments end with EOS: complete, outputs in order, handle and text passed to the adapter', async () => {
  const ad = fakeAdapter([eos('A'), eos('B'), eos('C')]);
  const d = await runJob(base({ translateSegment: ad.translateSegment }));
  assert.equal(d.complete, true);
  assert.deepEqual(d.outputs, ['A', 'B', 'C']);
  assert.equal(d.deadlineHit, false);
  assert.equal(d.cancelled, false);
  assert.equal(d.reason, undefined);
  assert.deepEqual(ad.calls.map((c) => c.text), ['a', 'b', 'c']);
  assert.ok(ad.calls.every((c) => c.handle.h === 1));
  assert.ok(d.stats.steps >= 3);
});

test('TRUNCATED: a segment that reaches max_new_tokens without EOS makes the whole job incomplete; no outputs; later segments are not run', async () => {
  const ad = fakeAdapter([eos('A'), { text: 'half of a sente', inputTokens: 5, generatedTokens: 26, endedWithEos: false, finishReason: 'max_new_tokens' }, eos('C')]);
  const d = await runJob(base({ translateSegment: ad.translateSegment }));
  assert.equal(d.complete, false);
  assert.equal(d.reason, 'TRUNCATED');
  assert.deepEqual(d.outputs, [], 'partial text is never exposed');
  assert.equal(d.deadlineHit, false);
  assert.equal(d.cancelled, false);
  assert.equal(d.stats.truncatedSegment, 1);
  assert.equal(d.stats.truncatedFinishReason, 'max_new_tokens');
  assert.equal(ad.calls.length, 2, 'stopped at the truncated segment');
  assert.ok(!JSON.stringify(d).includes('half of'), 'text never in the stats/payload besides outputs');
});

test('no override: maxNewTokens is left to the adapter default; our rule equals the adapter default (min(512, 2n+16))', async () => {
  const ad = fakeAdapter([eos('A', { maxNewTokens: 26 })]);
  const d = await runJob(base({ segments: ['a'], translateSegment: ad.translateSegment }));
  assert.equal(ad.calls[0].opts.maxNewTokens, undefined);
  assert.equal(d.stats.maxNewTokens, 26, 'taken from the adapter result');
  for (const n of [1, 5, 100, 247, 248, 1000]) assert.equal(computeMaxNewTokens(n), defaultMaxNewTokens(n), 'n=' + n);
});

test('maxNewTokens override (tests/bench): an integer budget is passed through to the adapter', async () => {
  const ad = fakeAdapter([eos('A', { maxNewTokens: 2 })]);
  await runJob(base({ segments: ['a'], maxNewTokensOverride: 2, translateSegment: ad.translateSegment }));
  assert.equal(ad.calls[0].opts.maxNewTokens, 2);
  await assert.rejects(runJob(base({ segments: ['a'], maxNewTokensOverride: 0, translateSegment: ad.translateSegment })), (e) => e.code === 'BAD_MAX_NEW_TOKENS');
});

test('DEADLINE: criterion hit -> finishReason stopped -> done{complete:false, reason DEADLINE, deadlineHit}', async () => {
  let now = 1000;
  const ad = fakeAdapter(
    [
      (opts) => {
        now = 2000; // time passes during the segment; the next criterion call sees the deadline passed
        opts.stoppingCriteria[0]._call([[1]]);
        return { text: 'part', inputTokens: 5, generatedTokens: 3, endedWithEos: false, finishReason: 'stopped' };
      },
    ],
    { callCriterion: false },
  );
  const d = await runJob(base({ segments: ['a', 'b'], computeDeadlineEpochMs: 1500, now: () => now, translateSegment: ad.translateSegment }));
  assert.equal(d.complete, false);
  assert.equal(d.reason, 'DEADLINE');
  assert.equal(d.deadlineHit, true);
  assert.deepEqual(d.outputs, []);
  assert.equal(ad.calls.length, 1);
  assert.ok(d.stats.overrunMs >= 500);
});

test('DEADLINE already passed before a segment starts: no adapter call, deadlineHit', async () => {
  const ad = fakeAdapter([eos('A')]);
  const d = await runJob(base({ computeDeadlineEpochMs: Date.now() - 10, translateSegment: ad.translateSegment }));
  assert.equal(d.reason, 'DEADLINE');
  assert.equal(d.deadlineHit, true);
  assert.equal(ad.calls.length, 0);
});

test('CANCELLED mid-segment: criterion sees the cancel -> stopped -> done{complete:false, reason CANCELLED, cancelled}', async () => {
  let cancelled = false;
  const ad = fakeAdapter(
    [
      (opts) => {
        cancelled = true;
        opts.stoppingCriteria[0]._call([[1]]);
        return { text: 'part', inputTokens: 5, generatedTokens: 2, endedWithEos: false, finishReason: 'stopped' };
      },
    ],
    { callCriterion: false },
  );
  const d = await runJob(base({ isCancelled: () => cancelled, translateSegment: ad.translateSegment }));
  assert.equal(d.complete, false);
  assert.equal(d.reason, 'CANCELLED');
  assert.equal(d.cancelled, true);
  assert.equal(d.deadlineHit, false);
  assert.equal(ad.calls.length, 1);
});

test('CANCELLED before the first segment: no adapter call', async () => {
  const ad = fakeAdapter([eos('A')]);
  const d = await runJob(base({ isCancelled: () => true, translateSegment: ad.translateSegment }));
  assert.equal(d.reason, 'CANCELLED');
  assert.equal(ad.calls.length, 0);
});

test('fail closed on contradictory or unknown adapter results: incomplete, never OK', async () => {
  for (const bad of [
    { text: 'x', inputTokens: 1, generatedTokens: 1, endedWithEos: false, finishReason: 'eos' },
    { text: 'x', inputTokens: 1, generatedTokens: 1, endedWithEos: true, finishReason: 'max_new_tokens' },
    { text: 'x', inputTokens: 1, generatedTokens: 1, endedWithEos: true, finishReason: 'whatever' },
    { text: 'x', inputTokens: 1, generatedTokens: 1, endedWithEos: true },
    { text: 5, inputTokens: 1, generatedTokens: 1, endedWithEos: true, finishReason: 'eos' },
    null,
  ]) {
    const ad = fakeAdapter([bad]);
    const d = await runJob(base({ segments: ['a'], translateSegment: ad.translateSegment }));
    assert.equal(d.complete, false, JSON.stringify(bad));
    // finishReason max_new_tokens wins over a contradictory endedWithEos:true (reported as TRUNCATED, still incomplete)
    assert.equal(d.reason, bad?.finishReason === 'max_new_tokens' ? 'TRUNCATED' : 'INCOMPLETE', JSON.stringify(bad));
    assert.deepEqual(d.outputs, []);
  }
});

test('finishReason stopped without a deadline or cancel flag is INCOMPLETE (someone else stopped it)', async () => {
  const ad = fakeAdapter([{ text: 'x', inputTokens: 1, generatedTokens: 1, endedWithEos: false, finishReason: 'stopped' }]);
  const d = await runJob(base({ segments: ['a'], translateSegment: ad.translateSegment }));
  assert.equal(d.reason, 'INCOMPLETE');
});

test('criterion never invoked: cannot claim enforcement -> error CRITERION_NOT_INVOKED (thrown with a code)', async () => {
  const ad = fakeAdapter([eos('A')], { callCriterion: false });
  await assert.rejects(runJob(base({ segments: ['a'], translateSegment: ad.translateSegment })), (e) => e.code === 'CRITERION_NOT_INVOKED');
});

test('adapter errors propagate (the worker maps them to RUN_FAILED; raw messages never leave the worker)', async () => {
  const d = runJob(base({ segments: ['a'], translateSegment: async () => { throw new Error('secret text in message'); } }));
  await assert.rejects(d, /secret/);
});

test('a TRUNCATED segment after a deadline-free first segment still reports only TRUNCATED, and a later deadline cannot hide it', async () => {
  const ad = fakeAdapter([{ text: 'x', inputTokens: 5, generatedTokens: 26, endedWithEos: false, finishReason: 'max_new_tokens' }]);
  const d = await runJob(base({ segments: ['a', 'b'], translateSegment: ad.translateSegment }));
  assert.equal(d.reason, 'TRUNCATED');
});
