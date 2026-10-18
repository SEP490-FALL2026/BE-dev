import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const read = (file) => readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
const inside = (root, file) => {
  const path = relative(root, file);
  return path === '' || (!path.startsWith('..') && !isAbsolute(path));
};

// Rules use inline Markdown links and ATX headings. Ignore examples in code fences
// and inline code; reference-style links are rejected rather than silently missed.
export function prose(text) {
  let fence;
  return text
    .split(/\r?\n/)
    .map((line) => {
      const marker = line.match(/^\s{0,3}(`{3,}|~{3,})/);
      if (marker) {
        if (!fence) fence = marker[1];
        else if (marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = undefined;
        return '';
      }
      return fence ? '' : line;
    })
    .join('\n');
}

export function anchors(text) {
  const ids = new Set();
  for (const match of prose(text).matchAll(/^\s{0,3}#{1,6}\s+(.+?)\s*#*$/gm)) {
    const base = match[1]
      .toLowerCase()
      .replace(/<[^>]*>/g, '')
      .replace(/[^\p{L}\p{M}\p{N}_\-\s]/gu, '')
      .replace(/\s/g, '-');
    let id = base;
    for (let n = 1; ids.has(id); n++) id = `${base}-${n}`;
    ids.add(id);
  }
  for (const match of prose(text).matchAll(/\b(?:id|name)=["']([^"']+)["']/g)) ids.add(match[1]);
  return ids;
}

function markdownFiles(directory, excluded = new Set()) {
  if (excluded.has(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? markdownFiles(path, excluded) : entry.name.endsWith('.md') ? [path] : [];
  });
}

const SPEC_SECTIONS = [
  'Business outcome',
  'Primary Story/AC',
  'Supporting references',
  'Explicit out of scope',
  'Dependencies and blockers',
  'Ownership: module, data, API',
  'Behavior and design',
  'Test matrix',
  'Definition of Done',
];
const PLAN_SECTIONS = ['Before coding', 'Tasks', 'Verification and handoff'];
const TASK_FIELDS = ['Files', 'Depends on', 'Acceptance', 'Verify'];
const DESIGN_STATUSES = ['not-started', 'draft', 'ready', 'blocked', 'superseded'];
const IMPLEMENTATION_STATUSES = [
  'not-started',
  'in-progress',
  'verified',
  'merged-dev',
  'owner-review',
  'accepted',
  'released',
  'blocked',
];
const MAX_PRIMARY_STORIES = 3;

/** Level-2 sections of a Markdown file (outside code fences), keyed by heading text. */
function sections(text) {
  const result = new Map();
  let current;
  for (const line of prose(text).split('\n')) {
    const heading = line.match(/^##\s+(.+?)\s*#*$/);
    if (heading) result.set((current = heading[1]), []);
    else if (current !== undefined) result.get(current).push(line);
  }
  return result;
}

/** Data rows of the first Markdown table in `lines`, as arrays of trimmed cells. */
function tableRows(lines) {
  const rows = lines.filter((line) => /^\s*\|/.test(line)).map((line) => line.trim().replace(/^\||\|$/g, ''));
  return rows.slice(2).map((row) => row.split('|').map((cell) => cell.trim()));
}

/**
 * Work-item gate (docs/workspace/README.md). Every item folder must have spec.md and plan.md and be registered in the
 * items index. Items NOT in `legacy` must also follow the vertical-slice template: required sections, Docs/BE pins,
 * known status words, at most MAX_PRIMARY_STORIES primary Stories unless a size exception is written, a coverage of
 * `full`/`partial`/`n/a` on every primary row, and Files/Depends on/Acceptance/Verify on every plan task. A legacy
 * entry whose folder no longer exists fails, so the allowlist can only shrink. The gate checks structure; it does not
 * prove that a spec is right.
 */
export function checkWorkItems(root, workItems) {
  const errors = [];
  const directory = resolve(root, workItems.directory);
  if (!existsSync(directory)) return [`Missing work-item directory: ${workItems.directory}`];
  const legacy = new Set(workItems.legacy ?? []);
  const items = readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  for (const name of legacy) if (!items.includes(name)) errors.push(`Stale legacy work item (no folder): ${name}`);
  const index = existsSync(resolve(root, workItems.index)) ? read(resolve(root, workItems.index)) : '';
  if (!index) errors.push(`Missing work-item index: ${workItems.index}`);

  for (const name of items) {
    const label = `${workItems.directory}/${name}`;
    const specPath = resolve(directory, name, 'spec.md');
    const planPath = resolve(directory, name, 'plan.md');
    if (!existsSync(specPath) || !existsSync(planPath)) {
      errors.push(`${label}: needs spec.md and plan.md`);
      continue;
    }
    if (index && !index.includes(`(${name}/spec.md)`)) errors.push(`${label}: not registered in ${workItems.index}`);
    if (legacy.has(name)) continue;

    const spec = read(specPath);
    const plan = read(planPath);
    const specSections = sections(spec);
    for (const section of SPEC_SECTIONS)
      if (!specSections.has(section)) errors.push(`${label}/spec.md: missing section "## ${section}"`);
    const header = prose(spec).split(/\n##\s/)[0];
    if (!/\bDocs\s+`[0-9a-f]{7,40}`/.test(header)) errors.push(`${label}/spec.md: header must pin Docs \`<sha>\``);
    if (!/\bBE\s+`[0-9a-f]{7,40}`/.test(header)) errors.push(`${label}/spec.md: header must pin BE \`<sha>\``);
    const design = header.match(/Thiết kế:\s*`([^`]+)`/);
    if (!design || !DESIGN_STATUSES.includes(design[1]))
      errors.push(`${label}/spec.md: "Thiết kế:" must be one of ${DESIGN_STATUSES.join(', ')}`);

    const primary = tableRows(specSections.get('Primary Story/AC') ?? []);
    if (specSections.has('Primary Story/AC') && primary.length === 0)
      errors.push(`${label}/spec.md: "## Primary Story/AC" needs a table row (use n/a for a technical enabler)`);
    for (const row of primary)
      if (!/^(full|partial|n\/a)$/.test(row[2] ?? ''))
        errors.push(`${label}/spec.md: primary row "${row[0]}" needs coverage full, partial or n/a in column 3`);
    const stories = new Set(primary.flatMap((row) => row[0].match(/US-\d{2}-\d{2}/g) ?? []));
    if (stories.size > MAX_PRIMARY_STORIES && !specSections.has('Size exception'))
      errors.push(
        `${label}/spec.md: ${stories.size} primary Stories; at most ${MAX_PRIMARY_STORIES} without "## Size exception"`,
      );

    const planSections = sections(plan);
    for (const section of PLAN_SECTIONS)
      if (!planSections.has(section)) errors.push(`${label}/plan.md: missing section "## ${section}"`);
    const implementation = prose(plan).match(/Triển khai:\s*`([^`]+)`/);
    if (!implementation || !IMPLEMENTATION_STATUSES.includes(implementation[1]))
      errors.push(`${label}/plan.md: "Triển khai:" must be one of ${IMPLEMENTATION_STATUSES.join(', ')}`);
    // Only `### Task …` blocks are tasks; `### Checkpoint` and other notes under "## Tasks" are not.
    const tasks = (planSections.get('Tasks') ?? [])
      .join('\n')
      .split(/^###\s+/m)
      .slice(1)
      .filter((block) => /^Task\b/i.test(block));
    if (planSections.has('Tasks') && tasks.length === 0)
      errors.push(`${label}/plan.md: "## Tasks" needs at least one "### Task" block`);
    for (const task of tasks) {
      const title = task.split('\n')[0].trim();
      for (const field of TASK_FIELDS)
        if (!new RegExp(`^\\s*-\\s+${field}:\\s*\\S`, 'm').test(task))
          errors.push(`${label}/plan.md: task "${title}" needs "- ${field}:"`);
    }
  }
  return errors;
}

export function checkRepository(root, config, strict = false) {
  root = resolve(root);
  const errors = [];
  const unavailable = new Set();
  const siblings = config.siblings.map((path) => resolve(root, path));
  const rules = resolve(root, config.rules);
  if (!existsSync(rules)) return { errors: [`Missing rules directory: ${rules}`], unavailable: [], files: 0, links: 0 };
  const ruleFiles = markdownFiles(rules);
  const excluded = new Set((config.excludeDirectories ?? []).map((path) => resolve(root, path)));
  const extraFiles = (config.directories ?? []).flatMap((path) => {
    const directory = resolve(root, path);
    if (!existsSync(directory)) {
      errors.push('Missing documentation directory: ' + path);
      return [];
    }
    return markdownFiles(directory, excluded);
  });
  const files = [...new Set([...ruleFiles, ...extraFiles, ...config.files.map((path) => resolve(root, path))])];
  const graph = new Map();
  let links = 0;
  for (const file of files) {
    graph.set(file, new Set());
    if (!existsSync(file)) {
      errors.push(`Missing instruction file: ${file}`);
      continue;
    }
    const text = prose(read(file)).replace(/(`+)[^\n]*?\1/g, '');
    if (/\[[^\]\n]+\]\s*\[[^\]\n]*\]|^\s*\[[^\]\n]+\]:/m.test(text))
      errors.push(`${file}: use inline links, not reference-style links`);
    const references = [
      ...[...text.matchAll(/\[[^\]\n]*\]\(\s*(?:<([^>]+)>|([^\s)]+))(?:\s+"[^"]*")?\s*\)/g)].map((match) => ({
        href: match[1] ?? match[2],
        index: match.index,
      })),
      // Claude Code / Gemini CLI imports are checked like Markdown links.
      ...[...text.matchAll(/^@([^\s]+\.md)[ \t]*$/gm)].map((match) => ({
        href: match[1],
        index: match.index,
      })),
    ];
    for (const { href, index } of references) {
      if (/^(?:https?:|mailto:)/i.test(href)) continue;
      const label = `${relative(root, file)}:${text.slice(0, index).split('\n').length}`;
      if (/^[a-z][a-z\d+.-]*:|^[/\\]/i.test(href)) {
        errors.push(`${label}: non-relative file link ${href}`);
        continue;
      }
      let decoded;
      try {
        decoded = decodeURIComponent(href);
      } catch {
        errors.push(`${label}: invalid URL encoding ${href}`);
        continue;
      }
      const [path, anchor] = decoded.split('#');
      const target = path ? resolve(dirname(file), path) : file;
      graph.get(file).add(target);
      links++;
      const sibling = siblings.find((candidate) => inside(candidate, target));
      if (!inside(root, target) && !sibling) {
        errors.push(`${label}: link outside declared repositories ${href}`);
        continue;
      }
      if (sibling && !existsSync(sibling)) {
        unavailable.add(sibling);
        if (strict) errors.push(`${label}: missing sibling repository ${sibling}`);
        continue;
      }
      if (!existsSync(target)) {
        errors.push(`${label}: missing link target ${href}`);
        continue;
      }
      if (anchor && target.endsWith('.md') && !anchors(read(target)).has(anchor))
        errors.push(`${label}: missing anchor ${href}`);
    }
  }
  const seen = new Set();
  const pending = [resolve(root, config.entry)];
  while (pending.length) {
    const file = pending.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    pending.push(...(graph.get(file) ?? []));
  }
  for (const file of ruleFiles)
    if (!seen.has(file)) errors.push(`Unreachable rule from ${config.entry}: ${relative(root, file)}`);
  // Required entry-point links/imports keep shared instructions reachable.
  for (const [from, to] of config.requiredEdges) {
    if (!graph.get(resolve(root, from))?.has(resolve(root, to))) errors.push(`Missing workflow edge: ${from} -> ${to}`);
  }
  if (config.workItems) errors.push(...checkWorkItems(root, config.workItems));
  return { errors, unavailable: [...unavailable], files: files.length, links };
}

export function main(args) {
  const be = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const config = JSON.parse(read(resolve(be, 'rules-check.config.json')));
  const workspace = args.includes('--workspace');
  if (args.some((arg) => arg !== '--workspace')) throw new Error('Usage: node scripts/check-rules.mjs [--workspace]');
  let failed = false;
  for (const repo of workspace ? config : config.slice(0, 1)) {
    const root = resolve(be, repo.root);
    const result = checkRepository(root, repo, workspace);
    console.log(`${repo.name}: ${result.files} files, ${result.links} links, ${result.errors.length} errors`);
    for (const path of result.unavailable) console.log(`UNAVAILABLE sibling: ${path} (not verified)`);
    for (const error of result.errors) console.error(error);
    failed ||= result.errors.length > 0;
  }
  return failed ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
