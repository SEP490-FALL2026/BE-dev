import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkPreservation, checkMeaning, percentile, aggregate, POLARITY_CATEGORIES } from './lib/metrics.mjs';

test('checkPreservation: exact, case-sensitive substring of every protected string', () => {
  assert.deepEqual(checkPreservation('Approved REQ-2026-0042 for Nguyễn Văn An.', ['REQ-2026-0042', 'Nguyễn Văn An']), { all: true, missing: [] });
  const r = checkPreservation('Approved req-2026-0042 for Hoffung An.', ['REQ-2026-0042', 'Nguyễn Văn An']);
  assert.equal(r.all, false);
  assert.deepEqual(r.missing, ['REQ-2026-0042', 'Nguyễn Văn An']);
  assert.deepEqual(checkPreservation('anything', []), { all: true, missing: [] });
});

test('checkMeaning: mustContain supports any-of groups, case-insensitive; mustNotContain is substring', () => {
  const ok = checkMeaning('The request was NOT approved.', { mustContain: [['not', "n't"], 'approv'], mustNotContain: ['reject'] });
  assert.equal(ok.pass, true);
  const bad = checkMeaning('The request was approved.', { mustContain: [['not', "n't"]], mustNotContain: ['approved'] });
  assert.equal(bad.pass, false);
  assert.deepEqual(bad.failedContain, ['not | n\'t']);
  assert.deepEqual(bad.failedNotContain, ['approved']);
  assert.equal(checkMeaning('x', {}).pass, true);
  assert.equal(checkMeaning('x', {}).hasChecks, false);
  assert.equal(checkMeaning('Không', { mustContain: ['không'] }).pass, true, 'diacritic-bearing lowercase');
});

test('percentile: linear interpolation', () => {
  assert.equal(percentile([10, 20, 30, 40], 50), 25);
  assert.equal(percentile([5], 95), 5);
  assert.equal(percentile([1, 2, 3, 4, 5], 95), 4.8);
  assert.ok(Number.isNaN(percentile([], 50)));
});

const mk = (id, categories, extra = {}) => ({
  id,
  categories,
  reference: 'abcdef',
  output: 'abcdef',
  preserved: { all: true, missing: [] },
  hasProtected: true,
  meaning: { pass: true, hasChecks: true },
  counts: { total: 2, translated: 2, fallback: 0 },
  latencyMs: 100,
  ...extra,
});

test('aggregate: overall and per-category rates', () => {
  const items = [
    mk('a', ['negation']),
    mk('b', ['negation', 'name'], { output: 'zzzzzz', meaning: { pass: false, hasChecks: true }, counts: { total: 2, translated: 1, fallback: 1 }, preserved: { all: false, missing: ['X'] }, latencyMs: 300 }),
    mk('c', ['plain'], { hasProtected: false, meaning: { pass: true, hasChecks: false } }),
  ];
  const agg = aggregate(items);
  assert.equal(agg.items, 3);
  assert.equal(agg.preservedPct, 50, '1 of 2 items that have protected terms');
  assert.equal(agg.meaningPassPct, 50, '1 of 2 items that have checks');
  assert.equal(agg.fallbackSegmentPct, 16.67, "rounded to 2 decimals");
  assert.equal(agg.latency.p50, 100);
  assert.equal(agg.polarity.negation.pct, 50);
  assert.equal(agg.polarity.negation.n, 2);
  assert.equal(agg.perCategory.name.items, 1);
  assert.equal(agg.perCategory.name.meaningPassPct, 0);
  assert.ok(agg.corpusChrF > 0 && agg.corpusChrF < 100);
  assert.deepEqual(POLARITY_CATEGORIES, ['negation', 'approve', 'reject', 'revoke']);
});

test('aggregate: silent failures = failed meaning check on an item with no fallback segment', () => {
  const items = [
    mk('a', ['negation'], { meaning: { pass: false, hasChecks: true } }),
    mk('b', ['negation'], { meaning: { pass: false, hasChecks: true }, counts: { total: 1, translated: 0, fallback: 1 } }),
  ];
  const agg = aggregate(items);
  assert.equal(agg.silentMeaningFailures, 1);
  assert.equal(agg.polarity.negation.silentFailures, 1);
});

// ---- field-level metrics for the whole-field fallback pipeline ---------------------------------------------------------
import { fieldMetrics, reasonBucket, fieldFlags } from './lib/metrics.mjs';

const fm = (id, categories, extra = {}) => ({
  id,
  categories,
  reference: 'abcdef',
  output: 'abcdef',
  hasProtected: true,
  preserved: { all: true, missing: [] },
  meaning: { pass: true, hasChecks: true, failedContain: [], failedNotContain: [] },
  status: 'TRANSLATED',
  reason: null,
  counts: { total: 1, translated: 1, fallback: 0 },
  latencyMs: 100,
  segmentMs: [10, 20],
  ...extra,
});
const failed = (id, reason, extra = {}) =>
  fm(id, ['plain'], { status: 'NOT_TRANSLATED', reason, counts: { total: 1, translated: 0, fallback: 1 }, output: 'zzzzzz', meaning: { pass: false, hasChecks: true, failedContain: ['x'], failedNotContain: [] }, segmentMs: [], ...extra });

test('reasonBucket maps pipeline reasons to the reported buckets', () => {
  assert.equal(reasonBucket('PLACEHOLDER_GATE'), 'placeholder');
  assert.equal(reasonBucket('QUALITY_GATE'), 'polarity');
  assert.equal(reasonBucket('TOO_LONG'), 'too_long');
  assert.equal(reasonBucket('MAX_NEW_TOKENS'), 'max_new_tokens');
  assert.equal(reasonBucket('NOT_EOS'), 'other');
  assert.equal(reasonBucket('ERROR'), 'other');
});

test('fieldMetrics: translated vs fallback by reason, automatic flags only among translated fields, per-field and per-segment latency', () => {
  const items = [
    fm('a', ['negation']),
    fm('b', ['approve'], { meaning: { pass: false, hasChecks: true, failedContain: ['approv'], failedNotContain: [] }, segmentMs: [30], latencyMs: 300 }),
    fm('p', ['name'], { preserved: { all: false, missing: ['Nguyễn Văn An'] } }),
    failed('c', 'PLACEHOLDER_GATE'),
    failed('d', 'QUALITY_GATE'),
    failed('e', 'TOO_LONG'),
    failed('f', 'MAX_NEW_TOKENS'),
    failed('g', 'ERROR'),
    fm('h', ['plain'], { status: 'NOT_NEEDED', reason: 'SOURCE_EMPTY', counts: { total: 0, translated: 0, fallback: 0 }, segmentMs: [] }),
  ];
  const m = fieldMetrics(items);
  assert.equal(m.items, 9);
  assert.equal(m.notNeeded, 1);
  assert.equal(m.translated, 3);
  assert.equal(m.translatedPct, 37.5, '3 of the 8 fields that needed translation');
  assert.equal(m.fallback.n, 5);
  assert.equal(m.fallback.pct, 62.5);
  assert.deepEqual(m.fallback.byReason, { placeholder: 1, polarity: 1, too_long: 1, max_new_tokens: 1, other: 1 });
  assert.equal(m.automaticFlags.translatedFields, 3);
  assert.equal(m.automaticFlags.meaningFlags, 1, 'fallback fields are never flagged');
  assert.equal(m.automaticFlags.preservationFlags, 1);
  assert.equal(m.automaticFlags.polarity.approve.n, 1);
  assert.equal(m.automaticFlags.polarity.approve.flags, 1);
  assert.equal(m.automaticFlags.polarity.negation.flags, 0);
  assert.equal(m.preservation.translatedPct, 66.67, 'translated fields with protected terms: 2 of 3 preserved');
  assert.deepEqual(m.latency.field, { p50: 100, p95: 230, max: 300, n: 8 });
  assert.equal(m.latency.segment.n, 5);
  assert.equal(m.latency.segment.p50, 20);
  assert.ok(m.chrF.corpus >= 0 && m.chrF.translatedOnly > m.chrF.corpus, 'fallbacks pull the corpus score down');
});

test('fieldFlags lists translated fields whose keyword or preservation check failed, never fallbacks', () => {
  const items = [
    fm('ok', ['negation']),
    fm('flag', ['approve'], { meaning: { pass: false, hasChecks: true, failedContain: ['approv'], failedNotContain: ['reject'] } }),
    fm('lost', ['name'], { preserved: { all: false, missing: ['Figma'] } }),
    failed('fb', 'QUALITY_GATE'),
  ];
  const flags = fieldFlags(items, new Map([['flag', { source: 'S', reference: 'R' }], ['lost', { source: 'S2', reference: 'R2' }]]));
  assert.deepEqual(flags.map((f) => f.id), ['flag', 'lost']);
  assert.equal(flags[0].polarityCategory, 'approve');
  assert.equal(flags[0].source, 'S');
  assert.equal(flags[0].reference, 'R');
  assert.equal(flags[0].output, 'abcdef');
  assert.deepEqual(flags[0].failed.meaning.failedNotContain, ['reject']);
  assert.deepEqual(flags[1].failed.preservation.missing, ['Figma']);
  assert.equal(flags[1].polarityCategory, null);
});
