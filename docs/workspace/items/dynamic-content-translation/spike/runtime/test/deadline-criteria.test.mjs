import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDeadlineCriterion, computeMaxNewTokens } from '../deadline-criteria.mjs';

// Same shape as transformers.js `Callable` / `StoppingCriteria` (closure whose prototype is the subclass).
class Callable {
  constructor() {
    const closure = function (...args) {
      return closure._call(...args);
    };
    return Object.setPrototypeOf(closure, new.target.prototype);
  }
}
class StoppingCriteria extends Callable {}

const mk = (o = {}) => {
  const clock = { t: 1000 };
  const c = createDeadlineCriterion(StoppingCriteria, { computeDeadlineEpochMs: 2000, now: () => clock.t, ...o });
  return { c, clock };
};

test('is an instance of the supplied StoppingCriteria base and callable as a function', () => {
  const { c } = mk();
  assert.ok(c instanceof StoppingCriteria);
  assert.equal(typeof c, 'function');
  assert.deepEqual(c([[1, 2], [3, 4]]), [false, false]);
});

test('returns one boolean per sequence; counts calls (proves it was invoked)', () => {
  const { c } = mk();
  c([[1], [2], [3]]);
  const r = c([[1], [2], [3]]);
  assert.equal(r.length, 3);
  assert.ok(r.every((x) => typeof x === 'boolean'));
  assert.equal(c.calls, 2);
});

test('stops every sequence once the compute deadline passed; hit flag set; overrun recorded', () => {
  const { c, clock } = mk();
  assert.deepEqual(c([[1], [2]]), [false, false]);
  clock.t = 2007;
  assert.deepEqual(c([[1], [2]]), [true, true]);
  assert.equal(c.hit, true);
  assert.equal(c.cancelled, false);
  assert.equal(c.overrunMs, 7);
});

test('stops at deadline boundary (>=)', () => {
  const { c, clock } = mk();
  clock.t = 2000;
  assert.deepEqual(c([[1]]), [true]);
});

test('cancel flag stops generation and is reported separately from deadline hit', () => {
  let cancel = false;
  const { c } = mk({ isCancelled: () => cancel });
  assert.deepEqual(c([[1]]), [false]);
  cancel = true;
  assert.deepEqual(c([[1]]), [true]);
  assert.equal(c.cancelled, true);
  assert.equal(c.hit, false);
});

test('once stopped it stays stopped', () => {
  let cancel = true;
  const { c } = mk({ isCancelled: () => cancel });
  c([[1]]);
  cancel = false;
  assert.deepEqual(c([[1]]), [true]);
});

test('tracks the longest gap between consecutive calls (max decoder step as seen by the loop)', () => {
  const { c, clock } = mk();
  c([[1]]);
  clock.t += 12;
  c([[1]]);
  clock.t += 40;
  c([[1]]);
  clock.t += 5;
  c([[1]]);
  assert.equal(c.maxStepGapMs, 40);
});

test('computeMaxNewTokens = min(512, 2*inputTokens + 16)', () => {
  assert.equal(computeMaxNewTokens(0), 16);
  assert.equal(computeMaxNewTokens(10), 36);
  assert.equal(computeMaxNewTokens(247), 510);
  assert.equal(computeMaxNewTokens(248), 512);
  assert.equal(computeMaxNewTokens(10_000), 512);
});

test('records the time of the first invocation (encoder + first decoder step happen before it)', () => {
  const { c, clock } = mk();
  assert.equal(c.firstCallAt, null);
  clock.t = 1234;
  c([[1]]);
  clock.t = 1300;
  c([[1]]);
  assert.equal(c.firstCallAt, 1234);
});
