// Per-item checks and aggregation (pure).
import { corpusChrF } from './chrf.mjs';

export const POLARITY_CATEGORIES = ['negation', 'approve', 'reject', 'revoke'];

const norm = (s) => String(s).normalize('NFC').toLowerCase();

// Every protected string must appear unchanged (exact, case-sensitive substring).
export function checkPreservation(output, protectedList = []) {
  const out = String(output).normalize('NFC');
  const missing = protectedList.filter((p) => !out.includes(String(p).normalize('NFC')));
  return { all: missing.length === 0, missing };
}

// mustContain: array of string | string[] (any-of group); mustNotContain: array of string.
// Case-insensitive substring match on NFC text.
export function checkMeaning(output, { mustContain = [], mustNotContain = [] } = {}) {
  const o = norm(output);
  const failedContain = [];
  for (const need of mustContain) {
    const alts = Array.isArray(need) ? need : [need];
    if (!alts.some((a) => o.includes(norm(a)))) failedContain.push(alts.join(' | '));
  }
  const failedNotContain = mustNotContain.filter((bad) => o.includes(norm(bad)));
  return {
    pass: failedContain.length === 0 && failedNotContain.length === 0,
    hasChecks: mustContain.length + mustNotContain.length > 0,
    failedContain,
    failedNotContain,
  };
}

export function percentile(values, p) {
  if (values.length === 0) return NaN;
  const v = [...values].sort((a, b) => a - b);
  const rank = (p / 100) * (v.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  return v[lo] + (v[hi] - v[lo]) * (rank - lo);
}

const pct = (num, den) => (den === 0 ? null : (num / den) * 100);
const round = (x, d = 2) => (x === null || Number.isNaN(x) ? null : Math.round(x * 10 ** d) / 10 ** d);

function summarize(items) {
  const withProtected = items.filter((i) => i.hasProtected);
  const withChecks = items.filter((i) => i.meaning.hasChecks);
  const segTotal = items.reduce((a, i) => a + i.counts.total, 0);
  const segFallback = items.reduce((a, i) => a + i.counts.fallback, 0);
  return {
    items: items.length,
    corpusChrF: items.length
      ? round(
          corpusChrF(
            items.map((i) => i.output),
            items.map((i) => i.reference),
          ),
        )
      : null,
    preservedPct: round(pct(withProtected.filter((i) => i.preserved.all).length, withProtected.length)),
    meaningPassPct: round(pct(withChecks.filter((i) => i.meaning.pass).length, withChecks.length)),
    fallbackSegmentPct: round(pct(segFallback, segTotal)),
  };
}

export function aggregate(items) {
  const overall = summarize(items);
  const lat = items.map((i) => i.latencyMs).filter((x) => Number.isFinite(x));
  const silent = (i) => i.meaning.hasChecks && !i.meaning.pass && i.counts.fallback === 0;

  const categories = new Set(items.flatMap((i) => i.categories));
  const perCategory = {};
  for (const c of [...categories].sort()) perCategory[c] = summarize(items.filter((i) => i.categories.includes(c)));

  const polarity = {};
  for (const c of POLARITY_CATEGORIES) {
    const inCat = items.filter((i) => i.categories.includes(c) && i.meaning.hasChecks);
    polarity[c] = {
      n: inCat.length,
      pass: inCat.filter((i) => i.meaning.pass).length,
      pct: round(pct(inCat.filter((i) => i.meaning.pass).length, inCat.length)),
      silentFailures: inCat.filter(silent).length,
    };
  }

  return {
    ...overall,
    silentMeaningFailures: items.filter(silent).length,
    polarity,
    latency: {
      p50: round(percentile(lat, 50), 1),
      p95: round(percentile(lat, 95), 1),
      max: round(lat.length ? Math.max(...lat) : NaN, 1),
    },
    perCategory,
  };
}

// ---- field-level metrics (whole-field fallback pipeline) ---------------------------------------------------------------

const REASON_BUCKET = {
  PLACEHOLDER_GATE: 'placeholder',
  QUALITY_GATE: 'polarity',
  TOO_LONG: 'too_long',
  MAX_NEW_TOKENS: 'max_new_tokens',
};
export const FALLBACK_BUCKETS = ['placeholder', 'polarity', 'too_long', 'max_new_tokens', 'other'];

export function reasonBucket(reason) {
  return REASON_BUCKET[reason] ?? 'other';
}

const stat = (values) => ({
  p50: round(percentile(values, 50), 1),
  p95: round(percentile(values, 95), 1),
  max: round(values.length ? Math.max(...values) : NaN, 1),
  n: values.length,
});

const isFlagged = (i) => i.status === 'TRANSLATED' && i.meaning?.hasChecks && !i.meaning.pass;
const isPreservationFlagged = (i) => i.status === 'TRANSLATED' && i.hasProtected && !i.preserved?.all;

// Automatic flags are keyword / exact-string checks. They are NOT a judgement of translation quality.
export function fieldMetrics(items) {
  const needed = items.filter((i) => i.status !== 'NOT_NEEDED');
  const translated = items.filter((i) => i.status === 'TRANSLATED');
  const fell = items.filter((i) => i.status === 'NOT_TRANSLATED');
  const byReason = Object.fromEntries(FALLBACK_BUCKETS.map((b) => [b, 0]));
  for (const i of fell) byReason[reasonBucket(i.reason)]++;

  const polarity = {};
  for (const c of POLARITY_CATEGORIES) {
    const inCat = translated.filter((i) => i.categories.includes(c) && i.meaning?.hasChecks);
    polarity[c] = { n: inCat.length, flags: inCat.filter((i) => !i.meaning.pass).length };
  }
  const withProt = translated.filter((i) => i.hasProtected);
  const fieldMs = needed.map((i) => i.latencyMs).filter(Number.isFinite);
  const segMs = items.flatMap((i) => i.segmentMs ?? []).filter(Number.isFinite);
  const chrfOf = (set) =>
    set.length
      ? round(
          corpusChrF(
            set.map((i) => i.output),
            set.map((i) => i.reference),
          ),
        )
      : null;

  return {
    items: items.length,
    notNeeded: items.length - needed.length,
    translated: translated.length,
    translatedPct: round(pct(translated.length, needed.length)),
    fallback: { n: fell.length, pct: round(pct(fell.length, needed.length)), byReason },
    chrF: { corpus: chrfOf(items), translatedOnly: chrfOf(translated) },
    preservation: {
      translatedPct: round(pct(withProt.filter((i) => i.preserved.all).length, withProt.length)),
      n: withProt.length,
    },
    automaticFlags: {
      translatedFields: translated.length,
      meaningFlags: translated.filter(isFlagged).length,
      meaningFlagPct: round(
        pct(translated.filter(isFlagged).length, translated.filter((i) => i.meaning?.hasChecks).length),
      ),
      preservationFlags: translated.filter(isPreservationFlagged).length,
      polarity,
    },
    latency: { field: stat(fieldMs), segment: stat(segMs) },
  };
}

// Translated fields whose automatic keyword or preservation check failed, with source/output/reference for a human reader.
// `lookup` maps id -> { source, reference } (fixtures). Fallback fields are never listed.
export function fieldFlags(items, lookup) {
  const out = [];
  for (const i of items) {
    const meaning = isFlagged(i);
    const preservation = isPreservationFlagged(i);
    if (!meaning && !preservation) continue;
    const fx = lookup.get(i.id) ?? {};
    const failed = {};
    if (meaning)
      failed.meaning = {
        failedContain: i.meaning.failedContain ?? [],
        failedNotContain: i.meaning.failedNotContain ?? [],
      };
    if (preservation) failed.preservation = { missing: i.preserved.missing ?? [] };
    out.push({
      id: i.id,
      categories: i.categories,
      polarityCategory: i.categories.find((c) => POLARITY_CATEGORIES.includes(c)) ?? null,
      source: fx.source ?? null,
      output: i.output,
      reference: fx.reference ?? null,
      failed,
    });
  }
  return out;
}
