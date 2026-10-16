// In-process translation cache (supervisor process only).
// Bounded LRU (entries AND approximate bytes) with lazy TTL expiry. Keys are HMAC-SHA256 digests under a
// per-process random key, so a key never reveals the text and cannot be recomputed outside this process.
// Only COMPLETE successes may be stored (the coordinator enforces that). No negative caching.
// There is deliberately no list/keys/delete/clear API: callers must authorize BEFORE calling the coordinator.
import { createHash, createHmac, randomBytes } from 'node:crypto';

export const KEY_VERSION = 'tr-v1';
export const NORMALIZER_ID = 'nfc-ws-v1';

export const sha256Hex = (s) => createHash('sha256').update(s, 'utf8').digest('hex');

/** NFC + trim + collapse runs of whitespace / U+00A0 / U+200B to a single space. */
export function normalizeText(text) {
  return String(text)
    .normalize('NFC')
    .replace(/[\s ​]+/g, ' ')
    .trim();
}

export class TranslationCache {
  #map = new Map(); // key -> { value, expiresAt, bytes }; insertion order = recency (oldest first)
  #bytes = 0;
  #hmacKey;
  #now;
  #hits = 0;
  #misses = 0;
  #evictions = 0;

  constructor({ maxEntries = 500, maxBytes = 8 * 1024 * 1024, ttlMs = 86_400_000, now = Date.now } = {}) {
    this.maxEntries = maxEntries;
    this.maxBytes = maxBytes;
    this.ttlMs = ttlMs;
    this.#now = now;
    this.#hmacKey = randomBytes(32);
  }

  static entryBytes(key, value) {
    return (key.length + value.length) * 2;
  }

  get size() {
    return this.#map.size;
  }

  get bytes() {
    return this.#bytes;
  }

  stats() {
    return { entries: this.#map.size, bytes: this.#bytes, hits: this.#hits, misses: this.#misses, evictions: this.#evictions };
  }

  /** `scope` is an opaque caller string, e.g. "request:<id>:businessJustification". */
  makeKey({ organizationId, scope, engineId, modelDigest, glossaryVersion, placeholderPolicyVersion, source, target, text }) {
    const material = JSON.stringify([
      KEY_VERSION,
      organizationId,
      scope,
      engineId,
      modelDigest,
      glossaryVersion,
      NORMALIZER_ID,
      placeholderPolicyVersion,
      source,
      target,
      sha256Hex(normalizeText(text)),
    ]);
    return createHmac('sha256', this.#hmacKey).update(material, 'utf8').digest('hex');
  }

  get(key) {
    const e = this.#map.get(key);
    if (!e) {
      this.#misses++;
      return undefined;
    }
    if (e.expiresAt <= this.#now()) {
      this.#drop(key, e);
      this.#misses++;
      return undefined;
    }
    this.#map.delete(key); // refresh recency
    this.#map.set(key, e);
    this.#hits++;
    return e.value;
  }

  set(key, value) {
    const bytes = TranslationCache.entryBytes(key, value);
    const old = this.#map.get(key);
    if (old) this.#drop(key, old);
    if (bytes > this.maxBytes) return false; // never stored; nothing evicted
    this.#map.set(key, { value, expiresAt: this.#now() + this.ttlMs, bytes });
    this.#bytes += bytes;
    while (this.#map.size > this.maxEntries || this.#bytes > this.maxBytes) {
      const oldest = this.#map.keys().next().value;
      this.#drop(oldest, this.#map.get(oldest));
      this.#evictions++;
    }
    return true;
  }

  #drop(key, e) {
    this.#map.delete(key);
    this.#bytes -= e.bytes;
  }
}
