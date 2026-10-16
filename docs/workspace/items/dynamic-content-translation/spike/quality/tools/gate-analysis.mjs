#!/usr/bin/env node
// Why does the placeholder gate reject segments?  Re-runs the protected pipeline's model calls
// (one segment at a time, long items skipped) and classifies every gate failure.
// Usage: node tools/gate-analysis.mjs [--out results/gate-analysis-<date>.json]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveDirs, loadTransformers, loadDirection } from '../lib/model.mjs';
import { protectSegment } from '../lib/protect.mjs';
import { segmentText } from '../lib/segmenter.mjs';
import { scrub } from '../lib/report.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(here);
const date = new Date().toISOString().slice(0, 10);
const outIdx = process.argv.indexOf('--out');
const outFile = path.resolve(outIdx > -1 ? process.argv[outIdx + 1] : path.join(root, 'results', `gate-analysis-${date}.json`));

// A "damaged" placeholder is a missing id whose text survives in a broken form such as `x0>`, `<x0`, `[x0>`.
const DAMAGED = /(?:<x\d+(?!\d|>))|(?:(?<!<)x\d+>)|(?:[\[(]x\d+[>\])])/;

const { depsDir, modelsDir } = resolveDirs();
const { mod } = await loadTransformers(depsDir);
const out = { date, note: 'segments of non-long fixture items, protected mode, batch size 1', directions: {} };

for (const direction of ['vi-en', 'en-vi']) {
  const model = await loadDirection({ direction, mod, modelsDir });
  const fx = JSON.parse(fs.readFileSync(path.join(root, 'fixtures', `${direction}.json`), 'utf8'));
  const s = { segments: 0, sentToModel: 0, gateFail: 0, missing: 0, extra: 0, duplicated: 0, missingWithDamagedForm: 0, bySpanCount: {}, examples: [] };
  for (const it of fx.items) {
    if (it.categories.includes('long')) continue;
    for (const seg of segmentText(it.source)) {
      s.segments++;
      const p = protectSegment(seg.text, { direction, knownTerms: it.protected });
      if (p.spans.length === 0 || !/\p{L}/u.test(p.text.replace(/<x\d+>/g, ''))) continue;
      s.sentToModel++;
      const n = p.spans.length;
      s.bySpanCount[n] ??= { sent: 0, failed: 0 };
      s.bySpanCount[n].sent++;
      const [raw] = await model.translateBatch([p.text]);
      const found = [...raw.matchAll(/<x(\d+)>/g)].map((m) => Number(m[1]));
      const ids = p.spans.map((x) => x.id);
      const missing = ids.filter((i) => !found.includes(i));
      const extra = found.filter((i) => !ids.includes(i));
      const dup = ids.filter((i) => found.filter((f) => f === i).length > 1);
      if (!missing.length && !extra.length && !dup.length) continue;
      s.gateFail++;
      s.bySpanCount[n].failed++;
      if (missing.length) s.missing++;
      if (extra.length) s.extra++;
      if (dup.length) s.duplicated++;
      if (missing.length && DAMAGED.test(raw)) s.missingWithDamagedForm++;
      if (s.examples.length < 15) s.examples.push({ id: it.id, protectedText: p.text, modelOutput: raw });
    }
  }
  out.directions[direction] = s;
  console.log(direction, JSON.stringify({ ...s, examples: undefined }));
}
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, JSON.stringify(scrub(out), null, 1), 'utf8');
console.log('wrote', path.basename(outFile));
process.exit(0);
