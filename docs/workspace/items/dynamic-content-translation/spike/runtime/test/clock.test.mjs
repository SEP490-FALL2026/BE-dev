// V-4: the compute clock starts when `run` is SENT to a worker that is READY for that direction (after spawn + load),
// not at dispatch. Model load has its own budget (loadTimeoutMs). Each waiter's response deadline still bounds the total.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeSup, sleep, waitFor, warm } from './helpers.mjs';
import { Coordinator } from '../coordinator.mjs';
import { TranslationCache } from '../cache.mjs';

const first = (h, type, pred) => h.ofType(type, pred)[0];
const identity = { engineId: 'fake@1', modelDigest: 'd1', glossaryVersion: 'g1', placeholderPolicyVersion: 'p1' };

test('cold load slower than computeMaxMs (but inside loadTimeoutMs) does not consume the compute budget', async () => {
  const h = makeSup({ computeMaxMs: 250, loadTimeoutMs: 5000, killGraceMs: 300 }, () => ({ FAKE_LOAD_MS: '700' }));
  const failures = [];
  h.sup.on('failure', (f) => failures.push(f));
  const o = await h.sup.enqueue({ direction: 'vi-en', segments: ['n=3 step=20 cold'] }).settled;
  assert.equal(o.state, 'DONE', JSON.stringify(o));
  assert.equal(o.complete, true);
  assert.deepEqual(failures, []);
  const disp = first(h, 'dispatch');
  const loaded = first(h, 'loaded');
  const sent = first(h, 'runSent');
  assert.ok(loaded.t - disp.t >= 650, 'the load really took longer than computeMaxMs');
  assert.ok(sent.t >= loaded.t, 'run is sent only after the model is READY');
  assert.ok(sent.computeDeadlineEpochMs - sent.wall >= 245 && sent.computeDeadlineEpochMs - sent.wall <= 255, 'deadline = run-sent + computeMaxMs: ' + (sent.computeDeadlineEpochMs - sent.wall));
  assert.equal(h.ofType('killSent').length, 0);
  await h.sup.shutdown();
});

test('the compute deadline still applies after the load: measured from run-sent, not from dispatch', async () => {
  const h = makeSup({ computeMaxMs: 150, loadTimeoutMs: 5000, killGraceMs: 400 }, () => ({ FAKE_LOAD_MS: '400' }));
  const o = await h.sup.enqueue({ direction: 'vi-en', segments: ['n=1000 step=20 slow'] }).settled;
  assert.equal(o.reason, 'DEADLINE');
  const sent = first(h, 'runSent');
  const dl = first(h, 'deadline');
  const disp = first(h, 'dispatch');
  assert.ok(dl.t - sent.t >= 140 && dl.t - sent.t < 300, `deadline event ${dl.t - sent.t} ms after run-sent`);
  assert.ok(dl.t - disp.t >= 540, `deadline event ${dl.t - disp.t} ms after dispatch (includes the load)`);
  await h.sup.shutdown();
});

test('kill timer = run-sent + computeMaxMs + killGraceMs (a cold load does not shorten it)', async () => {
  const h = makeSup({ computeMaxMs: 100, killGraceMs: 150, loadTimeoutMs: 5000 }, () => ({ FAKE_LOAD_MS: '400' }));
  const o = await h.sup.enqueue({ direction: 'vi-en', segments: ['hang'] }).settled;
  assert.equal(o.reason, 'KILLED');
  const sent = first(h, 'runSent');
  const kill = first(h, 'killSent');
  assert.equal(kill.reason, 'unresponsive');
  assert.ok(kill.t - sent.t >= 240 && kill.t - sent.t < 600, `kill ${kill.t - sent.t} ms after run-sent`);
  await h.sup.shutdown();
});

test('no compute deadline / kill fires during the load; cancel during load is CANCELLED (not DEADLINE) and holds the slot until loaded', async () => {
  const h = makeSup({ computeMaxMs: 80, killGraceMs: 80, loadTimeoutMs: 5000 }, () => ({ FAKE_LOAD_MS: '500' }));
  const j = h.sup.enqueue({ direction: 'vi-en', segments: ['x'] });
  await sleep(250); // far beyond computeMaxMs + killGraceMs, still inside the blocking load
  assert.equal(h.ofType('deadline').length, 0);
  assert.equal(h.ofType('killSent').length, 0);
  h.sup.cancel(j);
  const o = await j.settled;
  assert.equal(o.reason, 'CANCELLED');
  assert.equal(h.ofType('runSent').length, 0, 'run never sent');
  assert.ok(first(h, 'loaded').t <= first(h, 'release').t);
  await h.sup.shutdown();
});

test('loadTimeoutMs still bounds a load (the load budget replaces, not removes, the bound)', async () => {
  const h = makeSup({ computeMaxMs: 5000, loadTimeoutMs: 300 }, () => ({ FAKE_LOAD_HANG: '1' }));
  const o = await h.sup.enqueue({ direction: 'vi-en', segments: ['x'] }).settled;
  assert.equal(o.reason, 'LOAD_TIMEOUT');
  await h.sup.shutdown();
});

test('warm path unchanged: run is sent at dispatch, deadline and kill follow computeMaxMs / +grace from there', async () => {
  const h = makeSup({ killGraceMs: 100 });
  await warm(h);
  h.events.length = 0;
  h.sup.computeMaxMs = 150;
  const o = await h.sup.enqueue({ direction: 'vi-en', segments: ['n=100000 step=10 ignoreCancel ignoreDeadline stuck'] }).settled;
  assert.equal(o.reason, 'KILLED');
  const disp = first(h, 'dispatch');
  const sent = first(h, 'runSent');
  const kill = first(h, 'killSent');
  assert.ok(sent.t - disp.t < 25, `warm run-sent ${sent.t - disp.t} ms after dispatch`);
  assert.ok(kill.t - sent.t >= 240 && kill.t - sent.t < 600);
  await h.sup.shutdown();
});

// ---- coordinator level -----------------------------------------------------------------------------------------

function makeCoord(supOpts, env, coordOpts = {}) {
  const h = makeSup(supOpts, env);
  const coord = new Coordinator({ supervisor: h.sup, cache: new TranslationCache(), identity, timeoutMs: 3000, queueMax: 4, ...coordOpts });
  const tr = (text, o = {}) => coord.translate({ organizationId: 'org1', scope: 's', source: 'vi', target: 'en', text, ...o });
  return { ...h, coord, tr };
}

test('coordinator: cold load > computeMaxMs still returns OK when the waiter budget allows it', async () => {
  const c = makeCoord({ computeMaxMs: 250, loadTimeoutMs: 5000 }, () => ({ FAKE_LOAD_MS: '700' }), { timeoutMs: 4000 });
  const r = await c.tr('n=3 step=20 cold');
  assert.equal(r.status, 'OK', JSON.stringify(r.stats));
  assert.ok(r.stats.totalMs >= 650);
  await c.coord.shutdown();
});

test('coordinator: the waiter response deadline fires during a long load; job cancelled, no run is sent, model stays loaded for the next call', async () => {
  const c = makeCoord({ computeMaxMs: 3000, loadTimeoutMs: 5000 }, () => ({ FAKE_LOAD_MS: '900' }), { timeoutMs: 200 });
  const t0 = Date.now();
  const r = await c.tr('n=3 step=20 cold');
  const ms = Date.now() - t0;
  assert.equal(r.status, 'TIMEOUT');
  assert.equal(r.stats.reason, 'timeout');
  assert.ok(ms >= 180 && ms < 600, `waiter settled after ${ms} ms (blocking load still running)`);
  await waitFor(() => c.ofType('release').length === 1, 3000, 'release after load');
  assert.equal(c.ofType('runSent').length, 0, 'job abandoned during load: no run');
  assert.equal(c.ofType('release')[0].by, 'cancelled-before-run');
  c.coord.timeoutMs = 3000;
  const r2 = await c.tr('n=2 step=10 again');
  assert.equal(r2.status, 'OK');
  assert.equal(c.ofType('loadStart').length, 1, 'the loaded model was kept');
  await c.coord.shutdown();
});

test('coordinator: queue timeout during a cold load removes only the queued waiter; the loading job completes', async () => {
  const c = makeCoord({ computeMaxMs: 3000, loadTimeoutMs: 5000 }, () => ({ FAKE_LOAD_MS: '600' }), { timeoutMs: 4000 });
  const head = c.tr('n=2 step=10 head');
  await sleep(30);
  const behind = await c.tr('n=1 step=1 behind', { deadlineAt: Date.now() + 150 });
  assert.equal(behind.status, 'TIMEOUT');
  assert.equal(c.sup.queuedCount, 0, 'queued job removed');
  assert.equal((await head).status, 'OK');
  assert.equal(c.ofType('dispatch').length, 1, 'the timed-out queued job was never dispatched');
  await c.coord.shutdown();
});
