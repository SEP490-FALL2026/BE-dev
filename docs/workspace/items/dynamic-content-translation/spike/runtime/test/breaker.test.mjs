import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CircuitBreaker } from '../breaker.mjs';

const mk = (o = {}) => {
  const clock = { t: 0 };
  const b = new CircuitBreaker({ now: () => clock.t, ...o });
  return { b, clock };
};

test('closed by default and admits everything', () => {
  const { b } = mk();
  assert.equal(b.state, 'CLOSED');
  assert.equal(b.tryAcquire().ok, true);
});

test('2 failures do not open; 3 failures within 5 min open', () => {
  const { b, clock } = mk();
  b.recordFailure('deadline');
  clock.t += 1000;
  b.recordFailure('kill');
  assert.equal(b.state, 'CLOSED');
  clock.t += 1000;
  b.recordFailure('crash');
  assert.equal(b.state, 'OPEN');
  assert.equal(b.tryAcquire().ok, false);
  assert.equal(b.tryAcquire().reason, 'OPEN');
});

test('failures older than the 5 min window do not count', () => {
  const { b, clock } = mk();
  b.recordFailure('deadline');
  b.recordFailure('deadline');
  clock.t += 5 * 60_000 + 1;
  b.recordFailure('deadline');
  assert.equal(b.state, 'CLOSED');
});

test('after the 30 s cooldown exactly one probe is admitted (HALF_OPEN)', () => {
  const { b, clock } = mk();
  for (let i = 0; i < 3; i++) b.recordFailure('crash');
  clock.t += 29_999;
  assert.equal(b.tryAcquire().ok, false);
  clock.t += 1;
  const p1 = b.tryAcquire();
  assert.equal(p1.ok, true);
  assert.equal(p1.probe, true);
  assert.equal(b.state, 'HALF_OPEN');
  assert.equal(b.tryAcquire().ok, false, 'second concurrent probe refused');
  assert.equal(b.tryAcquire().reason, 'HALF_OPEN_PROBE_IN_FLIGHT');
});

test('probe success closes the circuit and resets cooldown', () => {
  const { b, clock } = mk();
  for (let i = 0; i < 3; i++) b.recordFailure('crash');
  clock.t += 30_000;
  b.tryAcquire();
  b.recordSuccess({ probe: true });
  assert.equal(b.state, 'CLOSED');
  assert.equal(b.tryAcquire().ok, true);
  assert.equal(b.cooldownMs, 30_000);
  // needs 3 fresh failures again
  b.recordFailure('crash');
  b.recordFailure('crash');
  assert.equal(b.state, 'CLOSED');
});

test('probe failure re-opens with doubled cooldown, capped at 5 min', () => {
  const { b, clock } = mk();
  for (let i = 0; i < 3; i++) b.recordFailure('crash');
  const seen = [];
  for (let i = 0; i < 6; i++) {
    seen.push(b.cooldownMs);
    clock.t += b.cooldownMs;
    assert.equal(b.tryAcquire().probe, true);
    b.recordFailure('deadline', { probe: true });
    assert.equal(b.state, 'OPEN');
  }
  assert.deepEqual(seen, [30_000, 60_000, 120_000, 240_000, 300_000, 300_000]);
});

test('probe released without outcome (e.g. cache hit / abandoned) frees the probe slot', () => {
  const { b, clock } = mk();
  for (let i = 0; i < 3; i++) b.recordFailure('crash');
  clock.t += 30_000;
  assert.equal(b.tryAcquire().probe, true);
  b.releaseProbe();
  assert.equal(b.tryAcquire().probe, true);
});

test('permanent failure: UNAVAILABLE forever, never half-opens', () => {
  const { b, clock } = mk();
  b.permanent('integrity');
  assert.equal(b.state, 'PERMANENT');
  clock.t += 24 * 3600_000;
  assert.equal(b.tryAcquire().ok, false);
  assert.equal(b.tryAcquire().reason, 'PERMANENT');
});

test('late failures while OPEN do not extend or change the cooldown', () => {
  const { b, clock } = mk();
  for (let i = 0; i < 3; i++) b.recordFailure('crash');
  clock.t += 10_000;
  b.recordFailure('kill');
  clock.t += 20_000;
  assert.equal(b.tryAcquire().probe, true, 'cooldown still measured from the original open');
});
