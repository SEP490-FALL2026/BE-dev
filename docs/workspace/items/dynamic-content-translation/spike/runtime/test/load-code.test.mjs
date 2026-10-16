// loadFailed carries a short machine code (e.g. MODEL_LOCK_MISMATCH); raw messages never travel.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeSup } from './helpers.mjs';
import { Coordinator } from '../coordinator.mjs';
import { TranslationCache } from '../cache.mjs';

test('permanent loadFailed code is surfaced in the outcome and the event; hostile codes are sanitised', async () => {
  const h = makeSup({}, () => ({ FAKE_LOAD_FAIL: 'permanent', FAKE_LOAD_CODE: 'MODEL_LOCK_MISMATCH' }));
  const o = await h.sup.enqueue({ direction: 'vi-en', segments: ['a'] }).settled;
  assert.equal(o.reason, 'LOAD_FAILED');
  assert.equal(o.permanent, true);
  assert.equal(o.code, 'MODEL_LOCK_MISMATCH');
  assert.equal(h.ofType('loadFailed')[0].code, 'MODEL_LOCK_MISMATCH');
  await h.sup.shutdown();
  const h2 = makeSup({}, () => ({ FAKE_LOAD_FAIL: 'permanent', FAKE_LOAD_CODE: 'secret text with spaces ../x' }));
  const o2 = await h2.sup.enqueue({ direction: 'vi-en', segments: ['a'] }).settled;
  assert.equal(o2.code, undefined, 'a code that is not [A-Z0-9_]{1,40} is dropped');
  await h2.sup.shutdown();
});

test('coordinator exposes the code in stats and trips the breaker to PERMANENT', async () => {
  const h = makeSup({}, () => ({ FAKE_LOAD_FAIL: 'permanent', FAKE_LOAD_CODE: 'MODEL_LOCK_MISMATCH' }));
  const coord = new Coordinator({ supervisor: h.sup, cache: new TranslationCache(), identity: { engineId: 'f', modelDigest: 'd', glossaryVersion: 'g', placeholderPolicyVersion: 'p' }, timeoutMs: 2000 });
  const r = await coord.translate({ organizationId: 'o', scope: 's', storedSource: 'vi', target: 'en', text: 'x' });
  assert.equal(r.status, 'UNAVAILABLE');
  assert.equal(r.stats.code, 'MODEL_LOCK_MISMATCH');
  assert.equal(coord.snapshot().breakers['vi-en'].state, 'PERMANENT');
  await coord.shutdown();
});
