// pnpm test:trace
// Traceability between three sources that must agree:
//   1. the acceptance IDs of the verification guide (section 2),
//   2. the package each ID belongs to (section 7 of the delivery plan),
//   3. the test titles in the code that carry those IDs.
// Structural problems (an ID no package owns, an ID in a test that does not exist, a package that
// does not exist) fail the run. A package whose IDs have no test yet is not a failure: it is the
// to-do list. Use --package <id> --require to make "all IDs of this package are covered" a gate.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RUNNERS } from './runners.mjs';

const BASE_ID = /^(?:[NRG]\d{2}|[UPEID]\d{2}T)$/;
const ID_IN_TEXT = /\b(?:[NRG]\d{2}|[UPEID]\d{2}T)\b/g;
const SUB_IN_TEXT = /\b(?:[NRG]\d{2}[a-z]|[UPEID]\d{2}T-\d{2})\b/g;
const PACKAGE = /\bB\d+[a-z]?(?:-\d)?\b/g;
const TITLE_ID = /\b([NRG]\d{2}[a-z]?|[UPEID]\d{2}T(?:-\d{2})?)(?:\/(B\d+[a-z]?(?:-\d)?))?\b/g;
const TITLE_LINE = /\b(?:describe|it|test)(?:\.\w+)*(?:\.each\([^)]*\))?\s*\(/;

const baseOf = (id) => id.replace(/-\d{2}$/, '').replace(/^([NRG]\d{2})[a-z]$/, '$1');
const pad = (n) => String(n).padStart(2, '0');

function section(text, from, to) {
  const start = text.indexOf(from);
  if (start < 0) throw new Error(`section not found: ${from}`);
  const end = to ? text.indexOf(to, start + from.length) : -1;
  return text.slice(start, end < 0 ? undefined : end);
}

function firstCells(markdown) {
  return markdown
    .split(/\r?\n/)
    .filter((line) => line.startsWith('|'))
    .map((line) =>
      line
        .split('|')
        .slice(1, -1)
        .map((cell) => cell.trim()),
    );
}

/** Acceptance IDs defined by the verification guide, with the sub-IDs that some of them declare. */
export function parseMatrix(verification) {
  const body = section(verification, '## 2. Test matrix', '## 3.');
  const ids = new Set();
  const subs = new Map();
  const addSub = (sub) => {
    const base = baseOf(sub);
    subs.set(base, (subs.get(base) ?? new Set()).add(sub));
  };

  for (const cells of firstCells(body)) if (BASE_ID.test(cells[0])) ids.add(cells[0]);
  for (const cells of firstCells(body))
    if (/^N\d{2}[a-z]$/.test(cells[0]) && ids.has(baseOf(cells[0]))) addSub(cells[0]);
  for (const m of body.matchAll(/\b([A-Z]\d{2}T)-(\d{2})\s*(?:…|–|\.\.\.)\s*\1-(\d{2})\b/g))
    for (let n = Number(m[2]); n <= Number(m[3]); n++) addSub(`${m[1]}-${pad(n)}`);
  for (const sub of body.match(/\b[UPEID]\d{2}T-\d{2}\b/g) ?? []) addSub(sub);
  return { ids, subs };
}

/** Which package(s) first implement each ID, from the "Test IDs → packages" table. */
export function parsePackageMap(plan) {
  // Stop at the next heading of any level: section 7.1 holds a different table.
  const from = plan.indexOf('## 7. Test IDs');
  if (from < 0) throw new Error('section not found: ## 7. Test IDs');
  const rest = plan.slice(from + 3);
  const next = rest.search(/\n#{2,3} /);
  const rows = firstCells(next < 0 ? rest : rest.slice(0, next)).slice(2);
  const map = new Map();
  for (const [idCell, packageCell] of rows) {
    const found = new Set();
    const cell = idCell.replace(/\([^)]*\)/g, ' ');
    for (const m of cell.matchAll(/\b([A-Z])(\d{2})(T?)\s*[–-]\s*([A-Z])?(\d{2})(T?)\b/g)) {
      if (m[4] && m[4] !== m[1]) continue;
      for (let n = Number(m[2]); n <= Number(m[5]); n++) found.add(`${m[1]}${pad(n)}${m[3]}`);
    }
    const rest = cell.replace(/\b[A-Z]\d{2}T?\s*[–-]\s*[A-Z]?\d{2}T?\b/g, ' ');
    for (const id of rest.match(ID_IN_TEXT) ?? []) found.add(id);
    const packages = [...packageCell.replace(/\([^)]*\)/g, ' ').matchAll(PACKAGE)].map((m) => m[0]);
    for (const id of found) map.set(id, new Set([...(map.get(id) ?? []), ...packages]));
  }
  return map;
}

export function packagesDefinedByPlan(plan) {
  return new Set([...plan.matchAll(/^### (B\d+[a-z]?(?:-\d)?)\b/gm)].map((m) => m[1]));
}

/**
 * IDs written in test titles: `it('N10 — ...')`, `describe('E07T-03 — ...')`. An ID that several
 * packages implement (N19, D01T, U05T, ...) names the package too: `it('N19/B1a — ...')`.
 * Returns id -> { paths, packages } where `packages` are the package tokens found on the same title line.
 */
export function scanTitles(files) {
  const found = new Map();
  for (const { path, text } of files) {
    for (const line of text.split(/\r?\n/)) {
      if (!TITLE_LINE.test(line)) continue;
      for (const match of line.matchAll(TITLE_ID)) {
        const [, id, pkg] = match;
        const entry = found.get(id) ?? { paths: new Set(), packages: new Set() };
        entry.paths.add(path);
        if (pkg) entry.packages.add(pkg);
        found.set(id, entry);
      }
    }
  }
  return found;
}

export function buildReport({ verification, plan, tests }) {
  const { ids, subs } = parseMatrix(verification);
  const owners = parsePackageMap(plan);
  const known = packagesDefinedByPlan(plan);
  const titles = scanTitles(tests);

  // An ID owned by several packages is covered for a package only by a title that names it (`N19/B1a`).
  const covered = (id, pkg) => {
    const shared = (owners.get(id)?.size ?? 0) > 1;
    return [id, ...(subs.get(id) ?? [])].some((key) => {
      const entry = titles.get(key);
      return entry && (!shared || entry.packages.has(pkg));
    });
  };
  const problems = [];
  for (const id of ids)
    if (!owners.has(id))
      problems.push(`${id} is in the verification guide but no package owns it (delivery plan section 7)`);
  for (const id of owners.keys())
    if (!ids.has(id)) problems.push(`${id} is assigned to a package but is not defined in the verification guide`);
  for (const [id, packages] of owners)
    for (const pkg of packages)
      if (!known.has(pkg)) problems.push(`${id} is assigned to ${pkg}, which the delivery plan does not define`);
  for (const [id, { paths, packages }] of titles) {
    const base = baseOf(id);
    if (!ids.has(base) || (base !== id && !(subs.get(base) ?? new Set()).has(id)))
      problems.push(`test title uses ${id}, which the verification guide does not define (${[...paths].join(', ')})`);
    for (const pkg of packages)
      if (!(owners.get(base) ?? new Set()).has(pkg))
        problems.push(
          `test title tags ${id} with ${pkg}, but the delivery plan assigns ${base} to ${[...(owners.get(base) ?? [])].join(', ') || 'no package'}`,
        );
  }

  const byPackage = new Map();
  for (const [id, packages] of owners) {
    for (const pkg of packages) {
      const row = byPackage.get(pkg) ?? { assigned: [], covered: [], missing: [] };
      row.assigned.push(id);
      (covered(id, pkg) ? row.covered : row.missing).push(id);
      byPackage.set(pkg, row);
    }
  }
  const order = [...known];
  const rows = [...byPackage.entries()].sort(([a], [b]) => order.indexOf(a) - order.indexOf(b));
  return { ids, subs, owners, titles, rows, problems, covered };
}

export function renderText(report, only) {
  const rows = report.rows.filter(([pkg]) => !only || pkg === only);
  const lines = [`${'Package'.padEnd(8)} ${'IDs'.padStart(4)} ${'Covered'.padStart(8)}  Not covered yet`];
  for (const [pkg, row] of rows)
    lines.push(
      `${pkg.padEnd(8)} ${String(row.assigned.length).padStart(4)} ${String(row.covered.length).padStart(8)}  ${row.missing.join(' ') || '-'}`,
    );
  const total = new Set(rows.flatMap(([, row]) => row.assigned));
  const done = new Set(rows.flatMap(([, row]) => row.covered));
  lines.push('', `${done.size}/${total.size} acceptance IDs have a test title that carries them.`);
  return lines.join('\n');
}

export function renderMarkdown(report, generatedAt) {
  const lines = [
    '<!-- Generated by `pnpm test:trace -- --write`. Do not edit by hand. -->',
    '# Acceptance ID coverage',
    '',
    `Generated ${generatedAt}. A package's ID is "covered" when a test title in the code carries it; it says nothing about the test passing. Run the suites for that.`,
    '',
    '| Package | IDs | Covered | Not covered yet |',
    '| --- | ---: | ---: | --- |',
  ];
  for (const [pkg, row] of report.rows)
    lines.push(`| ${pkg} | ${row.assigned.length} | ${row.covered.length} | ${row.missing.join(' ') || '-'} |`);
  const total = new Set(report.rows.flatMap(([, row]) => row.assigned));
  const done = new Set(report.rows.flatMap(([, row]) => row.covered));
  lines.push('', `**${done.size}/${total.size}** acceptance IDs carried by a test title.`);
  if (report.problems.length) lines.push('', '## Structural problems', ...report.problems.map((p) => `- ${p}`));
  return `${lines.join('\n')}\n`;
}

function walk(root, dir) {
  return readdirSync(join(root, dir), { withFileTypes: true }).flatMap((entry) => {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) return ['node_modules', 'generated', 'dist'].includes(entry.name) ? [] : walk(root, path);
    return entry.name.endsWith('.ts') ? [path] : [];
  });
}

export function loadTests(root) {
  const dirs = RUNNERS.flatMap((runner) => runner.roots);
  return dirs
    .flatMap((dir) => {
      try {
        return walk(root, dir);
      } catch {
        return [];
      }
    })
    .filter((path) => RUNNERS.some((runner) => path.endsWith(runner.suffix)))
    .map((path) => ({ path, text: readFileSync(join(root, path), 'utf8') }));
}

export function main(args, root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')) {
  const flag = (name) => args.includes(name);
  const value = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
  const only = value('--package');
  const report = buildReport({
    verification: readFileSync(join(root, 'docs/guides/native-identity-verification.md'), 'utf8'),
    plan: readFileSync(join(root, 'docs/architecture/native-delivery-plan.md'), 'utf8'),
    tests: loadTests(root),
  });

  console.log(renderText(report, only));
  const out = value('--write');
  if (out) writeFileSync(resolve(root, out), renderMarkdown(report, new Date().toISOString().slice(0, 10)), 'utf8');

  let failed = false;
  if (report.problems.length) {
    console.error(`\nTraceability FAILED (${report.problems.length}):`);
    for (const problem of report.problems) console.error(`  - ${problem}`);
    failed = true;
  }
  if (flag('--require')) {
    if (!only) throw new Error('--require needs --package <id>');
    const row = report.rows.find(([pkg]) => pkg === only)?.[1];
    if (!row) {
      console.error(`\nPackage ${only} owns no acceptance IDs.`);
      failed = true;
    } else if (row.missing.length) {
      console.error(
        `\n${only}: ${row.missing.length} acceptance ID(s) have no test title yet: ${row.missing.join(' ')}`,
      );
      failed = true;
    }
  }
  return failed ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  process.exitCode = main(process.argv.slice(2));
