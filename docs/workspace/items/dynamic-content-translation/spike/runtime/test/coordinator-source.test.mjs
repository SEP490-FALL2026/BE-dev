// Effective source (review finding 5): effectiveSource = sourceOverride ?? storedSource. It drives the same-language
// shortcut, the model direction and the cache key. The stored record is never changed. Result metadata:
// sourceLanguage (stored), effectiveSourceLanguage, sourceOverridden, textLanguage (language of the returned text,
// or null when it is disputed so the product omits Content-Language).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeSup } from './helpers.mjs';
import { makeFakeSup } from './fake-child.mjs';
import { Coordinator } from '../coordinator.mjs';
import { TranslationCache } from '../cache.mjs';

const identity = { engineId: 'fake@1', modelDigest: 'd1', glossaryVersion: 'g1', placeholderPolicyVersion: 'p1' };

function make(supOpts = {}, coordOpts = {}) {
  const h = makeSup(supOpts);
  const coord = new Coordinator({
    supervisor: h.sup,
    cache: new TranslationCache(),
    identity,
    timeoutMs: 2000,
    queueMax: 4,
    ...coordOpts,
  });
  const tr = (o) => coord.translate({ organizationId: 'o', scope: 's', target: 'en', text: 'n=1 step=1 hello', ...o });
  return { ...h, coord, tr };
}

test('no override: effective = stored; direction from stored; OK metadata', async () => {
  const c = make();
  const r = await c.tr({ storedSource: 'vi' });
  assert.equal(r.status, 'OK');
  assert.equal(c.ofType('enqueue')[0].direction, 'vi-en');
  assert.equal(r.sourceLanguage, 'vi');
  assert.equal(r.effectiveSourceLanguage, 'vi');
  assert.equal(r.sourceOverridden, false);
  assert.equal(r.textLanguage, 'en', 'translated text is in the target language');
  await c.coord.shutdown();
});

test('override wins: model direction and result metadata follow the override; stored value is reported unchanged', async () => {
  const c = make();
  const input = Object.freeze({
    organizationId: 'o',
    scope: 's',
    target: 'vi',
    text: 'n=1 step=1 hello',
    storedSource: 'vi',
    sourceOverride: 'en',
  });
  const r = await c.coord.translate(input);
  assert.equal(r.status, 'OK');
  assert.equal(c.ofType('enqueue')[0].direction, 'en-vi', 'stored vi, reader says en: en->vi model');
  assert.equal(r.sourceLanguage, 'vi');
  assert.equal(r.effectiveSourceLanguage, 'en');
  assert.equal(r.sourceOverridden, true);
  assert.equal(r.textLanguage, 'vi');
  assert.equal(input.storedSource, 'vi', 'input untouched');
  await c.coord.shutdown();
});

test('same-language shortcut uses the EFFECTIVE source: stored vi, target en, override en -> original text, no worker, text language disputed (null)', async () => {
  const c = make();
  const r = await c.tr({ storedSource: 'vi', sourceOverride: 'en', text: 'Hello there' });
  assert.equal(r.status, 'OK');
  assert.equal(r.text, 'Hello there');
  assert.equal(r.stats.reason, 'same-language');
  assert.equal(c.ofType('enqueue').length, 0);
  assert.equal(r.sourceOverridden, true);
  assert.equal(r.textLanguage, null, 'stored says vi, reader says en: disputed');
  await c.coord.shutdown();
});

test('same-language shortcut without override: textLanguage = the shared language; override equal to stored is not an override', async () => {
  const c = make();
  const r = await c.tr({ storedSource: 'en', text: 'Hello there' });
  assert.equal(r.stats.reason, 'same-language');
  assert.equal(r.textLanguage, 'en');
  assert.equal(r.sourceOverridden, false);
  const r2 = await c.tr({ storedSource: 'en', sourceOverride: 'en', text: 'Hello there' });
  assert.equal(r2.sourceOverridden, false);
  assert.equal(r2.textLanguage, 'en');
  assert.equal(c.ofType('enqueue').length, 0);
  await c.coord.shutdown();
});

test('stored == target but the reader overrides the source to the other language -> translated (override decides)', async () => {
  const c = make();
  const r = await c.tr({ storedSource: 'en', sourceOverride: 'vi', target: 'en', text: 'n=1 step=1 xin chao' });
  assert.equal(r.status, 'OK');
  assert.equal(c.ofType('enqueue')[0].direction, 'vi-en');
  assert.equal(r.text, 'T:n=1 step=1 xin chao');
  assert.equal(r.textLanguage, 'en');
  await c.coord.shutdown();
});

test('cache key uses the effective source: stored vi == stored en + override vi share an entry; different effective sources do not', async () => {
  const c = make();
  const a = await c.tr({ storedSource: 'vi', text: 'n=1 step=1 same' });
  assert.equal(a.cacheHit, false);
  const b = await c.tr({ storedSource: 'en', sourceOverride: 'vi', text: 'n=1 step=1 same' });
  assert.equal(b.cacheHit, true, 'same effective pair vi-en');
  assert.equal(b.sourceOverridden, true);
  const d = await c.tr({ storedSource: 'vi', target: 'vi', sourceOverride: 'en', text: 'n=1 step=1 same' });
  assert.equal(d.cacheHit, false, 'effective en->vi is a different key');
  await c.coord.shutdown();
});

test('fallback (original text is what the product returns): textLanguage = effective source when not overridden, null when overridden', async () => {
  const c = make({ computeMaxMs: 3000 }, { timeoutMs: 60 });
  const slow = 'n=200 step=20 slow';
  const t1 = await c.tr({ storedSource: 'vi', text: slow });
  assert.equal(t1.status, 'TIMEOUT');
  assert.equal(t1.textLanguage, 'vi');
  assert.equal(t1.sourceLanguage, 'vi');
  assert.equal(t1.sourceOverridden, false);
  const t2 = await c.tr({ storedSource: 'vi', sourceOverride: 'vi', text: slow + '2' });
  assert.equal(t2.textLanguage, 'vi', 'override equal to stored is not disputed');
  const t3 = await c.tr({ storedSource: 'en', sourceOverride: 'vi', text: slow + '3' });
  assert.equal(t3.status, 'TIMEOUT');
  assert.equal(t3.sourceOverridden, true);
  assert.equal(t3.textLanguage, null);
  assert.equal(t3.effectiveSourceLanguage, 'vi');
  const u = await c.tr({ storedSource: 'fr', text: 'x' });
  assert.equal(u.status, 'UNAVAILABLE');
  assert.equal(u.textLanguage, 'fr');
  const u2 = await c.tr({ storedSource: 'fr', sourceOverride: 'de', text: 'x' });
  assert.equal(u2.status, 'UNAVAILABLE');
  assert.equal(u2.textLanguage, null);
  await c.coord.shutdown();
});

test('BUSY fallbacks carry the same metadata', async () => {
  const c = make({ killGraceMs: 400 }, { queueMax: 1 });
  await c.tr({ storedSource: 'vi' });
  const ps = ['n=20 step=30 a', 'n=1 step=1 b'].map((t) => c.tr({ storedSource: 'vi', text: t }));
  const busy = await c.tr({ storedSource: 'vi', sourceOverride: 'en', target: 'vi', text: 'n=1 step=1 d' });
  assert.equal(busy.status, 'BUSY');
  assert.equal(busy.textLanguage, null);
  assert.equal(busy.effectiveSourceLanguage, 'en');
  const busy2 = await c.tr({ storedSource: 'vi', text: 'n=1 step=1 e' });
  assert.equal(busy2.status, 'BUSY');
  assert.equal(busy2.textLanguage, 'vi');
  await Promise.all(ps);
  await c.coord.shutdown();
});

test('empty text returns the original unchanged with metadata; legacy `source` still works as storedSource', async () => {
  const c = make();
  const e = await c.tr({ storedSource: 'vi', text: '   ' });
  assert.equal(e.status, 'OK');
  assert.equal(e.textLanguage, 'vi');
  const legacy = await c.coord.translate({
    organizationId: 'o',
    scope: 's',
    source: 'vi',
    target: 'en',
    text: 'n=1 step=1 legacy',
  });
  assert.equal(legacy.status, 'OK');
  assert.equal(legacy.sourceLanguage, 'vi');
  await c.coord.shutdown();
});

test('spawn failure at coordinator level: UNAVAILABLE/spawn-failed, counted by the breaker (opens after 3), shutdown fine', async () => {
  const h = makeFakeSup(() => {
    throw new Error('EAGAIN');
  });
  const coord = new Coordinator({
    supervisor: h.sup,
    cache: new TranslationCache(),
    identity,
    timeoutMs: 1000,
    queueMax: 4,
    breakerOptions: { baseCooldownMs: 5000 },
  });
  const tr = (t) => coord.translate({ organizationId: 'o', scope: 's', storedSource: 'vi', target: 'en', text: t });
  for (let i = 0; i < 3; i++) {
    const r = await tr('t' + i);
    assert.equal(r.status, 'UNAVAILABLE');
    assert.equal(r.stats.reason, 'spawn-failed');
  }
  assert.equal(coord.snapshot().breakers['vi-en'].state, 'OPEN');
  const open = await tr('t4');
  assert.equal(open.stats.reason, 'breaker-open');
  await coord.shutdown();
  assert.equal(h.sup.liveWorkers, 0);
});
