import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeSup, sampleLive, sleep, waitFor, pidAlive } from './helpers.mjs';

test('cold start: spawn -> load -> run -> done; outcome DONE with outputs; worker is reused', async () => {
  const h = makeSup();
  const j1 = h.sup.enqueue({ direction: 'vi-en', segments: ['a', 'b'] });
  const o1 = await j1.settled;
  assert.equal(o1.state, 'DONE');
  assert.equal(o1.complete, true);
  assert.deepEqual(o1.outputs, ['T:a', 'T:b']);
  assert.equal(h.sup.modelState(0, 'vi-en'), 'READY');
  const j2 = h.sup.enqueue({ direction: 'vi-en', segments: ['c'] });
  const o2 = await j2.settled;
  assert.equal(o2.state, 'DONE');
  assert.equal(h.ofType('spawn').length, 1, 'second job reuses the loaded worker');
  assert.equal(h.ofType('loadStart').length, 1);
  await h.sup.shutdown();
});

test('a second direction triggers a second load in the same worker', async () => {
  const h = makeSup();
  await h.sup.enqueue({ direction: 'vi-en', segments: ['a'] }).settled;
  await h.sup.enqueue({ direction: 'en-vi', segments: ['a'] }).settled;
  assert.equal(h.ofType('spawn').length, 1);
  assert.equal(h.ofType('loadStart').length, 2);
  assert.equal(h.sup.modelState(0, 'en-vi'), 'READY');
  await h.sup.shutdown();
});

test('concurrency 1: jobs run strictly one after another (no overlapping run intervals)', async () => {
  const h = makeSup({ computeMaxMs: 5000 });
  const jobs = [0, 1, 2, 3].map((i) => h.sup.enqueue({ direction: 'vi-en', segments: ['n=4 step=25 job' + i] }));
  assert.equal(h.sup.queuedCount, 3, 'one dispatched, three waiting');
  const outs = await Promise.all(jobs.map((j) => j.settled));
  assert.ok(outs.every((o) => o.state === 'DONE'));
  const starts = h.ofType('started');
  const dones = h.ofType('done');
  assert.equal(starts.length, 4);
  for (let i = 1; i < 4; i++) assert.ok(starts[i].t >= dones[i - 1].t, `job ${i} started before job ${i - 1} done`);
  assert.equal(h.ofType('spawn').length, 1);
  await h.sup.shutdown();
});

test('concurrency 2: two jobs overlap, never more than 2 live processes, a third waits', async () => {
  const h = makeSup({ concurrency: 2, computeMaxMs: 5000 });
  const stop = sampleLive(h);
  const jobs = [0, 1, 2].map((i) => h.sup.enqueue({ direction: 'vi-en', segments: ['n=8 step=25 j' + i] }));
  assert.equal(h.sup.queuedCount, 1);
  await Promise.all(jobs.map((j) => j.settled));
  const max = stop();
  assert.equal(max, 2);
  assert.equal(h.ofType('spawn').length, 2);
  await h.sup.shutdown();
});

test('removeQueued: QUEUED job becomes ABANDONED and is never dispatched', async () => {
  const h = makeSup({ computeMaxMs: 5000 });
  const j1 = h.sup.enqueue({ direction: 'vi-en', segments: ['n=6 step=30 first'] });
  const j2 = h.sup.enqueue({ direction: 'vi-en', segments: ['second'] });
  assert.equal(j2.state, 'QUEUED');
  assert.equal(h.sup.removeQueued(j2), true);
  assert.equal(j2.state, 'ABANDONED');
  assert.equal((await j2.settled).reason, 'REMOVED_QUEUED');
  assert.equal(h.sup.removeQueued(j1), false, 'running job cannot be removed');
  await j1.settled;
  await sleep(50);
  assert.equal(h.ofType('dispatch', (e) => e.jobId === j2.id).length, 0);
  assert.equal(h.sup.queuedCount, 0);
  await h.sup.shutdown();
});

test('permanent load failure: job FAILED, direction PERMANENT, later jobs fail fast without spawning', async () => {
  const h = makeSup({}, () => ({ FAKE_LOAD_FAIL: 'permanent' }));
  const failures = [];
  h.sup.on('failure', (f) => failures.push(f));
  const o = await h.sup.enqueue({ direction: 'vi-en', segments: ['a'] }).settled;
  assert.equal(o.state, 'FAILED');
  assert.equal(o.reason, 'LOAD_FAILED');
  assert.equal(o.permanent, true);
  assert.equal(h.sup.directionState('vi-en').permanent, true);
  const spawnsBefore = h.ofType('spawn').length;
  const o2 = await h.sup.enqueue({ direction: 'vi-en', segments: ['a'] }).settled;
  assert.equal(o2.state, 'FAILED');
  assert.equal(o2.reason, 'DIRECTION_PERMANENT');
  assert.equal(h.ofType('spawn').length, spawnsBefore);
  assert.ok(failures.some((f) => f.kind === 'permanent' && f.direction === 'vi-en'));
  await h.sup.shutdown();
});

test('transient load failure: backoff blocks retries, then a retry can succeed; backoff doubles', async () => {
  const h = makeSup({}, (i) => (i === 0 ? { FAKE_LOAD_FAIL: 'transient', FAKE_LOAD_FAIL_TIMES: '1' } : {}));
  const failures = [];
  h.sup.on('failure', (f) => failures.push(f));
  const o = await h.sup.enqueue({ direction: 'vi-en', segments: ['a'] }).settled;
  assert.equal(o.reason, 'LOAD_FAILED');
  assert.equal(o.permanent, false);
  const ds = h.sup.directionState('vi-en');
  assert.equal(ds.state, 'FAILED');
  assert.equal(ds.backoffMs, 100);
  assert.ok(failures.some((f) => f.kind === 'loadTransient'));
  const o2 = await h.sup.enqueue({ direction: 'vi-en', segments: ['a'] }).settled;
  assert.equal(o2.reason, 'LOAD_BACKOFF', 'inside the backoff window no load is attempted');
  await sleep(120);
  const o3 = await h.sup.enqueue({ direction: 'vi-en', segments: ['a'] }).settled;
  assert.equal(o3.state, 'DONE');
  assert.equal(h.sup.directionState('vi-en').state, 'READY');
  assert.equal(h.sup.directionState('vi-en').backoffMs, 0);
  await h.sup.shutdown();
});

test('backoff doubles 1s -> 60s (scaled) on repeated transient failures', async () => {
  const h = makeSup({ loadBackoffMinMs: 20, loadBackoffMaxMs: 80 }, () => ({ FAKE_LOAD_FAIL: 'transient' }));
  const seen = [];
  for (let i = 0; i < 5; i++) {
    await h.sup.enqueue({ direction: 'vi-en', segments: ['a'] }).settled;
    seen.push(h.sup.directionState('vi-en').backoffMs);
    await sleep(90);
  }
  assert.deepEqual(seen, [20, 40, 80, 80, 80]);
  await h.sup.shutdown();
});

test('loadTimeoutMs kills a stuck loader; slot freed only after exit; respawn serves the next job', async () => {
  // loadTimeoutMs also covers node process boot (the load request is queued on IPC), so it must exceed a cold start under CI load
  const h = makeSup({ loadTimeoutMs: 800, computeMaxMs: 5000, loadBackoffMinMs: 1500, loadBackoffMaxMs: 3000 }, (i) =>
    i === 0 ? { FAKE_LOAD_HANG: '1' } : {},
  );
  const j1 = h.sup.enqueue({ direction: 'vi-en', segments: ['a'] });
  const o1 = await j1.settled;
  assert.equal(o1.state, 'FAILED');
  assert.equal(o1.reason, 'LOAD_TIMEOUT');
  const kill = h.ofType('killSent')[0];
  const exit = h.ofType('exit')[0];
  assert.equal(kill.reason, 'load-timeout');
  assert.ok(exit.t >= kill.t);
  assert.equal(pidAlive(exit.pid), false);
  const o2 = await h.sup.enqueue({ direction: 'vi-en', segments: ['a'] }).settled;
  assert.equal(o2.reason, 'LOAD_BACKOFF', 'a load timeout is a transient load failure with backoff');
  await sleep(1500);
  const o3 = await h.sup.enqueue({ direction: 'vi-en', segments: ['a'] }).settled;
  assert.equal(o3.state, 'DONE');
  const spawns = h.ofType('spawn');
  assert.equal(spawns.length, 2);
  assert.ok(spawns[1].t >= exit.t, 'respawn after exit');
  await h.sup.shutdown();
});

test('unload: READY -> DISPOSING -> UNLOADED, then a new job reloads', async () => {
  const h = makeSup();
  await h.sup.enqueue({ direction: 'vi-en', segments: ['a'] }).settled;
  const p = h.sup.unload('vi-en');
  assert.equal(h.sup.modelState(0, 'vi-en'), 'DISPOSING');
  await p;
  assert.equal(h.sup.modelState(0, 'vi-en'), 'UNLOADED');
  await h.sup.enqueue({ direction: 'vi-en', segments: ['a'] }).settled;
  assert.equal(h.ofType('loadStart').length, 2);
  assert.equal(h.ofType('spawn').length, 1);
  await h.sup.shutdown();
});

test('worker stderr/stdout are drained and never echoed in outcomes', async () => {
  const h = makeSup();
  const o = await h.sup.enqueue({ direction: 'vi-en', segments: ['secret text'] }).settled;
  assert.ok(!JSON.stringify({ ...o, outputs: undefined }).includes('secret'));
  await h.sup.shutdown();
});

test('outcome never settles twice and settled resolves exactly once', async () => {
  const h = makeSup();
  const j = h.sup.enqueue({ direction: 'vi-en', segments: ['a'] });
  let n = 0;
  j.settled.then(() => n++);
  await j.settled;
  await sleep(30);
  assert.equal(n, 1);
  assert.equal(h.ofType('settled', (e) => e.jobId === j.id).length, 1);
  await h.sup.shutdown();
  await waitFor(() => true);
});
