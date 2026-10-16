import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TranslationCache, normalizeText, sha256Hex } from '../cache.mjs';

const ident = {
  organizationId: 'org1',
  scope: 'request:1:businessJustification',
  engineId: 'opus-mt-q8@4.3.1',
  modelDigest: 'abc',
  glossaryVersion: 'g1',
  placeholderPolicyVersion: 'p1',
  source: 'vi',
  target: 'en',
  text: 'Xin chào thế giới',
};

test('normalizeText: NFC + trim + collapse whitespace (incl. NBSP and ZWSP)', () => {
  assert.equal(normalizeText('  a  b​c \n\t d  '), 'a b c d');
  // decomposed e + combining acute composes to NFC e-acute
  assert.equal(normalizeText('é'), 'é');
});

test('key is deterministic within a cache instance and a 64-hex HMAC', () => {
  const c = new TranslationCache();
  const k1 = c.makeKey(ident);
  const k2 = c.makeKey({ ...ident, text: '  Xin  chào thế giới ' });
  assert.equal(k1, k2);
  assert.match(k1, /^[0-9a-f]{64}$/);
});

test('key changes when any identity field changes', () => {
  const c = new TranslationCache();
  const base = c.makeKey(ident);
  for (const [f, v] of [
    ['organizationId', 'org2'],
    ['scope', 'request:2:businessJustification'],
    ['engineId', 'other'],
    ['modelDigest', 'zzz'],
    ['glossaryVersion', 'g2'],
    ['placeholderPolicyVersion', 'p2'],
    ['source', 'en'],
    ['target', 'vi'],
    ['text', 'Khác'],
  ]) {
    assert.notEqual(c.makeKey({ ...ident, [f]: v }), base, `field ${f} must be part of the key`);
  }
});

test('key does not leak raw text and differs between cache instances (per-process random HMAC key)', () => {
  const a = new TranslationCache();
  const b = new TranslationCache();
  assert.notEqual(a.makeKey(ident), b.makeKey(ident));
  assert.ok(!a.makeKey(ident).includes('Xin'));
  assert.notEqual(a.makeKey(ident), sha256Hex(ident.text));
});

test('field boundaries cannot be forged by concatenation (JSON array encoding)', () => {
  const c = new TranslationCache();
  const k1 = c.makeKey({ ...ident, organizationId: 'a', scope: 'bc' });
  const k2 = c.makeKey({ ...ident, organizationId: 'ab', scope: 'c' });
  assert.notEqual(k1, k2);
});

test('get/set round trip and miss', () => {
  const c = new TranslationCache();
  assert.equal(c.get('k'), undefined);
  c.set('k', 'v');
  assert.equal(c.get('k'), 'v');
  assert.equal(c.stats().hits, 1);
  assert.equal(c.stats().misses, 1);
});

test('LRU evicts by entry count; get refreshes recency', () => {
  const c = new TranslationCache({ maxEntries: 3, maxBytes: 1e9 });
  c.set('a', '1');
  c.set('b', '2');
  c.set('c', '3');
  assert.equal(c.get('a'), '1'); // a becomes most recent
  c.set('d', '4'); // evicts b (least recent)
  assert.equal(c.get('b'), undefined);
  assert.equal(c.get('a'), '1');
  assert.equal(c.get('c'), '3');
  assert.equal(c.get('d'), '4');
  assert.equal(c.size, 3);
});

test('LRU evicts by bytes: (key.length+value.length)*2 approximation', () => {
  const c = new TranslationCache({ maxEntries: 1000, maxBytes: 100 });
  assert.equal(TranslationCache.entryBytes('kk', 'x'.repeat(8)), 20);
  for (let i = 0; i < 10; i++) c.set('k' + i, 'x'.repeat(8)); // each (2+8)*2 = 20 bytes
  assert.equal(c.size, 5);
  assert.ok(c.bytes <= 100);
  assert.equal(c.get('k0'), undefined);
  assert.equal(c.get('k9'), 'x'.repeat(8));
});

test('a single value larger than maxBytes is not stored and evicts nothing', () => {
  const c = new TranslationCache({ maxEntries: 10, maxBytes: 100 });
  c.set('a', '1');
  c.set('big', 'x'.repeat(200));
  assert.equal(c.get('big'), undefined);
  assert.equal(c.get('a'), '1');
});

test('overwrite updates bytes accounting', () => {
  const c = new TranslationCache({ maxEntries: 10, maxBytes: 1e6 });
  c.set('k', 'xxxx');
  const b1 = c.bytes;
  c.set('k', 'xxxxxxxx');
  assert.equal(c.size, 1);
  assert.equal(c.bytes, b1 + 8);
});

test('TTL: lazy expiry on get, entry removed and bytes released', () => {
  let t = 1000;
  const c = new TranslationCache({ ttlMs: 86_400_000, now: () => t });
  c.set('k', 'v');
  t += 86_399_999;
  assert.equal(c.get('k'), 'v');
  t += 2;
  assert.equal(c.get('k'), undefined);
  assert.equal(c.size, 0);
  assert.equal(c.bytes, 0);
});

test('defaults: 500 entries, 8 MiB, 24 h TTL', () => {
  const c = new TranslationCache();
  assert.equal(c.maxEntries, 500);
  assert.equal(c.maxBytes, 8 * 1024 * 1024);
  assert.equal(c.ttlMs, 86_400_000);
});

test('exposes no list/delete/keys API', () => {
  const c = new TranslationCache();
  for (const m of ['keys', 'entries', 'values', 'list', 'delete', 'remove', 'clear', 'forEach']) {
    assert.equal(typeof c[m], 'undefined', m);
  }
});
