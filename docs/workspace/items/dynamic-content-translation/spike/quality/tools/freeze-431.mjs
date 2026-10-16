#!/usr/bin/env node
// Writes (or, with --check, verifies) results/freeze-4.3.1.json: sha256 of every lib/*.mjs and of the four fixture files
// that are used by the 4.3.1 run. Written BEFORE the benchmark run; --check afterwards proves nothing was tuned in between.
//   node tools/freeze-431.mjs [--tag 4.3.1b]   write the freeze record (default tag 4.3.1)
//   node tools/freeze-431.mjs --check    compare the current files with the record (exit 1 on any difference)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const quality = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const tagIdx = process.argv.indexOf('--tag');
const tag = tagIdx !== -1 ? process.argv[tagIdx + 1] : '4.3.1';
const target = path.join(quality, 'results', `freeze-${tag}.json`);

export function currentHashes() {
  const lib = Object.fromEntries(
    fs
      .readdirSync(path.join(quality, 'lib'))
      .filter((f) => f.endsWith('.mjs'))
      .sort()
      .map((f) => [`lib/${f}`, sha(path.join(quality, 'lib', f))]),
  );
  const fixtures = Object.fromEntries(['vi-en.json', 'en-vi.json', 'heldout-vi-en.json', 'heldout-en-vi.json'].map((f) => [`fixtures/${f}`, sha(path.join(quality, 'fixtures', f))]));
  return { lib, fixtures };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const cur = currentHashes();
  if (process.argv.includes('--check')) {
    const rec = JSON.parse(fs.readFileSync(target, 'utf8'));
    const diffs = [];
    for (const group of ['lib', 'fixtures']) {
      for (const k of new Set([...Object.keys(rec[group]), ...Object.keys(cur[group])])) if (rec[group][k] !== cur[group][k]) diffs.push(k);
    }
    console.log(diffs.length === 0 ? 'freeze check: OK, no lib or fixture file changed since the freeze' : `freeze check: CHANGED ${diffs.join(', ')}`);
    process.exit(diffs.length === 0 ? 0 : 1);
  }
  const rec = { frozenAt: new Date().toISOString(), note: 'lib/*.mjs and the fixture files as they were BEFORE the 4.3.1 benchmark run. Guards must not be tuned after looking at the results.', ...cur };
  fs.writeFileSync(target, JSON.stringify(rec, null, 2) + '\n', 'utf8');
  console.log(`wrote results/freeze-${tag}.json (${Object.keys(cur.lib).length} lib files, ${Object.keys(cur.fixtures).length} fixture files)`);
}
