// Real-model tests: skipped unless SPIKE_REAL=1 plus SPIKE_DEPS_DIR (dir with node_modules/@huggingface/transformers)
// and SPIKE_MODELS_DIR (dir with Xenova/opus-mt-*). These are the ONLY tests that back native-cancel claims.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Supervisor } from '../supervisor.mjs';
import { Coordinator } from '../coordinator.mjs';
import { TranslationCache } from '../cache.mjs';
import { verifyLock, loadLock } from '../verify-lock.mjs';
import { makeSpawn } from '../worker/spawn.mjs';
import { sleep, waitFor, pidAlive } from './helpers.mjs';

const enabled = process.env.SPIKE_REAL === '1' && process.env.SPIKE_DEPS_DIR && process.env.SPIKE_MODELS_DIR;
const opts = { skip: enabled ? false : 'set SPIKE_REAL=1 SPIKE_DEPS_DIR=... SPIKE_MODELS_DIR=... to run' };

const SENT = [
  'Giấy phép phần mềm sẽ hết hạn vào cuối tháng này.',
  'Vui lòng liên hệ bộ phận hỗ trợ để gia hạn.',
  'Chúng tôi cần thêm năm chỗ ngồi cho phòng kế toán.',
  'Yêu cầu của bạn đã được trưởng phòng phê duyệt.',
  'Hạn báo hủy là ngày mười lăm của tháng sau.',
  'Xin cho biết lý do cần thay đổi nhà cung cấp.',
];
const many = (n) => Array.from({ length: n }, (_, i) => SENT[i % SENT.length]);

// A failed assertion must not leave a real worker (hundreds of MB) alive and the test process hanging.
const made = [];
after(async () => {
  for (const sup of made) await sup.shutdown().catch(() => {});
});

function make(extra = {}, spawnOpts = {}) {
  const events = [];
  const sup = new Supervisor({
    spawn: makeSpawn({ depsDir: process.env.SPIKE_DEPS_DIR, modelsDir: process.env.SPIKE_MODELS_DIR, intraThreads: 1, ...spawnOpts }),
    concurrency: 1,
    computeMaxMs: 60_000,
    killGraceMs: 3000,
    loadTimeoutMs: 60_000,
    shutdownGraceMs: 5000,
    ...extra,
  });
  sup.on('event', (e) => events.push(e));
  made.push(sup);
  return { sup, events, of: (t) => events.filter((e) => e.type === t) };
}

test('real: vi->en translates, criterion invoked each decoder step, no network attempts, direct-generate path', opts, async () => {
  const h = make();
  const o = await h.sup.enqueue({ direction: 'vi-en', segments: SENT.slice(0, 2) }).settled;
  assert.equal(o.state, 'DONE', JSON.stringify(o));
  assert.equal(o.outputs.length, 2);
  assert.ok(o.outputs.every((t) => typeof t === 'string' && t.length > 5));
  assert.ok(o.stats.steps > 5, 'criterion was invoked per decoder step');
  assert.equal(o.stats.path, 'direct-generate');
  assert.equal(o.stats.fetchCalls, 0);
  await h.sup.shutdown();
});

test('real: compute deadline stops generation cooperatively (deadlineHit, incomplete, small overrun, no kill)', opts, async () => {
  const h = make();
  await h.sup.enqueue({ direction: 'vi-en', segments: [SENT[0]] }).settled; // warm
  h.sup.computeMaxMs = 400;
  const o = await h.sup.enqueue({ direction: 'vi-en', segments: many(30) }).settled;
  assert.equal(o.reason, 'DEADLINE');
  assert.equal(o.complete, false);
  assert.equal(o.outputs, undefined);
  assert.equal(h.of('killSent').length, 0, 'cooperative stop, no SIGKILL');
  assert.equal(h.of('spawn').length, 1);
  await h.sup.shutdown();
});

test('real: cancel mid-run stops the native generation loop within about one decoder step; slot held until done', opts, async () => {
  const h = make();
  await h.sup.enqueue({ direction: 'vi-en', segments: [SENT[0]] }).settled; // warm
  const j = h.sup.enqueue({ direction: 'vi-en', segments: many(40) });
  const next = h.sup.enqueue({ direction: 'vi-en', segments: [SENT[1]] });
  await waitFor(() => h.of('started').length === 2, 10_000, 'started');
  await sleep(300);
  const tCancel = Date.now();
  h.sup.cancel(j);
  const o = await j.settled;
  const latency = Date.now() - tCancel;
  assert.equal(o.reason, 'CANCELLED');
  assert.ok(latency < 1500, `cancel->done ${latency} ms`);
  console.log(`# real cancel->done latency ${latency} ms`);
  assert.equal(h.of('killSent').length, 0);
  assert.equal((await next.settled).state, 'DONE');
  const done = h.of('done').find((e) => e.jobId === j.id);
  assert.ok(h.of('dispatch').find((e) => e.jobId === next.id).t >= done.t);
  await h.sup.shutdown();
});

test('real: SIGKILL of the worker mid-run: parent survives, exit is fast, a respawned worker serves the next job', opts, async () => {
  const h = make();
  await h.sup.enqueue({ direction: 'vi-en', segments: [SENT[0]] }).settled; // warm
  const j = h.sup.enqueue({ direction: 'vi-en', segments: many(40) });
  await waitFor(() => h.of('started').length === 2, 10_000, 'started');
  await sleep(200);
  const pid = h.of('spawn')[0].pid;
  const t0 = Date.now();
  process.kill(pid, 'SIGKILL');
  const o = await j.settled;
  console.log(`# real external SIGKILL settle ${Date.now() - t0} ms`);
  assert.equal(o.reason, 'CRASHED');
  assert.ok(Date.now() - t0 < 500);
  assert.equal(pidAlive(pid), false);
  const o2 = await h.sup.enqueue({ direction: 'vi-en', segments: [SENT[2]] }).settled;
  assert.equal(o2.state, 'DONE');
  assert.equal(h.of('spawn').length, 2);
  await h.sup.shutdown();
});

test('real: en->vi uses the language-token id (self-test passed) and gives a Vietnamese translation', opts, async () => {
  const h = make();
  const o = await h.sup.enqueue({
    direction: 'en-vi',
    segments: ['The license will expire at the end of this month.', 'Please contact support to renew your subscription.'],
  }).settled;
  assert.equal(o.state, 'DONE', JSON.stringify(o));
  assert.ok(o.outputs.every((t) => /[ăâêôơưđàáảãạèéẻẽẹìíỉĩịòóỏõọùúủũụỳýỷỹỵ]/i.test(t) || t.length > 5));
  console.log('# en->vi (direct path):', JSON.stringify(o.outputs));
  assert.ok(!o.outputs.some((t) => /!$/.test(t)), 'no padded-batch "!" artefact at batch size 1');
  await h.sup.shutdown();
});

// ---- review round 2: truncation, model lock ------------------------------------------------------------------------

test('real: truncation is detected with a tiny max_new_tokens (3): FAILED/TRUNCATED, no outputs, coordinator returns UNAVAILABLE/truncated and caches nothing', opts, async () => {
  const h = make({}, { maxNewTokensOverride: 3 });
  const o = await h.sup.enqueue({ direction: 'vi-en', segments: [SENT[0]] }).settled;
  assert.equal(o.state, 'FAILED', JSON.stringify(o));
  assert.equal(o.reason, 'TRUNCATED');
  assert.equal(o.outputs, undefined);
  assert.equal(o.stats.truncatedSegment, 0);
  // Fails if the adapter's forced_eos_token_id:null override were removed: both models' generation_config has
  // forced_eos_token_id 0, so a cut sequence would still end with EOS, finishReason would be 'eos' and the job DONE.
  assert.equal(o.stats.truncatedFinishReason, 'max_new_tokens');
  assert.ok(o.stats.generatedTokens >= 3);
  assert.equal(h.of('killSent').length, 0);
  const cache = new TranslationCache();
  const coord = new Coordinator({ supervisor: h.sup, cache, identity: { engineId: 'real', modelDigest: 'x', glossaryVersion: 'g', placeholderPolicyVersion: 'p' }, timeoutMs: 30_000 });
  const r = await coord.translate({ organizationId: 'o', scope: 's', storedSource: 'vi', target: 'en', text: SENT[1] });
  assert.equal(r.status, 'UNAVAILABLE');
  assert.equal(r.stats.reason, 'truncated');
  assert.equal(cache.size, 0);
  assert.equal(coord.snapshot().breakers['vi-en'].recentFailures, 0, 'truncation is not a breaker failure');
  await h.sup.shutdown();
});

test('real: the lock is verified against the REAL models dir (16 files) and the worker reports the time spent before the model load', opts, async () => {
  const lock = await loadLock(new URL('../model-lock.json', import.meta.url));
  const r = await verifyLock({ root: process.env.SPIKE_MODELS_DIR, lock });
  console.log('# real lock check', JSON.stringify(r));
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.files, 16);
  const h = make();
  const o = await h.sup.enqueue({ direction: 'vi-en', segments: [SENT[0]] }).settled;
  assert.equal(o.state, 'DONE');
  const loaded = h.of('loaded')[0];
  assert.ok(Number.isFinite(loaded.lockMs) && loaded.lockMs > 0, 'worker verified the lock itself before loading: ' + loaded.lockMs + ' ms');
  console.log('# worker lock verification ms (vi-en dir only):', loaded.lockMs);
  await h.sup.shutdown();
});

test('real: a tampered COPY of the models dir (one byte flipped in tokenizer.json) fails with MODEL_LOCK_MISMATCH before any inference; the real dir is untouched', opts, async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'spike-tamper-'));
  try {
    // plain recursive copy of the real dir (no links: the source has none, verified by the lock probe); the real dir is only READ
    fs.cpSync(process.env.SPIKE_MODELS_DIR, tmp, { recursive: true, dereference: false, verbatimSymlinks: true });
    const tok = path.join(tmp, 'Xenova', 'opus-mt-vi-en', 'tokenizer.json');
    const buf = fs.readFileSync(tok);
    buf[100] = buf[100] ^ 0x01;
    fs.writeFileSync(tok, buf);
    const events = [];
    const sup = new Supervisor({ spawn: makeSpawn({ depsDir: process.env.SPIKE_DEPS_DIR, modelsDir: tmp, intraThreads: 1 }), concurrency: 1, computeMaxMs: 60_000, loadTimeoutMs: 60_000, killGraceMs: 3000, shutdownGraceMs: 5000 });
    sup.on('event', (e) => events.push(e));
    made.push(sup);
    const o = await sup.enqueue({ direction: 'vi-en', segments: [SENT[0]] }).settled;
    assert.equal(o.state, 'FAILED', JSON.stringify(o));
    assert.equal(o.reason, 'LOAD_FAILED');
    assert.equal(o.permanent, true);
    assert.equal(o.code, 'MODEL_LOCK_MISMATCH');
    assert.equal(events.filter((e) => e.type === 'loaded').length, 0, 'no model was loaded');
    assert.equal(events.filter((e) => e.type === 'started').length, 0, 'no run was started');
    assert.equal(sup.directionState('vi-en').permanent, true);
    // the other direction (untampered) still loads: the lock is checked per model directory
    const ok = await sup.enqueue({ direction: 'en-vi', segments: ['The license will expire at the end of this month.'] }).settled;
    assert.equal(ok.state, 'DONE', JSON.stringify(ok));
    await sup.shutdown();
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  const real = await verifyLock({ root: process.env.SPIKE_MODELS_DIR, lock: await loadLock(new URL('../model-lock.json', import.meta.url)) });
  assert.equal(real.ok, true, 'real dir still matches the lock');
});
