import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeSup, sleep, waitFor } from './helpers.mjs';
import { Coordinator } from '../coordinator.mjs';
import { TranslationCache } from '../cache.mjs';

const identity = { engineId: 'fake@1', modelDigest: 'd1', glossaryVersion: 'g1', placeholderPolicyVersion: 'p1' };

function makeCoord({ sup: supOpts = {}, coord: coordOpts = {}, env } = {}) {
  const h = makeSup(supOpts, env);
  const cache = new TranslationCache();
  const coord = new Coordinator({ supervisor: h.sup, cache, identity, timeoutMs: 2000, queueMax: 4, ...coordOpts });
  const req = (text, o = {}) => ({
    organizationId: 'org1',
    scope: 'request:1:justification',
    source: 'vi',
    target: 'en',
    text,
    ...o,
  });
  const tr = (text, o) => coord.translate(req(text, o));
  const warmUp = async () => {
    const r = await tr('n=1 step=1 warm');
    assert.equal(r.status, 'OK');
    h.events.length = 0;
  };
  return { ...h, cache, coord, req, tr, warmUp };
}

test('OK path: segments are batched, outputs joined, result cached; second call is a cache hit with no dispatch', async () => {
  const c = makeCoord();
  const r1 = await c.tr('n=1 step=1 alpha. beta');
  assert.equal(r1.status, 'OK');
  assert.equal(r1.text, 'T:n=1 step=1 alpha. T:beta');
  assert.equal(r1.cacheHit, false);
  const dispatches = c.ofType('dispatch').length;
  const r2 = await c.tr('  n=1   step=1 alpha.  beta ');
  assert.equal(r2.status, 'OK');
  assert.equal(r2.cacheHit, true);
  assert.equal(r2.text, r1.text);
  assert.equal(c.ofType('dispatch').length, dispatches);
  await c.coord.shutdown();
});

test('empty text and unsupported language pair never reach a worker', async () => {
  const c = makeCoord();
  const e = await c.tr('   ');
  assert.equal(e.status, 'OK');
  const u = await c.tr('x', { source: 'fr', target: 'en' });
  assert.equal(u.status, 'UNAVAILABLE');
  assert.equal(c.ofType('enqueue').length, 0);
  await c.coord.shutdown();
});

test('N callers with the same key join ONE job: worker run is called once; no queue slot consumed', async () => {
  const c = makeCoord({ coord: { queueMax: 1 } });
  await c.warmUp();
  const text = 'n=8 step=25 same';
  const ps = Array.from({ length: 6 }, () => c.tr(text));
  await sleep(10);
  assert.equal(c.coord.inflightSize, 1);
  assert.equal(c.sup.queuedCount, 0);
  const rs = await Promise.all(ps);
  assert.ok(rs.every((r) => r.status === 'OK' && r.text === 'T:' + text));
  assert.equal(c.ofType('started').length, 1, 'worker.run called exactly once');
  assert.equal(rs.filter((r) => r.stats.joined).length, 5);
  await c.coord.shutdown();
});

test('one waiter times out alone; the others still get the result and the job is NOT cancelled', async () => {
  const c = makeCoord();
  await c.warmUp();
  const text = 'n=10 step=30 shared';
  const slow = c.tr(text);
  const impatient = c.tr(text, { deadlineAt: Date.now() + 80 });
  const rImpatient = await impatient;
  assert.equal(rImpatient.status, 'TIMEOUT');
  assert.equal(rImpatient.text, null);
  assert.equal(c.ofType('cancelSent').length, 0, 'other waiter still there: no cancel');
  const r = await slow;
  assert.equal(r.status, 'OK');
  assert.equal(r.text, 'T:' + text);
  await c.coord.shutdown();
});

test('abort signal settles only that waiter (TIMEOUT/aborted)', async () => {
  const c = makeCoord();
  await c.warmUp();
  const ac = new AbortController();
  const text = 'n=8 step=30 abortme';
  const a = c.tr(text, { signal: ac.signal });
  const b = c.tr(text);
  setTimeout(() => ac.abort(), 40);
  const ra = await a;
  assert.equal(ra.status, 'TIMEOUT');
  assert.equal(ra.stats.reason, 'aborted');
  assert.equal((await b).status, 'OK');
  const pre = new AbortController();
  pre.abort();
  const rp = await c.tr('n=1 step=1 pre', { signal: pre.signal });
  assert.equal(rp.status, 'TIMEOUT');
  await c.coord.shutdown();
});

test('all callers leave while QUEUED: the job is removed and never dispatched', async () => {
  const c = makeCoord({ coord: { queueMax: 4 } });
  await c.warmUp();
  const running = c.tr('n=15 step=30 running');
  const queued = c.tr('n=1 step=1 queued', { deadlineAt: Date.now() + 60 });
  assert.equal((await queued).status, 'TIMEOUT');
  assert.equal(c.sup.queuedCount, 0);
  assert.equal(c.coord.inflightSize, 1);
  await running;
  await sleep(30);
  assert.equal(c.ofType('dispatch').length, 1, 'only the running job was ever dispatched');
  await c.coord.shutdown();
});

test('all callers leave while RUNNING: cancel is sent, slot is held until the worker says done, next job dispatches after', async () => {
  const c = makeCoord();
  await c.warmUp();
  const a = c.tr('n=40 step=25 leaving', { deadlineAt: Date.now() + 80 });
  const next = c.tr('n=1 step=1 next');
  const ra = await a;
  assert.equal(ra.status, 'TIMEOUT');
  assert.equal(c.ofType('cancelSent').length, 1);
  assert.equal(c.coord.inflightSize, 1, 'cancelled job left the inflight map; the queued one remains');
  assert.equal((await next).status, 'OK');
  const done = c.ofType('done')[0];
  const dispatches = c.ofType('dispatch');
  assert.equal(dispatches.length, 2);
  assert.ok(dispatches[1].t >= done.t, 'dispatch of next job after done of cancelled job');
  assert.equal(c.ofType('release')[0].by, 'done');
  await c.coord.shutdown();
});

test('queue full: immediate BUSY, nothing enqueued, no probe/slot consumed', async () => {
  const c = makeCoord({ coord: { queueMax: 2 } });
  await c.warmUp();
  const ps = ['n=20 step=30 a', 'n=1 step=1 b', 'n=1 step=1 c'].map((t) => c.tr(t)); // 1 running + 2 queued
  const t0 = Date.now();
  const busy = await c.tr('n=1 step=1 d');
  assert.equal(busy.status, 'BUSY');
  assert.equal(busy.text, null);
  assert.ok(Date.now() - t0 < 50);
  assert.equal(c.sup.queuedCount, 2);
  const joined = await c.tr('n=1 step=1 c'); // same key as a queued job: joins, never BUSY
  assert.equal(joined.status, 'OK');
  assert.ok((await Promise.all(ps)).every((r) => r.status === 'OK'));
  await c.coord.shutdown();
});

test('late complete result: cached, never delivered to the waiter that already timed out', async () => {
  const c = makeCoord({ sup: { killGraceMs: 2000 } }); // the worker ignores cancel but answers within the grace
  await c.warmUp();
  const text = 'n=12 step=25 ignoreCancel late';
  const seen = [];
  const p = c.tr(text, { deadlineAt: Date.now() + 80 }).then((r) => {
    seen.push(r.status);
    return r;
  });
  const r = await p;
  assert.equal(r.status, 'TIMEOUT');
  await waitFor(() => c.ofType('done').length === 1, 3000, 'late done');
  await sleep(30);
  assert.deepEqual(seen, ['TIMEOUT'], 'waiter settled exactly once');
  assert.equal(r.status, 'TIMEOUT');
  assert.equal(r.text, null);
  const again = await c.tr(text);
  assert.equal(again.status, 'OK');
  assert.equal(again.cacheHit, true, 'late complete result was cached');
  await c.coord.shutdown();
});

test('deadline-hit result is never cached: the next identical call is a miss and dispatches again', async () => {
  const c = makeCoord({ sup: { killGraceMs: 400 } });
  await c.warmUp();
  c.sup.computeMaxMs = 150;
  const text = 'n=500 step=20 slow';
  const r1 = await c.tr(text);
  assert.equal(r1.status, 'TIMEOUT');
  assert.equal(r1.stats.reason, 'deadline');
  assert.equal(c.cache.size, 1, 'only the warm-up entry');
  const r2 = await c.tr(text);
  assert.equal(r2.cacheHit, false);
  assert.equal(c.ofType('dispatch').length, 2);
  await c.coord.shutdown();
});

test('incomplete (complete:false) results are never cached and map to UNAVAILABLE/TIMEOUT, not OK', async () => {
  const c = makeCoord();
  await c.warmUp();
  const r = await c.tr('n=1 step=1 incomplete');
  assert.notEqual(r.status, 'OK');
  assert.equal(c.cache.size, 1);
  await c.coord.shutdown();
});

test('a new caller for a key whose job is CANCEL_REQUESTED gets a FRESH job', async () => {
  const c = makeCoord();
  await c.warmUp();
  const text = 'n=14 step=25 ignoreCancel fresh';
  const first = await c.tr(text, { deadlineAt: Date.now() + 60 });
  assert.equal(first.status, 'TIMEOUT');
  const supJob1 = c.ofType('dispatch')[0].jobId;
  const second = c.tr(text);
  await sleep(10);
  assert.equal(c.coord.inflightSize, 1);
  const r2 = await second;
  assert.equal(r2.status, 'OK');
  // job 1 finished complete -> cached; job 2 (queued behind it) ran and also completed; at least two enqueues for the key
  assert.equal(c.ofType('enqueue').filter((e) => e.jobId !== supJob1).length >= 1, true);
  await c.coord.shutdown();
});

test('responseDeadline includes queue time and settles the queued waiter alone', async () => {
  const c = makeCoord({ coord: { timeoutMs: 150 } });
  await c.warmUp();
  c.coord.timeoutMs = 5000; // head waiter keeps a long budget; only the queued waiter has 150 ms
  const run = c.tr('n=20 step=30 head');
  c.coord.timeoutMs = 150;
  const t0 = Date.now();
  const q = await c.tr('n=1 step=1 behind');
  const ms = Date.now() - t0;
  assert.equal(q.status, 'TIMEOUT');
  assert.ok(ms >= 120 && ms < 450, `queued waiter settled after ${ms}ms`);
  assert.equal((await run).status, 'OK');
  await c.coord.shutdown();
});

test('cache is isolated per organization and per scope', async () => {
  const c = makeCoord();
  await c.warmUp();
  const text = 'n=1 step=1 same text';
  assert.equal((await c.tr(text)).cacheHit, false);
  assert.equal((await c.tr(text)).cacheHit, true);
  assert.equal((await c.tr(text, { organizationId: 'org2' })).cacheHit, false);
  assert.equal((await c.tr(text, { scope: 'request:2:justification' })).cacheHit, false);
  await c.coord.shutdown();
});

test('inflight size never exceeds queueMax + concurrency; excess is BUSY', async () => {
  const c = makeCoord({ sup: { concurrency: 1 }, coord: { queueMax: 2 } });
  await c.warmUp();
  let max = 0;
  const timer = setInterval(() => (max = Math.max(max, c.coord.inflightSize)), 2);
  const ps = [];
  for (let i = 0; i < 30; i++) ps.push(c.tr(`n=2 step=10 key${i % 10}`));
  const rs = await Promise.all(ps);
  clearInterval(timer);
  assert.ok(max <= 3, `inflight peaked at ${max}`);
  assert.ok(c.coord.snapshot().maxInflightObserved <= 3);
  assert.ok(rs.some((r) => r.status === 'BUSY'));
  assert.ok(rs.every((r) => ['OK', 'BUSY'].includes(r.status)));
  assert.equal(c.coord.inflightSize, 0);
  await c.coord.shutdown();
});

test('circuit opens after 3 failures (deadline hits): immediate UNAVAILABLE, then a single half-open probe', async () => {
  const c = makeCoord({
    sup: { killGraceMs: 400 },
    coord: { breakerOptions: { baseCooldownMs: 250, maxCooldownMs: 1000 } },
  });
  await c.warmUp();
  c.sup.computeMaxMs = 120;
  for (let i = 0; i < 3; i++) assert.equal((await c.tr(`n=500 step=20 slow${i}`)).status, 'TIMEOUT');
  assert.equal(c.coord.snapshot().breakers['vi-en'].state, 'OPEN');
  const before = c.ofType('enqueue').length;
  const t0 = Date.now();
  const open = await c.tr('n=1 step=1 whileopen');
  assert.equal(open.status, 'UNAVAILABLE');
  assert.equal(open.stats.reason, 'breaker-open');
  assert.ok(Date.now() - t0 < 50);
  assert.equal(c.ofType('enqueue').length, before, 'no job created while OPEN');
  await sleep(260);
  c.sup.computeMaxMs = 3000;
  // probe fails -> reopen with doubled cooldown
  c.sup.computeMaxMs = 120;
  assert.equal((await c.tr('n=500 step=20 probefail')).status, 'TIMEOUT');
  assert.equal(c.coord.snapshot().breakers['vi-en'].state, 'OPEN');
  assert.equal(c.coord.snapshot().breakers['vi-en'].cooldownMs, 500);
  await sleep(520);
  c.sup.computeMaxMs = 3000;
  const probe = await c.tr('n=1 step=1 probeok');
  assert.equal(probe.status, 'OK');
  assert.equal(c.coord.snapshot().breakers['vi-en'].state, 'CLOSED');
  await c.coord.shutdown();
});

test('half-open admits exactly one probe; concurrent distinct callers get UNAVAILABLE', async () => {
  const c = makeCoord({ sup: { killGraceMs: 400 }, coord: { breakerOptions: { baseCooldownMs: 200 } } });
  await c.warmUp();
  c.sup.computeMaxMs = 120;
  for (let i = 0; i < 3; i++) await c.tr(`n=500 step=20 slow${i}`);
  await sleep(220);
  c.sup.computeMaxMs = 3000;
  const probe = c.tr('n=10 step=30 probe');
  const other = await c.tr('n=1 step=1 other');
  assert.equal(other.status, 'UNAVAILABLE');
  assert.equal(other.stats.reason, 'breaker-open');
  assert.equal((await probe).status, 'OK');
  await c.coord.shutdown();
});

test('external SIGKILL of the worker: waiters settle fast with UNAVAILABLE; breaker counts it; respawn after exit', async () => {
  const c = makeCoord();
  await c.warmUp();
  const ps = [c.tr('n=200 step=20 victim'), c.tr('n=200 step=20 victim')];
  await waitFor(() => c.ofType('started').length === 1);
  const t0 = Date.now();
  process.kill(c.spawned[0], 'SIGKILL');
  const rs = await Promise.all(ps);
  assert.ok(Date.now() - t0 < 300, `settled in ${Date.now() - t0}ms`);
  assert.ok(rs.every((r) => r.status === 'UNAVAILABLE' && r.stats.reason === 'crash'));
  assert.equal(c.coord.snapshot().breakers['vi-en'].recentFailures, 1);
  const r = await c.tr('n=1 step=1 afterwards');
  assert.equal(r.status, 'OK');
  assert.ok(c.ofType('spawn').at(-1).t >= c.ofType('exit')[0].t);
  await c.coord.shutdown();
});

test('permanent load failure (integrity): UNAVAILABLE forever for that direction only', async () => {
  const c = makeCoord({ env: () => ({ FAKE_LOAD_FAIL: 'permanent', FAKE_LOAD_FAIL_DIR: 'vi-en' }) });
  const r = await c.tr('n=1 step=1 x');
  assert.equal(r.status, 'UNAVAILABLE');
  const enq = c.ofType('enqueue').length;
  const r2 = await c.tr('n=1 step=1 y');
  assert.equal(r2.status, 'UNAVAILABLE');
  assert.equal(c.coord.snapshot().breakers['vi-en'].state, 'PERMANENT');
  assert.equal(c.ofType('enqueue').length, enq, 'no new job for a permanently failed direction');
  const other = await c.tr('n=1 step=1 z', { source: 'en', target: 'vi' });
  assert.equal(other.status, 'OK');
  await c.coord.shutdown();
});

test('shutdown: queued waiters UNAVAILABLE, running cancelled, new calls UNAVAILABLE, all processes gone', async () => {
  const c = makeCoord({ sup: { shutdownGraceMs: 1500 } });
  await c.warmUp();
  const running = c.tr('n=500 step=20 running');
  const queued = c.tr('n=1 step=1 queued');
  await waitFor(() => c.ofType('started').length === 1);
  await c.coord.shutdown();
  const [rr, rq] = await Promise.all([running, queued]);
  assert.equal(rq.status, 'UNAVAILABLE');
  assert.equal(rr.status, 'UNAVAILABLE');
  assert.equal(rq.stats.reason, 'shutdown');
  assert.equal((await c.tr('n=1 step=1 after')).status, 'UNAVAILABLE');
  assert.equal(c.livePids().length, 0);
  assert.equal(c.coord.inflightSize, 0);
});

test('coordinator exposes no cache read/list/delete API', () => {
  const c = makeCoord();
  for (const m of ['getCached', 'cacheGet', 'peek', 'list', 'keys', 'delete', 'evict', 'clear'])
    assert.equal(typeof c.coord[m], 'undefined', m);
});
