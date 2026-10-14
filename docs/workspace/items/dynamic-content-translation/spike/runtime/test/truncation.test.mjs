// Truncation (output hit max_new_tokens without EOS) at supervisor and coordinator level, with the fake worker.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeSup, warm } from './helpers.mjs';
import { Coordinator } from '../coordinator.mjs';
import { TranslationCache } from '../cache.mjs';

const identity = { engineId: 'fake@1', modelDigest: 'd1', glossaryVersion: 'g1', placeholderPolicyVersion: 'p1' };

test('supervisor: worker done{complete:false, reason:TRUNCATED} -> FAILED/TRUNCATED, no outputs, NOT a breaker failure', async () => {
  const h = makeSup();
  await warm(h);
  const failures = [];
  h.sup.on('failure', (f) => failures.push(f));
  const o = await h.sup.enqueue({ direction: 'vi-en', segments: ['truncated n=2 step=5 x'] }).settled;
  assert.equal(o.state, 'FAILED');
  assert.equal(o.reason, 'TRUNCATED');
  assert.equal(o.complete, false);
  assert.equal(o.outputs, undefined);
  assert.deepEqual(failures, [], 'a pathological input must not open the breaker for everybody');
  assert.equal(h.ofType('killSent').length, 0);
  assert.equal(h.sup.liveWorkers, 1, 'worker reused');
  await h.sup.shutdown();
});

test('coordinator: truncated result -> UNAVAILABLE/truncated, text null, never cached, identical call dispatches again, breaker stays CLOSED', async () => {
  const h = makeSup();
  const cache = new TranslationCache();
  const coord = new Coordinator({ supervisor: h.sup, cache, identity, timeoutMs: 2000, queueMax: 4 });
  const tr = (text) => coord.translate({ organizationId: 'o', scope: 's', source: 'vi', target: 'en', text });
  assert.equal((await tr('n=1 step=1 warm')).status, 'OK');
  const size = cache.size;
  for (let i = 0; i < 4; i++) {
    const r = await tr('truncated n=2 step=5 same');
    assert.equal(r.status, 'UNAVAILABLE');
    assert.equal(r.stats.reason, 'truncated');
    assert.equal(r.text, null);
    assert.equal(r.cacheHit, false);
  }
  assert.equal(cache.size, size, 'nothing cached');
  assert.equal(h.ofType('dispatch').length, 5, 'every identical call ran again');
  const snap = coord.snapshot().breakers['vi-en'];
  assert.equal(snap.state, 'CLOSED');
  assert.equal(snap.recentFailures, 0);
  assert.equal((await tr('n=1 step=1 fine')).status, 'OK');
  await coord.shutdown();
});

test('coordinator: a half-open probe that ends TRUNCATED releases the probe (no wedge)', async () => {
  const h = makeSup({ killGraceMs: 400 });
  const coord = new Coordinator({ supervisor: h.sup, cache: new TranslationCache(), identity, timeoutMs: 2000, queueMax: 4, breakerOptions: { baseCooldownMs: 150 } });
  const tr = (text) => coord.translate({ organizationId: 'o', scope: 's', source: 'vi', target: 'en', text });
  await tr('n=1 step=1 warm');
  h.sup.computeMaxMs = 100;
  for (let i = 0; i < 3; i++) await tr(`n=500 step=20 slow${i}`);
  assert.equal(coord.snapshot().breakers['vi-en'].state, 'OPEN');
  await new Promise((r) => setTimeout(r, 170));
  h.sup.computeMaxMs = 3000;
  const probe = await tr('truncated n=2 step=5 probe');
  assert.equal(probe.stats.reason, 'truncated');
  const next = await tr('n=1 step=1 second probe');
  assert.equal(next.status, 'OK', 'another probe was admitted');
  await coord.shutdown();
});
