// V-3: spawn failures and ChildProcess 'error' events (Node docs: 'exit' may or may not fire after 'error').
// Rule under test (supervisor.mjs header): "no child created" (sync throw, or 'error' with pid undefined before 'spawn')
// releases the slot at once; "child alive" errors never release a live process: kill by own handle, wait for 'exit',
// and only after a bound mark the slot dead from the child's own fields (exitCode/signalCode !== null).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FakeChild, wellBehaved, makeFakeSup } from './fake-child.mjs';
import { sleep, waitFor } from './helpers.mjs';
import { analyzeEvents } from '../bench/analyze.mjs';

const ok = () => wellBehaved(new FakeChild());
const withTimeout = (p, ms, what) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('never settled: ' + what)), ms))]);

test('V-3 sync throw from spawnFn: job settles FAILED/SPAWN_FAILED once, slot released, failure counted, queue proceeds, shutdown completes', async () => {
  const h = makeFakeSup((i) => {
    if (i === 0) throw new Error('EAGAIN fork');
    return ok();
  });
  const failures = [];
  h.sup.on('failure', (f) => failures.push(f));
  const j1 = h.sup.enqueue({ direction: 'vi-en', segments: ['a'] });
  const j2 = h.sup.enqueue({ direction: 'vi-en', segments: ['b'] });
  const o1 = await withTimeout(j1.settled, 1000, 'job1');
  assert.equal(o1.state, 'FAILED');
  assert.equal(o1.reason, 'SPAWN_FAILED');
  assert.equal(o1.complete, false);
  assert.ok(!JSON.stringify(o1).includes('EAGAIN'), 'raw error text never leaks into the outcome');
  assert.deepEqual(failures.map((f) => f.kind), ['spawnFailed']);
  const o2 = await withTimeout(j2.settled, 2000, 'job2 (queue proceeds)');
  assert.equal(o2.state, 'DONE');
  assert.equal(h.ofType('settled', (e) => e.jobId === j1.id).length, 1, 'settled exactly once');
  assert.equal(h.ofType('release', (e) => e.jobId === j1.id).length, 1);
  await withTimeout(h.sup.shutdown(), 2000, 'shutdown');
  assert.equal(h.sup.liveWorkers, 0);
});

test('V-3 sync throw while others are queued: every queued job settles, none hangs, liveWorkers stays 0', async () => {
  const h = makeFakeSup(() => {
    throw new Error('ENOMEM');
  });
  const jobs = [0, 1, 2, 3].map(() => h.sup.enqueue({ direction: 'vi-en', segments: ['x'] }));
  const outs = await withTimeout(Promise.all(jobs.map((j) => j.settled)), 2000, 'all jobs');
  assert.ok(outs.every((o) => o.reason === 'SPAWN_FAILED'));
  assert.equal(h.sup.liveWorkers, 0);
  assert.equal(h.sup.queuedCount, 0);
  await withTimeout(h.sup.shutdown(), 1000, 'shutdown');
});

test('V-3 async spawn failure: error with no pid and NO exit event ever -> slot released, job SPAWN_FAILED, next job proceeds', async () => {
  const h = makeFakeSup((i) => {
    if (i === 0) {
      const c = new FakeChild({ noPid: true });
      setImmediate(() => c.emit('error', Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' })));
      return c;
    }
    return ok();
  });
  const failures = [];
  h.sup.on('failure', (f) => failures.push(f));
  const j1 = h.sup.enqueue({ direction: 'vi-en', segments: ['a'] });
  const j2 = h.sup.enqueue({ direction: 'vi-en', segments: ['b'] });
  const o1 = await withTimeout(j1.settled, 1000, 'job1');
  assert.equal(o1.reason, 'SPAWN_FAILED');
  assert.equal(h.sup.liveWorkers === 0 || h.sup.liveWorkers === 1, true);
  assert.deepEqual(failures.map((f) => f.kind), ['spawnFailed']);
  const o2 = await withTimeout(j2.settled, 2000, 'job2');
  assert.equal(o2.state, 'DONE');
  assert.equal(h.ofType('settled', (e) => e.jobId === j1.id).length, 1);
  await withTimeout(h.sup.shutdown(), 2000, 'shutdown');
  assert.equal(h.sup.liveWorkers, 0);
});

test('V-3 async spawn failure: shutdown() completes while the failed child never exits', async () => {
  const h = makeFakeSup(() => {
    const c = new FakeChild({ noPid: true });
    setImmediate(() => c.emit('error', new Error('spawn EACCES')));
    return c;
  });
  const j = h.sup.enqueue({ direction: 'vi-en', segments: ['a'] });
  await withTimeout(j.settled, 1000, 'job');
  await withTimeout(h.sup.shutdown(), 1000, 'shutdown');
  assert.equal(h.sup.liveWorkers, 0);
});

test('V-3 pre-spawn error followed by a late exit: settled once, late exit ignored, no double release', async () => {
  const h = makeFakeSup((i) => {
    if (i === 0) {
      const c = new FakeChild({ noPid: true });
      setImmediate(() => {
        c.emit('error', new Error('spawn ENOENT'));
        setImmediate(() => c.emit('exit', -2, null));
      });
      return c;
    }
    return ok();
  });
  const j1 = h.sup.enqueue({ direction: 'vi-en', segments: ['a'] });
  const o1 = await withTimeout(j1.settled, 1000, 'job1');
  assert.equal(o1.reason, 'SPAWN_FAILED');
  const j2 = h.sup.enqueue({ direction: 'vi-en', segments: ['b'] });
  assert.equal((await withTimeout(j2.settled, 2000, 'job2')).state, 'DONE');
  await sleep(50);
  assert.equal(h.ofType('settled', (e) => e.jobId === j1.id).length, 1);
  assert.equal(h.ofType('release', (e) => e.jobId === j1.id).length, 1);
  assert.equal(h.ofType('exit').length, 0, 'the exit of a child that never existed is not a worker exit');
  await h.sup.shutdown();
});

test('V-3 error on a LIVE child (IPC error): slot NOT released at error; killed by its own handle; released by exit; respawn only after exit', async () => {
  let first;
  const h = makeFakeSup((i) => {
    const c = new FakeChild();
    if (i === 0) {
      first = c;
      c.onSend = (msg) => {
        if (msg.type === 'load') setImmediate(() => c.reply({ type: 'loaded', direction: msg.direction, ms: 1 }));
        // never answers run: the IPC channel is broken
      };
      c.exitOnKill = false; // exit arrives later, driven by the test
      return c;
    }
    return wellBehaved(c);
  });
  const failures = [];
  h.sup.on('failure', (f) => failures.push(f));
  const j1 = h.sup.enqueue({ direction: 'vi-en', segments: ['a'] });
  const j2 = h.sup.enqueue({ direction: 'vi-en', segments: ['b'] });
  await waitFor(() => first?.sent.some((m) => m.type === 'run'), 1000, 'run sent');
  first.emit('error', new Error('channel closed'));
  assert.equal(h.sup.liveWorkers, 1, 'live process keeps its slot');
  assert.deepEqual(first.killCalls, ['SIGKILL'], 'killed through the supervisor-owned handle');
  assert.equal(h.ofType('release').length, 0, 'not released on error');
  assert.equal(j1.settledFlag, false);
  assert.equal(h.children.length, 1, 'no respawn before exit');
  await sleep(40);
  assert.equal(h.children.length, 1);
  first.die(null, 'SIGKILL');
  const o1 = await withTimeout(j1.settled, 1000, 'job1');
  assert.equal(o1.state, 'FAILED');
  assert.equal(o1.reason, 'CHILD_ERROR');
  assert.deepEqual(failures.map((f) => f.kind), ['crash']);
  const o2 = await withTimeout(j2.settled, 2000, 'job2');
  assert.equal(o2.state, 'DONE');
  assert.ok(h.ofType('spawn')[1].t >= h.ofType('exit')[0].t, 'respawn after exit');
  assert.equal(h.ofType('settled', (e) => e.jobId === j1.id).length, 1);
  assert.ok(h.maxAlive <= 1);
  await h.sup.shutdown();
});

test('V-3 error on a live child, kill() throws, no exit event, fields still say running -> slot stays held (never releases a live process)', async () => {
  let first;
  const h = makeFakeSup((i) => {
    const c = new FakeChild();
    if (i === 0) {
      first = c;
      c.killThrows = true;
      c.onSend = (msg) => {
        if (msg.type === 'load') setImmediate(() => c.reply({ type: 'loaded', direction: msg.direction, ms: 1 }));
      };
      return c;
    }
    return wellBehaved(c);
  });
  const j1 = h.sup.enqueue({ direction: 'vi-en', segments: ['a'] });
  const j2 = h.sup.enqueue({ direction: 'vi-en', segments: ['b'] });
  await waitFor(() => first?.sent.some((m) => m.type === 'run'), 1000, 'run sent');
  first.emit('error', new Error('boom'));
  await sleep(450); // three exit-wait bounds (150 ms each)
  assert.equal(h.sup.liveWorkers, 1);
  assert.equal(j1.settledFlag, false, 'job stays unsettled while the process may still run');
  assert.equal(h.children.length, 1, 'no second process while the first may be alive');
  assert.ok(first.killCalls.length >= 2, 'kill is retried at every bound: ' + first.killCalls.length);
  assert.ok(h.ofType('exitWaitExpired').length >= 1);
  // now the process really is dead per its own fields, but Node never emitted 'exit'
  first.killThrows = false;
  first.dieSilently(null, 'SIGKILL');
  const o1 = await withTimeout(j1.settled, 1000, 'job1 after fields show dead');
  assert.equal(o1.reason, 'CHILD_ERROR');
  assert.equal(h.ofType('exit').at(-1).synthetic, true, 'the exit is marked synthetic in the event log');
  assert.equal((await withTimeout(j2.settled, 2000, 'job2')).state, 'DONE');
  await h.sup.shutdown();
});

test('V-3 kill() returning false with exitCode set and no exit event: slot marked dead at the bound (exitCode !== null)', async () => {
  let first;
  const h = makeFakeSup((i) => {
    const c = new FakeChild();
    if (i === 0) {
      first = c;
      c.killReturnsFalse = true;
      c.onSend = (msg) => {
        if (msg.type === 'load') setImmediate(() => c.reply({ type: 'loaded', direction: msg.direction, ms: 1 }));
      };
      return c;
    }
    return wellBehaved(c);
  });
  const j1 = h.sup.enqueue({ direction: 'vi-en', segments: ['a'] });
  await waitFor(() => first?.sent.some((m) => m.type === 'run'), 1000, 'run sent');
  first.emit('error', new Error('boom'));
  first.dieSilently(1, null);
  const o1 = await withTimeout(j1.settled, 1000, 'job1');
  assert.equal(o1.reason, 'CHILD_ERROR');
  assert.equal(h.sup.liveWorkers, 0);
  const j2 = h.sup.enqueue({ direction: 'vi-en', segments: ['b'] });
  assert.equal((await withTimeout(j2.settled, 2000, 'job2')).state, 'DONE');
  await h.sup.shutdown();
});

test('V-3 a kill() that throws on the kill-timer path (unresponsive worker) does not wedge the supervisor', async () => {
  let first;
  const h = makeFakeSup(
    (i) => {
      const c = new FakeChild();
      if (i === 0) {
        first = c;
        c.killThrows = true;
        c.onSend = (msg) => {
          if (msg.type === 'load') setImmediate(() => c.reply({ type: 'loaded', direction: msg.direction, ms: 1 }));
        };
        return c;
      }
      return wellBehaved(c);
    },
    { computeMaxMs: 80, killGraceMs: 60 },
  );
  const j1 = h.sup.enqueue({ direction: 'vi-en', segments: ['a'] });
  const j2 = h.sup.enqueue({ direction: 'vi-en', segments: ['b'] });
  await waitFor(() => first.killCalls.length >= 1, 2000, 'kill attempted');
  await sleep(100);
  assert.equal(h.sup.liveWorkers, 1, 'process still alive: slot held');
  first.killThrows = false;
  first.die(null, 'SIGKILL');
  assert.equal((await withTimeout(j1.settled, 1000, 'job1')).reason, 'KILLED');
  assert.equal((await withTimeout(j2.settled, 2000, 'job2')).state, 'DONE');
  await h.sup.shutdown();
});

test('V-3 live workers never exceed concurrency under mixed spawn failures, errors and exits (concurrency 2)', async () => {
  const kinds = ['throw', 'ok', 'noPid', 'ok', 'liveError', 'ok', 'throw', 'ok', 'ok', 'noPid', 'ok', 'ok'];
  const h = makeFakeSup(
    (i) => {
      const k = kinds[i % kinds.length];
      if (k === 'throw') throw new Error('EAGAIN');
      if (k === 'noPid') {
        const c = new FakeChild({ noPid: true });
        setImmediate(() => c.emit('error', new Error('ENOENT')));
        return c;
      }
      if (k === 'liveError') {
        const c = new FakeChild();
        c.onSend = (msg) => {
          if (msg.type === 'load') setImmediate(() => c.reply({ type: 'loaded', direction: msg.direction, ms: 1 }));
          if (msg.type === 'run') setImmediate(() => c.emit('error', new Error('ipc')));
        };
        return c;
      }
      return wellBehaved(new FakeChild());
    },
    { concurrency: 2 },
  );
  const jobs = Array.from({ length: 14 }, (_, i) => h.sup.enqueue({ direction: 'vi-en', segments: ['j' + i] }));
  const outs = await withTimeout(Promise.all(jobs.map((j) => j.settled)), 8000, 'all jobs settle');
  assert.equal(outs.length, 14);
  assert.ok(h.maxAlive <= 2, 'max simultaneously alive fake processes ' + h.maxAlive);
  let live = 0;
  let maxEv = 0;
  for (const e of h.events) {
    if (e.type === 'spawn') live++;
    if (e.type === 'exit' || (e.type === 'spawnFailed' && e.phase === 'async')) live--;
    maxEv = Math.max(maxEv, live);
  }
  assert.ok(maxEv <= 2, 'event-derived max live ' + maxEv);
  assert.deepEqual(analyzeEvents(h.events, 2).violations, [], 'offline event-log checker agrees');
  assert.ok(outs.some((o) => o.reason === 'SPAWN_FAILED'));
  assert.ok(outs.some((o) => o.state === 'DONE'));
  for (const j of jobs) assert.equal(h.ofType('settled', (e) => e.jobId === j.id).length, 1);
  await withTimeout(h.sup.shutdown(), 3000, 'shutdown');
  assert.equal(h.sup.liveWorkers, 0);
});

test('V-3 shutdown while a live child has an IPC error: completes after the exit', async () => {
  let first;
  const h = makeFakeSup((i) => {
    const c = new FakeChild();
    first = c;
    c.onSend = (msg) => {
      if (msg.type === 'load') setImmediate(() => c.reply({ type: 'loaded', direction: msg.direction, ms: 1 }));
    };
    return c;
  });
  const j = h.sup.enqueue({ direction: 'vi-en', segments: ['a'] });
  await waitFor(() => first?.sent.some((m) => m.type === 'run'), 1000, 'run sent');
  first.emit('error', new Error('ipc'));
  await withTimeout(h.sup.shutdown(), 2000, 'shutdown');
  assert.equal(h.sup.liveWorkers, 0);
  assert.ok(j.settledFlag);
});
