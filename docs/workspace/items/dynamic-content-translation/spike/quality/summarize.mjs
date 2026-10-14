#!/usr/bin/env node
// Rebuilds results/summary.md from the canonical result files of one date
// (no model needed).  Usage: node summarize.mjs [YYYY-MM-DD]   (default: newest date present)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderSummary } from './lib/report.mjs';
import { BEGIN, END, replaceMarked } from './tools/summary-431.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const resultsDir = path.join(here, 'results');
const files = fs.readdirSync(resultsDir).filter((f) => /^\d{4}-\d\d-\d\d-(vi-en|en-vi)-(raw|protected)\.json$/.test(f));
const date = process.argv[2] || files.map((f) => f.slice(0, 10)).sort().pop();
const runs = files
  .filter((f) => f.startsWith(date))
  .sort()
  .map((f) => JSON.parse(fs.readFileSync(path.join(resultsDir, f), 'utf8')));
const fixtures = {};
for (const d of ['vi-en', 'en-vi']) fixtures[d] = JSON.parse(fs.readFileSync(path.join(here, 'fixtures', `${d}.json`), 'utf8'));
const summaryPath = path.join(resultsDir, 'summary.md');
// keep the generated 4.3.1 section (tools/summary-431.mjs) if there is one
const old = fs.existsSync(summaryPath) ? fs.readFileSync(summaryPath, 'utf8') : '';
const b = old.indexOf(BEGIN);
const e = old.indexOf(END);
let next = renderSummary({ runs, fixtures });
if (b !== -1 && e > b) next = replaceMarked(next, `${old.slice(b, e + END.length)}\n`);
fs.writeFileSync(summaryPath, next, 'utf8');
console.log(`summary.md rebuilt from ${runs.length} result file(s) of ${date}`);
