import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildFlags } from './tools/flags-431.mjs';
import { renderSection431, replaceMarked, BEGIN, END } from './tools/summary-431.mjs';

const item = (id, categories, extra = {}) => ({
  id,
  categories,
  output: 'out',
  hasProtected: false,
  preserved: { all: true, missing: [] },
  meaning: { pass: true, hasChecks: true, failedContain: [], failedNotContain: [] },
  status: 'TRANSLATED',
  reason: null,
  counts: { total: 1, translated: 1, fallback: 0 },
  latencyMs: 100,
  segmentMs: [50],
  ...extra,
});

const run = (direction, mode, set, items) => ({
  date: '2026-10-15',
  tag: '4.3.1',
  fixtureSet: set,
  direction,
  mode,
  loadMs: 2000,
  peakRssMb: 700,
  environment: { os: 'Windows', cpuModel: 'cpu', cpuCount: 8, totalMemGb: 16, node: 'v24', transformers: '4.3.1' },
  lockfile: { sha256: 'abc123', versions: { 'onnxruntime-node': '1.30.0' } },
  libSha256: { 'lib/a.mjs': 'dead' },
  fields: {
    items: items.length,
    notNeeded: 0,
    translated: 1,
    translatedPct: 50,
    fallback: { n: 1, pct: 50, byReason: { placeholder: 1, polarity: 0, too_long: 0, max_new_tokens: 0, other: 0 } },
    chrF: { corpus: 40.5, translatedOnly: 60.2 },
    preservation: { translatedPct: 100, n: 1 },
    automaticFlags: { translatedFields: 1, meaningFlags: 1, meaningFlagPct: 100, preservationFlags: 0, polarity: { negation: { n: 1, flags: 1 }, approve: { n: 0, flags: 0 }, reject: { n: 0, flags: 0 }, revoke: { n: 0, flags: 0 } } },
    latency: { field: { p50: 100, p95: 200, max: 300, n: 2 }, segment: { p50: 50, p95: 60, max: 70, n: 2 } },
  },
  items,
});

test('buildFlags lists translated fields whose keyword/preservation check failed, grouped by set and direction, never fallbacks', () => {
  const items = [
    item('a', ['negation'], { output: 'bad out', meaning: { pass: false, hasChecks: true, failedContain: ['not | no'], failedNotContain: [] } }),
    item('b', ['plain']),
    item('c', ['approve'], { status: 'NOT_TRANSLATED', reason: 'QUALITY_GATE', meaning: { pass: false, hasChecks: true, failedContain: ['approv'], failedNotContain: [] } }),
    item('d', ['date'], { output: 'x', meaning: { pass: false, hasChecks: true, failedContain: ['november'], failedNotContain: [] } }),
  ];
  const fixtures = { 'main|vi-en': { items: [{ id: 'a', source: 'SRC-A', reference: 'REF-A' }, { id: 'd', source: 'SRC-D', reference: 'REF-D' }] } };
  const out = buildFlags([run('vi-en', 'protected', 'main', items), run('vi-en', 'raw', 'main', items)], fixtures);
  assert.equal(out.groups.length, 1, 'raw runs are ignored');
  assert.equal(out.groups[0].set, 'main');
  assert.equal(out.groups[0].direction, 'vi-en');
  assert.deepEqual(out.groups[0].flags.map((f) => f.id), ['a', 'd']);
  assert.equal(out.groups[0].flags[0].source, 'SRC-A');
  assert.equal(out.groups[0].flags[0].reference, 'REF-A');
  assert.equal(out.groups[0].flags[0].output, 'bad out');
  assert.equal(out.total, 2);
  assert.match(out.caveat, /automatic/i);
  assert.match(out.caveat, /not (been )?(human|adjudicated)/i);
  assert.match(out.groups[0].flags[1].note, /verbatim-date/);
  assert.equal(out.groups[0].flags[0].note, undefined);
});

test('renderSection431 renders a marked markdown section with both modes, reasons, flags and latency', () => {
  const items = [item('a', ['negation'])];
  const md = renderSection431({
    runs: [run('vi-en', 'raw', 'main', items), run('vi-en', 'protected', 'main', items), run('vi-en', 'protected', 'heldout', items)],
    baseline: [],
  });
  assert.ok(md.startsWith(BEGIN));
  assert.ok(md.trimEnd().endsWith(END));
  assert.match(md, /## 4\.3\.1/);
  assert.match(md, /vi-en/);
  assert.match(md, /\| raw \| protected \|/);
  assert.match(md, /Fields translated \(%\)/);
  assert.match(md, /placeholder/);
  assert.match(md, /Automatic flags/);
  assert.match(md, /40\.5/);
  assert.match(md, /abc123/);
  assert.match(md, /held-out/i);
});

test('replaceMarked replaces an existing marked block or appends it, leaving the rest untouched', () => {
  const block = `${BEGIN}\nNEW\n${END}\n`;
  assert.equal(replaceMarked('# Baseline\ntext\n', block), `# Baseline\ntext\n\n${block}`);
  const withOld = `# Baseline\ntext\n\n${BEGIN}\nOLD\n${END}\n`;
  assert.equal(replaceMarked(withOld, block), `# Baseline\ntext\n\n${block}`);
  assert.ok(replaceMarked(withOld, block).startsWith('# Baseline\ntext\n'));
});

test('renderSection431 with several tags renders one block per tag, labelled, and compares the first tag with the baseline', () => {
  const items = [item('a', ['negation'])];
  const b = (tag) => ({ ...run('vi-en', 'protected', 'main', items), tag });
  const md = renderSection431({ runs: [b('4.3.1b'), b('4.3.1')], baseline: [], tags: ['4.3.1b', '4.3.1'], labels: { '4.3.1b': 'final', '4.3.1': 'run 1' } });
  assert.match(md, /\[4\.3\.1b\] .*final/);
  assert.match(md, /\[4\.3\.1\] .*run 1/);
  assert.ok(md.indexOf('[4.3.1b]') < md.indexOf('[4.3.1] '));
});
