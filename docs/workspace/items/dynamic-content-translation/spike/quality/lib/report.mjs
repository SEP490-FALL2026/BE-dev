// Result filtering, serialization and Markdown summary (pure).
import os from 'node:os';
import { POLARITY_CATEGORIES } from './metrics.mjs';

const HOME_PATTERNS = [/[A-Za-z]:\\Users\\[^\\"\s]+/g, /[A-Za-z]:\/Users\/[^/"\s]+/g, /\/home\/[^/"\s]+/g, /\/Users\/[^/"\s]+/g];

function scrubString(s) {
  let out = s;
  const home = os.homedir();
  if (home) {
    out = out.split(home).join('<home>').split(home.replaceAll('\\', '/')).join('<home>');
  }
  for (const re of HOME_PATTERNS) out = out.replace(re, '<home>');
  return out;
}

export function scrub(value) {
  if (typeof value === 'string') return scrubString(value);
  if (Array.isArray(value)) return value.map(scrub);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, scrub(v)]));
  }
  return value;
}

// Pretty header, one item per line; sources and references are never written (they live in fixtures/).
export function serializeRun(run) {
  const { items = [], ...head } = scrub(run);
  const headJson = JSON.stringify(head, null, 2).replace(/\n}$/, '');
  const lines = items.map((i) => {
    const { source, reference, ...rest } = i;
    return '    ' + JSON.stringify(rest);
  });
  return `${headJson},\n  "items": [\n${lines.join(',\n')}\n  ]\n}\n`;
}

export function worstErrors(runs, fixtures, n = 10) {
  const rows = [];
  for (const run of runs) {
    const byId = new Map((fixtures[run.direction]?.items || []).map((f) => [f.id, f]));
    for (const it of run.items) {
      const silentMeaning = it.meaning.hasChecks && !it.meaning.pass && it.counts.fallback === 0;
      const presFail = it.hasProtected && !it.preserved.all;
      if (!silentMeaning && !presFail) continue;
      const polarity = it.categories.find((c) => POLARITY_CATEGORIES.includes(c));
      const what = [];
      if (silentMeaning) {
        if (it.meaning.failedContain?.length) what.push(`missing: ${it.meaning.failedContain.join('; ')}`);
        if (it.meaning.failedNotContain?.length) what.push(`forbidden present: ${it.meaning.failedNotContain.join('; ')}`);
      }
      if (presFail) what.push(`protected term altered: ${it.preserved.missing.join('; ')}`);
      const score =
        (polarity && silentMeaning ? 1000 : 0) +
        (silentMeaning ? 100 : 0) +
        (presFail ? 50 + 10 * it.preserved.missing.length : 0) +
        (it.meaning.failedContain?.length || 0) +
        (it.meaning.failedNotContain?.length || 0);
      rows.push({
        direction: run.direction,
        mode: run.mode,
        id: it.id,
        category: polarity || it.categories.find((c) => c !== 'plain') || it.categories[0],
        what: what.join(' | '),
        source: byId.get(it.id)?.source ?? '',
        output: it.output,
        score,
      });
    }
  }
  rows.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  return rows.slice(0, n);
}

const fmt = (v, d = 1) => (v === null || v === undefined || Number.isNaN(v) ? 'n/a' : typeof v === 'number' ? v.toFixed(d) : String(v));
const cut = (s, n) => {
  const one = String(s).replace(/\s+/g, ' ').replace(/\|/g, '\\|');
  return one.length > n ? `${one.slice(0, n - 1)}…` : one;
};

export function renderSummary({ runs, fixtures }) {
  const out = [];
  const date = runs[0]?.date ?? '';
  out.push('# Translation quality spike: summary', '');
  out.push(`Run date: ${date}. Synthetic fixtures; references are AI drafts (not human gold); one machine. See README.md for definitions and caveats.`, '');
  const env = runs[0]?.environment;
  if (env) out.push(`Environment: ${env.os}, ${env.cpuModel} (${env.cpuCount} logical CPUs, ${env.totalMemGb} GB RAM), Node ${env.node}, @huggingface/transformers ${env.transformers}.`, '');

  for (const direction of ['vi-en', 'en-vi']) {
    const dRuns = runs.filter((r) => r.direction === direction);
    if (dRuns.length === 0) continue;
    const modes = ['raw', 'protected'].filter((m) => dRuns.some((r) => r.mode === m));
    const get = (m) => dRuns.find((r) => r.mode === m);
    out.push(`## ${direction}`, '');
    out.push(`| Metric | ${modes.join(' | ')} |`, `|---|${modes.map(() => '---:').join('|')}|`);
    const row = (label, f) => out.push(`| ${label} | ${modes.map((m) => f(get(m))).join(' | ')} |`);
    row('Items', (r) => String(r.aggregate.items));
    row('Corpus chrF', (r) => fmt(r.aggregate.corpusChrF));
    row('Items with all protected terms preserved (%)', (r) => fmt(r.aggregate.preservedPct));
    row('Meaning checks passed (%)', (r) => fmt(r.aggregate.meaningPassPct));
    for (const c of POLARITY_CATEGORIES) row(`${c} checks passed (%)`, (r) => `${fmt(r.aggregate.polarity[c].pct)} (n=${r.aggregate.polarity[c].n})`);
    row('Segments fallen back to original (%)', (r) => fmt(r.aggregate.fallbackSegmentPct));
    row('Silent meaning failures (items)', (r) => String(r.aggregate.silentMeaningFailures));
    row('Silent polarity failures (items)', (r) => String(POLARITY_CATEGORIES.reduce((a, c) => a + r.aggregate.polarity[c].silentFailures, 0)));
    row('Latency p50 per item (ms)', (r) => fmt(r.aggregate.latency.p50, 0));
    row('Latency p95 per item (ms)', (r) => fmt(r.aggregate.latency.p95, 0));
    row('Model load time (s)', (r) => fmt(r.loadMs / 1000, 2));
    row('Peak RSS of process (MB)', (r) => fmt(r.peakRssMb, 0));
    out.push('');
    for (const m of modes) {
      const r = get(m);
      out.push(`### ${direction} ${m}: per category`, '', '| Category | Items | chrF | Protected preserved % | Meaning passed % | Fallback seg % |', '|---|---:|---:|---:|---:|---:|');
      for (const [cat, s] of Object.entries(r.aggregate.perCategory)) {
        out.push(`| ${cat} | ${s.items} | ${fmt(s.corpusChrF)} | ${fmt(s.preservedPct)} | ${fmt(s.meaningPassPct)} | ${fmt(s.fallbackSegmentPct)} |`);
      }
      out.push('');
    }
  }

  const table = (rows) => {
    if (rows.length === 0) return ['None.', ''];
    const t = ['| # | Direction / mode | Item | Category | Failure | Source | Output |', '|---:|---|---|---|---|---|---|'];
    rows.forEach((w, i) => t.push(`| ${i + 1} | ${w.direction} ${w.mode} | ${w.id} | ${w.category} | ${cut(w.what, 100)} | ${cut(w.source, 110)} | ${cut(w.output, 130)} |`));
    return [...t, ''];
  };
  out.push('## Worst observed errors, protected mode (automatic ranking; silent = not caught by fallback)', '');
  out.push(...table(worstErrors(runs.filter((r) => r.mode === 'protected'), fixtures, 10)));
  out.push('## Worst observed errors, raw mode (top 10)', '');
  out.push(...table(worstErrors(runs.filter((r) => r.mode === 'raw'), fixtures, 10)));
  return out.join('\n');
}
