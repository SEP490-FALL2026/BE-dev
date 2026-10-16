import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeEvents } from '../bench/analyze.mjs';

let t = 0;
const ev = (type, o = {}) => ({ t: (t += 1), type, ...o });

test('a clean single-slot history has no violations', () => {
  t = 0;
  const events = [
    ev('spawn', { slot: 0, pid: 10 }),
    ev('dispatch', { slot: 0, jobId: 1 }),
    ev('started', { slot: 0, jobId: 1 }),
    ev('done', { slot: 0, jobId: 1 }),
    ev('release', { slot: 0, jobId: 1, by: 'done' }),
    ev('dispatch', { slot: 0, jobId: 2 }),
    ev('killSent', { slot: 0, pid: 10 }),
    ev('exit', { slot: 0, pid: 10, code: null, signal: 'SIGKILL' }),
    ev('release', { slot: 0, jobId: 2, by: 'exit' }),
    ev('spawn', { slot: 0, pid: 11 }),
    ev('dispatch', { slot: 0, jobId: 3 }),
  ];
  const r = analyzeEvents(events, 1);
  assert.deepEqual(r.violations, []);
  assert.equal(r.maxLive, 1);
  assert.equal(r.dispatches, 3);
  assert.equal(r.releasesByExit, 1);
});

test('dispatch into a busy slot is a violation', () => {
  t = 0;
  const r = analyzeEvents([ev('spawn', { slot: 0, pid: 1 }), ev('dispatch', { slot: 0, jobId: 1 }), ev('dispatch', { slot: 0, jobId: 2 })], 1);
  assert.ok(r.violations.some((v) => /dispatch.*busy/.test(v)));
});

test('release by exit without a preceding exit event is a violation', () => {
  t = 0;
  const r = analyzeEvents([ev('spawn', { slot: 0, pid: 1 }), ev('dispatch', { slot: 0, jobId: 1 }), ev('release', { slot: 0, jobId: 1, by: 'exit' })], 1);
  assert.ok(r.violations.some((v) => /release by exit/.test(v)));
});

test('spawn before the previous process of the slot exited is a violation; live > concurrency too', () => {
  t = 0;
  const r = analyzeEvents([ev('spawn', { slot: 0, pid: 1 }), ev('spawn', { slot: 0, pid: 2 })], 1);
  assert.ok(r.violations.some((v) => /spawn.*not exited/.test(v)));
  assert.ok(r.violations.some((v) => /live workers/.test(v)));
  assert.equal(r.maxLive, 2);
});

test('killSent must be followed by exit before the slot is reused', () => {
  t = 0;
  const r = analyzeEvents([ev('spawn', { slot: 0, pid: 1 }), ev('dispatch', { slot: 0, jobId: 1 }), ev('killSent', { slot: 0, pid: 1 }), ev('release', { slot: 0, jobId: 1, by: 'done' })], 1);
  assert.ok(r.violations.length > 0);
});

test('run intervals (started..done) of different jobs never overlap per slot; concurrent slots may overlap', () => {
  t = 0;
  const ok = analyzeEvents(
    [
      ev('spawn', { slot: 0, pid: 1 }),
      ev('spawn', { slot: 1, pid: 2 }),
      ev('dispatch', { slot: 0, jobId: 1 }),
      ev('dispatch', { slot: 1, jobId: 2 }),
      ev('started', { slot: 0, jobId: 1 }),
      ev('started', { slot: 1, jobId: 2 }),
      ev('done', { slot: 0, jobId: 1 }),
      ev('release', { slot: 0, jobId: 1, by: 'done' }),
      ev('done', { slot: 1, jobId: 2 }),
      ev('release', { slot: 1, jobId: 2, by: 'done' }),
    ],
    2,
  );
  assert.deepEqual(ok.violations, []);
  assert.equal(ok.maxConcurrentRuns, 2);
  t = 0;
  const bad = analyzeEvents([ev('spawn', { slot: 0, pid: 1 }), ev('started', { slot: 0, jobId: 1 }), ev('started', { slot: 0, jobId: 2 })], 1);
  assert.ok(bad.violations.some((v) => /overlap/.test(v)));
});

test('async spawn failure (no process ever existed) closes the slot like an exit; sync failure never opened it', () => {
  t = 0;
  const events = [
    ev('dispatch', { slot: 0, jobId: 1 }),
    ev('spawnFailed', { slot: 0, phase: 'sync' }),
    ev('release', { slot: 0, jobId: 1, by: 'spawn-failed' }),
    ev('spawn', { slot: 0, pid: undefined }),
    ev('dispatch', { slot: 0, jobId: 2 }),
    ev('spawnFailed', { slot: 0, phase: 'async' }),
    ev('release', { slot: 0, jobId: 2, by: 'spawn-failed' }),
    ev('spawn', { slot: 0, pid: 5 }),
    ev('dispatch', { slot: 0, jobId: 3 }),
  ];
  const r = analyzeEvents(events, 1);
  assert.deepEqual(r.violations, []);
  assert.equal(r.maxLive, 1);
});

test('a synthetic exit (lost exit event, child fields show dead) is a normal exit for the checker', () => {
  t = 0;
  const events = [
    ev('spawn', { slot: 0, pid: 10 }),
    ev('dispatch', { slot: 0, jobId: 1 }),
    ev('killSent', { slot: 0, pid: 10 }),
    ev('exit', { slot: 0, pid: 10, code: null, signal: 'SIGKILL', synthetic: true }),
    ev('release', { slot: 0, jobId: 1, by: 'exit' }),
    ev('spawn', { slot: 0, pid: 11 }),
  ];
  assert.deepEqual(analyzeEvents(events, 1).violations, []);
});
