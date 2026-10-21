import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import { scrub, worstErrors, renderSummary, serializeRun } from './lib/report.mjs';

test('scrub removes home directory and Windows user paths', () => {
  const home = os.homedir();
  const input = {
    a: `${home}\\models\\x`,
    b: 'C:\\Users\\Someone\\AppData\\Local\\Temp\\f.json',
    c: '/home/dev/project',
    d: 'ok text',
  };
  const out = JSON.stringify(scrub(input));
  assert.ok(!out.includes(home.replaceAll('\\', '\\\\')));
  assert.ok(!/Someone/.test(out));
  assert.ok(!/\/home\/dev/.test(out));
  assert.ok(out.includes('ok text'));
});

const item = (id, categories, extra = {}) => ({
  id,
  categories,
  output: 'out',
  chrf: 50,
  hasProtected: true,
  preserved: { all: true, missing: [] },
  meaning: { pass: true, hasChecks: true, failedContain: [], failedNotContain: [] },
  counts: { total: 1, translated: 1, fallback: 0 },
  latencyMs: 10,
  ...extra,
});

test('worstErrors ranks silent polarity failures first and ignores safe fallbacks', () => {
  const run = {
    direction: 'vi-en',
    mode: 'protected',
    items: [
      item('ok', ['plain']),
      item('fallback-safe', ['negation'], {
        meaning: { pass: false, hasChecks: true, failedContain: ['not'], failedNotContain: [] },
        counts: { total: 1, translated: 0, fallback: 1 },
      }),
      item('name-lost', ['name'], { preserved: { all: false, missing: ['Nguyễn Văn An'] } }),
      item('polarity', ['approve'], {
        meaning: { pass: false, hasChecks: true, failedContain: ['approv'], failedNotContain: ['reject'] },
      }),
    ],
  };
  const fixtures = {
    'vi-en': {
      items: [
        { id: 'ok', source: 's1' },
        { id: 'fallback-safe', source: 's2' },
        { id: 'name-lost', source: 's3' },
        { id: 'polarity', source: 's4' },
      ],
    },
  };
  const w = worstErrors([run], fixtures, 10);
  assert.deepEqual(
    w.map((x) => x.id),
    ['polarity', 'name-lost'],
  );
  assert.equal(w[0].category, 'approve');
  assert.equal(w[0].source, 's4');
});

test('renderSummary produces markdown tables for each direction/mode', () => {
  const run = (direction, mode) => ({
    direction,
    mode,
    date: '2026-10-14',
    loadMs: 1234,
    peakRssMb: 900,
    aggregate: {
      items: 1,
      corpusChrF: 55.5,
      preservedPct: 90,
      meaningPassPct: 80,
      fallbackSegmentPct: 5,
      silentMeaningFailures: 2,
      latency: { p50: 100, p95: 200, max: 300 },
      polarity: {
        negation: { n: 1, pass: 1, pct: 100, silentFailures: 0 },
        approve: { n: 0, pass: 0, pct: null, silentFailures: 0 },
        reject: { n: 1, pass: 0, pct: 0, silentFailures: 1 },
        revoke: { n: 1, pass: 1, pct: 100, silentFailures: 0 },
      },
      perCategory: {
        plain: { items: 1, corpusChrF: 55.5, preservedPct: null, meaningPassPct: 80, fallbackSegmentPct: 0 },
      },
    },
    items: [item('a', ['plain'])],
  });
  const md = renderSummary({
    runs: [run('vi-en', 'raw'), run('vi-en', 'protected')],
    fixtures: { 'vi-en': { items: [{ id: 'a', source: 'x' }] } },
  });
  assert.match(md, /^# /m);
  assert.match(md, /\| raw \| protected \|/);
  assert.match(md, /Corpus chrF/);
  assert.match(md, /55\.5/);
  assert.match(md, /n\/a/, 'null percentages render as n/a');
});

test('serializeRun keeps one item per line and drops sources/references', () => {
  const text = serializeRun({
    direction: 'vi-en',
    mode: 'raw',
    items: [
      { id: 'a', source: 'SRC', reference: 'REF', output: 'o' },
      { id: 'b', output: 'p' },
    ],
  });
  const lines = text.split('\n');
  assert.ok(lines.some((l) => l.includes('"id":"a"') && l.includes('"output":"o"')));
  assert.ok(!text.includes('SRC') && !text.includes('REF'));
  assert.doesNotThrow(() => JSON.parse(text));
});
