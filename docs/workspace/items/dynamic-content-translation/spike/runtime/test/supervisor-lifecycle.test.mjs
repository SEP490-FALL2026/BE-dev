import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeSup, sampleLive, sleep, waitFor, pidAlive, warm } from './helpers.mjs';

const first = (h, type, pred) => h.ofType(type, pred)[0];

test('cancel RUNNING: cancel is sent, slot is held until the worker answers done, then the next job dispatches', async () => {
  const h = makeSup({ computeMaxMs: 5000 });
  const j1 = h.sup.enqueue({ direction: 'vi-en', segments: ['n=500 step=20 long'] });
  const j2 = h.sup.enqueue({ direction: 'vi-en', segments: ['next'] });
  await waitFor(() => h.ofType('started').length === 1, 3000, 'job1 started');
  h.sup.cancel(j1);
  assert.equal(j1.state, 'CANCEL_REQUESTED');
  assert.equal(h.ofType('cancelSent').length, 1);
  assert.equal(h.ofType('dispatch', (e) => e.jobId === j2.id).length, 0, 'slot still held right after cancel()');
  const o1 = await j1.settled;
  assert.equal(o1.state, 'ABANDONED');
  assert.equal(o1.reason, 'CANCELLED');
  const o2 = await j2.settled;
  assert.equal(o2.state, 'DONE');
  const done1 = first(h, 'done', (e) => e.jobId === j1.id);
  const disp2 = first(h, 'dispatch', (e) => e.jobId === j2.id);
  assert.ok(disp2.t >= done1.t, 'next dispatch strictly after done');
  assert.equal(first(h, 'release', (e) => e.jobId === j1.id).by, 'done');
  assert.equal(h.ofType('spawn').length, 1, 'cooperative cancel keeps the worker (and its loaded model)');
  assert.equal(h.ofType('killSent').length, 0);
  await h.sup.shutdown();
});

test('cancel is idempotent and cancel(QUEUED) removes the job', async () => {
  const h = makeSup({ computeMaxMs: 5000 });
  const j1 = h.sup.enqueue({ direction: 'vi-en', segments: ['n=500 step=20 long'] });
  const j2 = h.sup.enqueue({ direction: 'vi-en', segments: ['q'] });
  await waitFor(() => h.ofType('started').length === 1);
  h.sup.cancel(j1);
  h.sup.cancel(j1);
  assert.equal(h.ofType('cancelSent').length, 1);
  h.sup.cancel(j2);
  assert.equal((await j2.settled).reason, 'REMOVED_QUEUED');
  await j1.settled;
  await h.sup.shutdown();
});

test('cooperative compute deadline: worker stops itself; job ABANDONED/DEADLINE; failure(deadline); no kill', async () => {
  const h = makeSup({ killGraceMs: 300 });
  await warm(h);
  h.sup.computeMaxMs = 150;
  const failures = [];
  h.sup.on('failure', (f) => failures.push(f));
  const j = h.sup.enqueue({ direction: 'vi-en', segments: ['n=1000 step=20 slow'] });
  const o = await j.settled;
  assert.equal(o.state, 'ABANDONED');
  assert.equal(o.reason, 'DEADLINE');
  assert.equal(o.deadlineHit, true);
  assert.equal(o.complete, false);
  assert.equal(o.outputs, undefined, 'incomplete outputs are never exposed');
  assert.deepEqual(failures.map((f) => f.kind), ['deadline']);
  assert.equal(h.ofType('killSent').length, 0);
  assert.equal(h.ofType('spawn').length, 1);
  await h.sup.shutdown();
});

test('unresponsive worker (ignores cancel+deadline): SIGKILL at computeDeadline+grace; slot released only after exit; respawn after exit', async () => {
  const h = makeSup({ killGraceMs: 100 });
  await warm(h);
  h.sup.computeMaxMs = 150;
  const failures = [];
  h.sup.on('failure', (f) => failures.push(f));
  const j1 = h.sup.enqueue({ direction: 'vi-en', segments: ['n=100000 step=10 ignoreCancel ignoreDeadline stuck'] });
  h.sup.computeMaxMs = 3000; // j1's deadline was fixed at dispatch; the respawned worker's cold start needs room
  const j2 = h.sup.enqueue({ direction: 'vi-en', segments: ['after'] });
  const o1 = await j1.settled;
  assert.equal(o1.state, 'ABANDONED');
  assert.equal(o1.reason, 'KILLED');
  const disp1 = first(h, 'dispatch', (e) => e.jobId === j1.id);
  const kill = first(h, 'killSent');
  const exit = first(h, 'exit');
  assert.equal(kill.reason, 'unresponsive');
  const rel = first(h, 'release', (e) => e.jobId === j1.id);
  assert.ok(kill.t - disp1.t >= 240, `kill came too early: ${kill.t - disp1.t}`);
  assert.ok(kill.t - disp1.t < 600, `kill came too late: ${kill.t - disp1.t}`);
  assert.ok(exit.t >= kill.t);
  assert.equal(rel.by, 'exit', 'slot released by the exit event, not by the timer');
  assert.ok(rel.t >= exit.t);
  assert.equal(pidAlive(exit.pid), false);
  const o2 = await j2.settled;
  assert.equal(o2.state, 'DONE');
  const disp2 = first(h, 'dispatch', (e) => e.jobId === j2.id);
  const spawn2 = h.ofType('spawn')[1];
  assert.equal(h.ofType('spawn').length, 2);
  assert.ok(disp2.t >= rel.t, 'no dispatch before release');
  assert.ok(spawn2.t >= exit.t, 'respawn strictly after exit');
  assert.ok(failures.some((f) => f.kind === 'kill'));
  await h.sup.shutdown();
});

test('native hang (event loop blocked): killed; kill->exit is quick; slot held until exit', async () => {
  const h = makeSup({ killGraceMs: 100 });
  await warm(h);
  h.sup.computeMaxMs = 150;
  const j = h.sup.enqueue({ direction: 'vi-en', segments: ['hang'] });
  const o = await j.settled;
  assert.equal(o.reason, 'KILLED');
  const kill = first(h, 'killSent');
  const exit = first(h, 'exit');
  assert.ok(exit.t - kill.t < 1000, `exit latency ${exit.t - kill.t}`);
  await h.sup.shutdown();
});

test('cancel while EXECUTING re-arms the kill timer to cancel+grace (does not wait for computeDeadline+grace)', async () => {
  const h = makeSup({ computeMaxMs: 5000, killGraceMs: 150 });
  const j = h.sup.enqueue({ direction: 'vi-en', segments: ['hang'] });
  await waitFor(() => h.ofType('started').length === 1);
  const t0 = Date.now();
  h.sup.cancel(j);
  const o = await j.settled;
  assert.equal(o.reason, 'KILLED');
  assert.ok(Date.now() - t0 < 1500, `took ${Date.now() - t0}ms; kill must follow cancel+grace, not computeMax+grace`);
  await h.sup.shutdown();
});

test('external SIGKILL mid-run: job FAILED/CRASHED fast, failure(crash), slot released by exit, respawn after exit', async () => {
  const h = makeSup({ computeMaxMs: 5000 });
  const failures = [];
  h.sup.on('failure', (f) => failures.push(f));
  const j1 = h.sup.enqueue({ direction: 'vi-en', segments: ['n=500 step=20 long'] });
  const j2 = h.sup.enqueue({ direction: 'vi-en', segments: ['next'] });
  await waitFor(() => h.ofType('started').length === 1);
  const pid = h.spawned[0];
  const tKill = Date.now();
  process.kill(pid, 'SIGKILL');
  const o1 = await j1.settled;
  const settleMs = Date.now() - tKill;
  assert.equal(o1.state, 'FAILED');
  assert.equal(o1.reason, 'CRASHED');
  assert.ok(settleMs < 500, `settled in ${settleMs} ms`);
  assert.deepEqual(failures.map((f) => f.kind), ['crash']);
  const exit = first(h, 'exit');
  const rel = first(h, 'release', (e) => e.jobId === j1.id);
  assert.equal(rel.by, 'exit');
  assert.ok(rel.t >= exit.t);
  assert.equal((await j2.settled).state, 'DONE');
  assert.ok(h.ofType('spawn')[1].t >= exit.t);
  await h.sup.shutdown();
});

test('worker process.exit(13) mid-run behaves like a crash', async () => {
  const h = makeSup({ computeMaxMs: 5000 });
  const o = await h.sup.enqueue({ direction: 'vi-en', segments: ['crash'] }).settled;
  assert.equal(o.reason, 'CRASHED');
  assert.equal(h.ofType('exit')[0].code, 13);
  await h.sup.shutdown();
});

test('a complete result that races with a cancel is still DONE (so it can be cached) and holds the slot until done', async () => {
  const h = makeSup({ computeMaxMs: 5000 });
  const j = h.sup.enqueue({ direction: 'vi-en', segments: ['n=6 step=20 ignoreCancel racing'] });
  await waitFor(() => h.ofType('started').length === 1);
  h.sup.cancel(j);
  const o = await j.settled;
  assert.equal(o.state, 'DONE');
  assert.equal(o.complete, true);
  assert.deepEqual(o.outputs, ['T:n=6 step=20 ignoreCancel racing']);
  await h.sup.shutdown();
});

test('worker error: job FAILED/ERROR with a mapped code, slot released by error, worker reused', async () => {
  const h = makeSup();
  const o = await h.sup.enqueue({ direction: 'vi-en', segments: ['error'] }).settled;
  assert.equal(o.state, 'FAILED');
  assert.equal(o.reason, 'ERROR');
  assert.equal(o.code, 'RUN_FAILED');
  assert.equal(first(h, 'release').by, 'error');
  const o2 = await h.sup.enqueue({ direction: 'vi-en', segments: ['ok'] }).settled;
  assert.equal(o2.state, 'DONE');
  assert.equal(h.ofType('spawn').length, 1);
  await h.sup.shutdown();
});

test('cancel during a (blocking) model load: slot held until loaded, run is never sent, worker stays loaded', async () => {
  const h = makeSup({ computeMaxMs: 5000, loadTimeoutMs: 5000 }, () => ({ FAKE_LOAD_MS: '300' }));
  const j1 = h.sup.enqueue({ direction: 'vi-en', segments: ['x'] });
  await sleep(60);
  h.sup.cancel(j1);
  const o1 = await j1.settled;
  assert.equal(o1.reason, 'CANCELLED');
  assert.equal(h.ofType('started').length, 0, 'run was never sent');
  assert.ok(first(h, 'loaded').t <= first(h, 'release').t, 'released only after the load finished');
  const o2 = await h.sup.enqueue({ direction: 'vi-en', segments: ['y'] }).settled;
  assert.equal(o2.state, 'DONE');
  assert.equal(h.ofType('loadStart').length, 1, 'model stayed loaded');
  await h.sup.shutdown();
});

test('kill timer is cleared on normal completion (no kill long after the job finished)', async () => {
  const h = makeSup({ killGraceMs: 100 });
  await warm(h);
  h.sup.computeMaxMs = 150;
  const o = await h.sup.enqueue({ direction: 'vi-en', segments: ['n=2 step=10 quick'] }).settled;
  assert.equal(o.state, 'DONE');
  await sleep(400);
  assert.equal(h.ofType('killSent').length, 0);
  assert.equal(h.sup.liveWorkers, 1);
  await h.sup.shutdown();
});

test('live workers never exceed concurrency under a mix of crash / kill / hang / cancel (events AND OS pids)', async () => {
  const h = makeSup({ concurrency: 2, computeMaxMs: 120, killGraceMs: 60 });
  const stop = sampleLive(h, 3);
  const specs = ['ok1', 'crash', 'hang', 'n=300 step=10 ignoreCancel ignoreDeadline stuck', 'ok2', 'n=200 step=10 slow', 'crash', 'ok3', 'hang', 'ok4'];
  const jobs = specs.map((s) => h.sup.enqueue({ direction: 'vi-en', segments: [s] }));
  setTimeout(() => h.sup.cancel(jobs[5]), 40);
  await Promise.all(jobs.map((j) => j.settled));
  await sleep(100);
  const maxOs = stop();
  let live = 0;
  let maxEv = 0;
  for (const e of h.events) {
    if (e.type === 'spawn') live++;
    if (e.type === 'exit') live--;
    maxEv = Math.max(maxEv, live);
  }
  assert.ok(maxEv <= 2, `event-derived max live ${maxEv}`);
  assert.ok(maxOs <= 2, `OS-sampled max live ${maxOs}`);
  assert.ok(h.ofType('spawn').length > 2, 'workers were respawned');
  // every spawn into a slot happened after the previous process of that slot exited
  const bySlot = new Map();
  for (const e of h.events) {
    if (e.type !== 'spawn' && e.type !== 'exit') continue;
    const l = bySlot.get(e.slot) ?? [];
    l.push(e.type);
    bySlot.set(e.slot, l);
  }
  for (const l of bySlot.values()) for (let i = 0; i < l.length; i++) assert.equal(l[i], i % 2 === 0 ? 'spawn' : 'exit');
  await h.sup.shutdown();
});

test('shutdown sequence: queued -> SHUTDOWN, running cancelled and awaited, then shutdown message, workers exit 0', async () => {
  const h = makeSup({ computeMaxMs: 5000, shutdownGraceMs: 2000 });
  const j1 = h.sup.enqueue({ direction: 'vi-en', segments: ['n=500 step=20 long'] });
  const j2 = h.sup.enqueue({ direction: 'vi-en', segments: ['queued'] });
  await waitFor(() => h.ofType('started').length === 1);
  const t0 = Date.now();
  await h.sup.shutdown();
  assert.ok(Date.now() - t0 < 1500);
  assert.equal((await j2.settled).reason, 'SHUTDOWN');
  assert.equal((await j1.settled).reason, 'CANCELLED');
  const order = h.events.map((e) => e.type).filter((t) => ['shutdownStart', 'cancelSent', 'done', 'shutdownSent', 'exit'].includes(t));
  assert.deepEqual(order, ['shutdownStart', 'cancelSent', 'done', 'shutdownSent', 'exit']);
  assert.equal(h.ofType('exit')[0].code, 0);
  assert.equal(h.ofType('killSent').length, 0);
  assert.equal(h.livePids().length, 0);
  const late = h.sup.enqueue({ direction: 'vi-en', segments: ['late'] });
  assert.equal((await late.settled).reason, 'SHUTDOWN');
  assert.equal(h.ofType('dispatch', (e) => e.jobId === late.id).length, 0);
});

test('shutdown with an unresponsive worker: SIGKILL when the grace expires, promise resolves after exit', async () => {
  const h = makeSup({ computeMaxMs: 60_000, killGraceMs: 60_000, shutdownGraceMs: 400 });
  const j = h.sup.enqueue({ direction: 'vi-en', segments: ['hang'] });
  await waitFor(() => h.ofType('started').length === 1);
  const t0 = Date.now();
  await h.sup.shutdown();
  const ms = Date.now() - t0;
  assert.ok(ms >= 380 && ms < 1500, `shutdown took ${ms}`);
  assert.equal((await j.settled).reason, 'KILLED');
  assert.equal(h.ofType('killSent')[0].reason, 'shutdown-grace');
  assert.equal(h.livePids().length, 0);
});

test('shutdown with idle workers sends shutdown immediately and they exit 0', async () => {
  const h = makeSup({ concurrency: 2 });
  await Promise.all([0, 1].map((i) => h.sup.enqueue({ direction: 'vi-en', segments: ['n=5 step=20 j' + i] }).settled));
  await h.sup.shutdown();
  assert.deepEqual(h.ofType('exit').map((e) => e.code), [0, 0]);
});

test('deadlineCancel:false: no cancel is sent at the compute deadline; the worker enforces it itself (worker-reported deadlineHit)', async () => {
  const h = makeSup({ killGraceMs: 400, deadlineCancel: false });
  await warm(h);
  h.sup.computeMaxMs = 150;
  const o = await h.sup.enqueue({ direction: 'vi-en', segments: ['n=1000 step=20 slow'] }).settled;
  assert.equal(o.reason, 'DEADLINE');
  assert.equal(o.deadlineHit, true);
  assert.equal(h.ofType('cancelSent').length, 0, 'the worker stopped on its own criterion');
  assert.equal(h.ofType('killSent').length, 0);
  await h.sup.shutdown();
});
