#!/usr/bin/env node
// At what sentence length does Opus-MT start to degenerate (repetition / truncation)?
// Builds single sentences of growing length from the fixture clause pool, translates them RAW
// (no protection) and reports tokens, chrF, repeated 4-grams and output/reference length ratio.
// Usage: node tools/length-probe.mjs [--out results/length-probe-<date>.json]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveDirs, loadTransformers, loadDirection } from '../lib/model.mjs';
import { sentenceChrF } from '../lib/chrf.mjs';
import { scrub } from '../lib/report.mjs';
import { longItem } from '../fixtures/src/helpers.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const date = new Date().toISOString().slice(0, 10);
const outIdx = process.argv.indexOf('--out');
const outFile = path.resolve(outIdx > -1 ? process.argv[outIdx + 1] : path.join(root, 'results', `length-probe-${date}.json`));

function maxRepeat4gram(text) {
  const w = text.toLowerCase().split(/\s+/).filter(Boolean);
  const counts = new Map();
  for (let i = 0; i + 4 <= w.length; i++) {
    const g = w.slice(i, i + 4).join(' ');
    counts.set(g, (counts.get(g) || 0) + 1);
  }
  return Math.max(0, ...counts.values());
}

const { depsDir, modelsDir } = resolveDirs();
const { mod } = await loadTransformers(depsDir);
const out = { date, note: 'raw translation of one sentence built from the first N clauses; batch size 1', directions: {} };
for (const direction of ['vi-en', 'en-vi']) {
  const lang = direction.split('-')[0];
  const model = await loadDirection({ direction, mod, modelsDir });
  const rows = [];
  for (const n of [1, 2, 3, 4, 6, 8, 10, 14, 18]) {
    const it = longItem(lang, `probe-${n}`, n);
    const tokens = model.countTokens(it.source);
    const [hyp] = await model.translateBatch([it.source]);
    rows.push({
      clauses: n,
      tokens,
      chrF: Math.round(sentenceChrF(hyp, it.reference) * 100) / 100,
      maxRepeated4gram: maxRepeat4gram(hyp),
      outToRefLength: Math.round((hyp.length / it.reference.length) * 100) / 100,
    });
    console.log(direction, JSON.stringify(rows.at(-1)));
  }
  out.directions[direction] = rows;
}
fs.writeFileSync(outFile, JSON.stringify(scrub(out), null, 1), 'utf8');
console.log('wrote', path.basename(outFile));
process.exit(0);
