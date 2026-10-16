#!/usr/bin/env node
// Builds results/flags-4.3.1.json: every TRANSLATED (non-fallback) field of a protected-mode 4.3.1 run whose automatic
// keyword check (mustContain / mustNotContain) or protected-term check failed, with source / output / reference so a
// human or the coordinator can adjudicate. This tool does NOT adjudicate and nothing here is "human reviewed".
//   node tools/flags-431.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fieldFlags } from '../lib/metrics.mjs';

export const CAVEAT =
  'Automatic keyword flags only: a flag means a mustContain / mustNotContain / protected-term check failed on a translated field; it may be a valid synonym (false alarm) or a real error. These flags are not adjudicated and have not been human reviewed. References are AI drafts.';

export function buildFlags(runs, fixtures) {
  const groups = [];
  for (const r of runs) {
    if (r.mode !== 'protected') continue;
    const fx = fixtures[`${r.fixtureSet}|${r.direction}`];
    const lookup = new Map((fx?.items ?? []).map((i) => [i.id, i]));
    const flags = fieldFlags(r.items, lookup).map((f) => {
      const groupsFailed = f.failed.meaning?.failedContain ?? [];
      // textual dates are now kept verbatim on purpose, but some older fixture checks expect a localised month name
      const dateNote = groupsFailed.some((g) => /november|tháng/i.test(g));
      return dateNote ? { ...f, note: 'verbatim-date policy: the keyword group expects a localised month name, dates are intentionally restored as written' } : f;
    });
    groups.push({ set: r.fixtureSet, direction: r.direction, translatedFields: r.fields.translated, flags });
  }
  groups.sort((a, b) => a.set.localeCompare(b.set) || a.direction.localeCompare(b.direction));
  return { caveat: CAVEAT, total: groups.reduce((a, g) => a + g.flags.length, 0), groups };
}

const here = path.dirname(fileURLToPath(import.meta.url));
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const quality = path.join(here, '..');
  const resultsDir = path.join(quality, 'results');
  const tag = process.argv.includes('--tag') ? process.argv[process.argv.indexOf('--tag') + 1] : '4.3.1b';
  const outName = process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : 'flags-4.3.1.json';
  const files = fs
    .readdirSync(resultsDir)
    .filter((f) => f.includes(`-${tag}-`) && /^\d{4}-\d\d-\d\d-4\.3\.1\w*-(main|heldout)-(vi-en|en-vi)-protected\.json$/.test(f))
    .sort();
  const runs = files.map((f) => JSON.parse(fs.readFileSync(path.join(resultsDir, f), 'utf8')));
  const fixtures = {};
  for (const set of ['main', 'heldout']) {
    for (const d of ['vi-en', 'en-vi']) {
      fixtures[`${set}|${d}`] = JSON.parse(fs.readFileSync(path.join(quality, 'fixtures', set === 'main' ? `${d}.json` : `heldout-${d}.json`), 'utf8'));
    }
  }
  const out = buildFlags(runs, fixtures);
  fs.writeFileSync(path.join(resultsDir, outName), JSON.stringify({ tag, ...out }, null, 2) + '\n', 'utf8');
  console.log(`${outName} (tag ${tag}):${out.total} flagged translated fields from ${files.length} run file(s)`);
}
