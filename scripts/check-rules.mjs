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

// Work-item sizing (docs/rules/work-item-sizing.md). Field names are the `- Field:` bullets of each section.
const SIZING_MODES = ['single-story', 'grouped-stories', 'split-story', 'technical-enabler'];
const SIZING_FIELDS = ['Container', 'Mode', 'Outcome and owner', 'Boundaries', 'Not larger', 'Not smaller', 'Siblings'];
const SIZE_EXCEPTION_FIELDS = ['Cohesion', 'Why not split', 'Checkpoints', 'Maximum scope', 'Accepted by'];
/** A value that names nothing: empty, a dash, "none", "n/a", "TBD"… */
const PLACEHOLDER = /^(?:|[-–—?…]|\.{3}|none|n\/a|tbd|todo|không)$/i;
/** A work item: a backticked kebab-case folder name, or a link to an item's spec/plan. */
const ITEM_REFERENCE = /`[a-z0-9]+(?:-[a-z0-9]+)+`|\]\([^)\s]*\/(?:spec|plan)\.md(?:#[^)\s]*)?\)/;
const STORY = /US-\d{2}-\d{2}/g;
/**
 * A roadmap group used as the reason for the size: "all/entire/whole G3", "same G", "one G", "toàn bộ G3", "cùng một
 * G"… The Container field may name the group; the reasoning may not lean on it.
 */
const G_AS_REASON =
  /\b(?:all|entire|whole|every|same|one|single)\b(?:\s+(?:of|the|roadmap|group))*\s+G(?:10|\d)?\b|(?<![\p{L}\p{N}])(?:toàn bộ|tất cả|cả|nguyên|cùng|một)\s+(?:nhóm\s+)?G(?:10|\d)?(?![\p{L}\p{N}])/iu;

/** `- Field: value` bullets of a section, keyed by field name (first occurrence wins). */
function fields(lines) {
  const result = new Map();
  for (const line of lines) {
    const match = line.match(/^\s*-\s+([^:]+?):\s*(.*)$/);
    if (match && !result.has(match[1])) result.set(match[1], match[2].trim());
  }
  return result;
}

/** A field value without a trailing full stop or the backticks around a single token. */
const bare = (value = '') => value.replace(/[.\s]+$/, '').replace(/^`([^`]*)`$/, '$1');

/** Fields missing from `present` or holding only a placeholder. */
function missingFields(present, required) {
  return required.filter((field) => PLACEHOLDER.test(bare(present.get(field))));
}

/**
 * Sizing rules for an item created after GOV.1: a `## Sizing decision` whose mode matches the primary Stories, exact AC
 * ownership on every row, a named owner for every remaining AC, an enabler that claims no Story, a complete size
 * exception, and no reasoning that rests on the roadmap group.
 */
function checkSizing(label, specSections, primary) {
  const errors = [];
  const fail = (message) => errors.push(`${label}/spec.md: ${message}`);

  for (const row of primary) {
    const [story = '', ac = '', coverage = '', remaining = ''] = row;
    const stories = story.match(STORY) ?? [];
    if (coverage === 'full' || coverage === 'partial') {
      if (stories.length !== 1) fail(`${coverage} row "${story}" needs exactly one Story`);
      if (!/\bAC-\d+/.test(ac)) fail(`primary row "${story}" needs the exact AC it owns in column 2`);
    }
    if (coverage === 'full' && !PLACEHOLDER.test(remaining))
      fail(`full row "${story}" must not leave remaining AC; use partial and name the owner`);
    if (coverage === 'partial' && !ITEM_REFERENCE.test(remaining))
      fail(`partial row "${story}" needs the item that owns the remaining AC (\`item-name\` or a spec link)`);
    if (coverage === 'n/a' && stories.length > 0) fail(`n/a row "${story}" must not name a Story`);
  }

  if (!specSections.has('Sizing decision')) {
    fail('missing section "## Sizing decision"');
    return errors;
  }
  const sizingLines = specSections.get('Sizing decision');
  const sizing = fields(sizingLines);
  for (const field of missingFields(sizing, SIZING_FIELDS).filter((field) => field !== 'Siblings'))
    fail(`"## Sizing decision" needs "- ${field}:"`);
  if (!sizing.has('Siblings')) fail('"## Sizing decision" needs "- Siblings:" (item names, or none)');

  const mode = sizing.has('Mode') ? bare(sizing.get('Mode')) : undefined;
  const owned = primary.filter((row) => row[2] === 'full' || row[2] === 'partial');
  const storyCount = new Set(owned.flatMap((row) => row[0].match(STORY) ?? [])).size;
  const hasNotApplicable = primary.some((row) => row[2] === 'n/a');
  if (mode !== undefined && !PLACEHOLDER.test(mode) && !SIZING_MODES.includes(mode))
    fail(`"- Mode:" must be one of ${SIZING_MODES.join(', ')}`);
  if (mode !== 'technical-enabler' && hasNotApplicable)
    fail('n/a coverage is only for a technical-enabler item; put other references in "## Supporting references"');
  if (mode === 'single-story' && storyCount !== 1)
    fail(`single-story needs exactly one primary Story with full or partial coverage; found ${storyCount}`);
  if (mode === 'grouped-stories' && storyCount < 2)
    fail(`grouped-stories needs at least two primary Stories; found ${storyCount}`);
  if (mode === 'split-story') {
    if (!owned.some((row) => row[2] === 'partial')) fail('split-story needs at least one partial row');
    if (!ITEM_REFERENCE.test(sizing.get('Siblings') ?? ''))
      fail('split-story needs "- Siblings:" naming the sibling or deferred item');
  }
  if (mode === 'technical-enabler') {
    if (owned.length > 0) fail('technical-enabler claims Story coverage; it may only use n/a rows');
    if (!primary.some((row) => row[2] === 'n/a' && ITEM_REFERENCE.test(row[3] ?? '')))
      fail('technical-enabler needs the downstream item it unblocks in the last column of an n/a row');
  }

  if (specSections.has('Size exception')) {
    const exception = fields(specSections.get('Size exception'));
    for (const field of missingFields(exception, SIZE_EXCEPTION_FIELDS))
      fail(`"## Size exception" needs "- ${field}:"`);
  } else if (storyCount > MAX_PRIMARY_STORIES) {
    fail(`${storyCount} primary Stories; at most ${MAX_PRIMARY_STORIES} without "## Size exception"`);
  }

  const reasoning = [
    ...sizingLines.filter((line) => !/^\s*-\s+Container:/.test(line)),
    ...(specSections.get('Size exception') ?? []),
  ].join('\n');
  const reason = reasoning.match(G_AS_REASON);
  if (reason)
    fail(`"${reason[0]}" uses the roadmap group as the sizing reason; G is a container, not a work-item boundary`);
  return errors;
}

// Scope maps (PLAN-02, docs/rules/work-item-sizing.md): one `### Work-item decomposition: Gx` block per assigned group
// in the roadmap, mapping every active Story/AC key of the group to exactly one disposition and its owners.
const SCOPE_MAP_HEADING = /^###\s+Work-item decomposition:\s+(G(?:10|\d))\s*$/;
const SCOPE_MAP_COLUMNS = ['Story', 'AC', 'Disposition', 'Owner', 'Remaining owner', 'Reason', 'Order'];
const DISPOSITIONS = ['full', 'partial', 'deferred', 'not affected'];
const G_GROUP = /\bG(?:10|\d)\b/g;
/** Item folder names in a scope-map cell: backticked kebab-case words. */
const ITEM_NAMES = /`([a-z0-9]+(?:-[a-z0-9]+)+)`/g;

/** The Story/AC keys of a cell (`US-02-01 AC-3`). Ranges use →, -> or –; any other text in the cell is ignored. */
export function acKeys(story, text) {
  const numbers = new Set();
  const singles = text.replace(/\bAC-(\d+)\s*(?:→|->|–)\s*AC-(\d+)/g, (_, from, to) => {
    for (let n = Number(from); n <= Number(to); n++) numbers.add(n);
    return ' ';
  });
  for (const match of singles.matchAll(/\bAC-(\d+)/g)) numbers.add(Number(match[1]));
  return [...numbers].sort((a, b) => a - b).map((n) => `${story} AC-${n}`);
}

/** Story -> { coverages, keys } of the full/partial primary rows of a spec. */
function itemClaims(specText) {
  const claims = new Map();
  for (const [story = '', ac = '', coverage = ''] of tableRows(sections(specText).get('Primary Story/AC') ?? [])) {
    const [id] = story.match(STORY) ?? [];
    if (!id || (coverage !== 'full' && coverage !== 'partial')) continue;
    const claim = claims.get(id) ?? { coverages: new Set(), keys: new Set() };
    claim.coverages.add(coverage);
    for (const key of acKeys(id, ac)) claim.keys.add(key);
    claims.set(id, claim);
  }
  return claims;
}

/** `### Work-item decomposition: Gx` blocks of the roadmap (outside code fences): G -> lines up to the next heading. */
function scopeMapBlocks(text) {
  const blocks = [];
  let current;
  for (const line of prose(text).split('\n')) {
    const heading = line.match(SCOPE_MAP_HEADING);
    if (heading) blocks.push((current = { group: heading[1], lines: [] }));
    else if (/^#{1,3}\s/.test(line)) current = undefined;
    else if (current) current.lines.push(line);
  }
  return blocks;
}

/**
 * Reads and reconciles every scope map of the roadmap: pins and declared counts, the column set, one disposition per
 * Story/AC key across all maps, the owners each disposition requires, owners that are registered items with spec and
 * plan, and owner specs that claim the keys mapped to them with a compatible coverage. Returns the keys for the
 * item-side check. It cannot prove the map is complete against Docs: the reviewer compares the pinned revision and the
 * declared counts with the authoritative User Stories.
 */
function checkScopeMaps(root, workItems, items, index) {
  const errors = [];
  const roadmap = workItems.roadmap;
  const path = resolve(root, roadmap);
  const keys = new Map();
  if (!existsSync(path))
    return { errors: [`Missing roadmap for scope maps: ${roadmap}`], path, groups: new Set(), keys };
  const itemFile = (name, file) => resolve(root, workItems.directory, name, file);
  const registered = (name) =>
    items.includes(name) &&
    index.includes(`(${name}/spec.md)`) &&
    existsSync(itemFile(name, 'spec.md')) &&
    existsSync(itemFile(name, 'plan.md'));
  const blocks = scopeMapBlocks(read(path));
  const groups = new Set();

  for (const { group, lines } of blocks) {
    const fail = (message) => errors.push(`${roadmap} ${group} map: ${message}`);
    if (groups.has(group)) fail('appears twice; keep one decomposition per group');
    groups.add(group);
    const intro = lines.filter((line) => !/^\s*\|/.test(line)).join('\n');
    if (!/\bDocs\s+`[0-9a-f]{7,40}`/.test(intro) || !/\bBE\s+`[0-9a-f]{7,40}`/.test(intro))
      fail('must pin Docs `<sha>` and BE `<sha>`');
    const active = intro.match(/Active:\s*(\d+)\s*Story,\s*(\d+)\s*AC\b/);
    if (!active) fail('needs "- Active: <n> Story, <m> AC."');
    const header = (lines.find((line) => /^\s*\|/.test(line)) ?? '')
      .trim()
      .replace(/^\||\|$/g, '')
      .split('|')
      .map((cell) => cell.trim());
    if (header.join('|') !== SCOPE_MAP_COLUMNS.join('|'))
      fail(`table columns must be ${SCOPE_MAP_COLUMNS.join(' | ')}`);

    const stories = new Set();
    let keyCount = 0;
    const unknownOwners = new Set();
    for (const [story = '', ac = '', disposition = '', owner = '', remaining = '', reason = ''] of tableRows(lines)) {
      const row = `${story} ${ac}`;
      const ids = story.match(STORY) ?? [];
      const rowKeys = ids.length === 1 ? acKeys(ids[0], ac) : [];
      if (rowKeys.length === 0) {
        fail(`row "${row}" needs one Story and its exact AC`);
        continue;
      }
      stories.add(ids[0]);
      keyCount += rowKeys.length;
      const owners = [...owner.matchAll(ITEM_NAMES)].map((match) => match[1]);
      const remainders = [...remaining.matchAll(ITEM_NAMES)].map((match) => match[1]);
      const noOwner = PLACEHOLDER.test(bare(owner));
      const noRemaining = PLACEHOLDER.test(bare(remaining));
      const hasReason = !PLACEHOLDER.test(bare(reason));
      let named = [];
      if (!DISPOSITIONS.includes(disposition))
        fail(`row "${row}" disposition "${disposition}" must be one of ${DISPOSITIONS.join(', ')}`);
      else if (disposition === 'full') {
        if (owners.length !== 1 || !noRemaining)
          fail(`full row "${row}" needs exactly one owner and no remaining owner`);
        named = owners;
      } else if (disposition === 'partial') {
        if (owners.length !== 1 || remainders.length === 0 || remainders.includes(owners[0]))
          fail(`partial row "${row}" needs one owner and a different remaining owner`);
        named = [...owners, ...remainders];
      } else if (disposition === 'deferred') {
        if (!noOwner || remainders.length !== 1 || !hasReason)
          fail(`deferred row "${row}" needs one existing target in "Remaining owner", no owner and a reason`);
        named = remainders;
      } else if (!noOwner || !noRemaining || !hasReason) fail(`not affected row "${row}" needs a reason and no owner`);
      for (const name of named) if (!registered(name)) unknownOwners.add(name);
      for (const key of rowKeys) {
        const earlier = keys.get(key);
        if (earlier) errors.push(`${roadmap}: ${key} is mapped twice (${earlier.group}, ${group})`);
        else keys.set(key, { group, disposition, owner: owners[0], remaining: remainders });
      }
    }
    for (const name of unknownOwners)
      fail(`owner \`${name}\` is not a registered work item with spec.md and plan.md in ${workItems.directory}`);
    if (active && (Number(active[1]) !== stories.size || Number(active[2]) !== keyCount))
      fail(`declares ${active[1]} Story, ${active[2]} AC but lists ${stories.size} Story, ${keyCount} AC`);
  }

  // Owner specs must claim what the maps give them, with a coverage that matches how the Story is shared.
  const claims = new Map();
  const claimsOf = (name) => {
    if (!claims.has(name)) claims.set(name, registered(name) ? itemClaims(read(itemFile(name, 'spec.md'))) : null);
    return claims.get(name);
  };
  const byStory = new Map();
  for (const [key, entry] of keys) {
    const story = key.split(' ')[0];
    byStory.set(story, [...(byStory.get(story) ?? []), entry]);
    const holders =
      entry.disposition === 'full'
        ? [entry.owner]
        : entry.disposition === 'partial'
          ? [entry.owner, ...entry.remaining]
          : [];
    for (const name of holders.filter(Boolean)) {
      const claim = claimsOf(name)?.get(story);
      if (claimsOf(name) && !claim?.keys.has(key))
        errors.push(`${roadmap} ${entry.group} map: \`${name}\` spec does not claim ${key} mapped to it`);
    }
  }
  const owners = new Set([...keys.values()].flatMap((entry) => [entry.owner, ...entry.remaining].filter(Boolean)));
  for (const name of owners) {
    for (const [story, claim] of claimsOf(name) ?? []) {
      const entries = byStory.get(story);
      if (!entries) continue;
      const ownsAllInFull = entries.every((entry) => entry.disposition === 'full' && entry.owner === name);
      const group = entries[0].group;
      if (claim.coverages.has('full') && !ownsAllInFull)
        errors.push(`${roadmap} ${group} map: \`${name}\` claims ${story} as full but the map shares or splits it`);
      if (claim.coverages.has('partial') && ownsAllInFull)
        errors.push(
          `${roadmap} ${group} map: \`${name}\` claims ${story} as partial but owns all its mapped AC in full`,
        );
    }
  }
  return { errors, path, groups, keys };
}

/**
 * Item side of the scope maps: a new item names its G groups in `- Container:` and links each group's map in
 * `- Scope map:`; every Story/AC key it claims is mapped to it. Only a technical enabler outside a G uses
 * `- Scope map: n/a`.
 */
function checkScopeLinks(label, name, specPath, sizing, primary, scope, roadmap) {
  const errors = [];
  const fail = (message) => errors.push(`${label}/spec.md: ${message}`);
  const container = sizing.get('Container') ?? '';
  const named = [...new Set(container.match(G_GROUP) ?? [])];
  const field = sizing.get('Scope map');
  const mode = bare(sizing.get('Mode'));
  const owned = primary.filter((row) => row[2] === 'full' || row[2] === 'partial');

  const linked = new Set();
  for (const match of (field ?? '').matchAll(/\]\(\s*([^)\s]+)\s*\)/g)) {
    const [target, anchor = ''] = match[1].split('#');
    const group = anchor.match(/^work-item-decomposition-(g(?:10|\d))$/);
    if (resolve(dirname(specPath), target) === scope.path && group) linked.add(group[1].toUpperCase());
  }
  if (named.length === 0) {
    if (owned.length > 0)
      fail('an item that implements Stories must name its G in "- Container:" and link its scope map');
    if (field === undefined) fail('"## Sizing decision" needs "- Scope map:" (a link per G, or n/a outside a G)');
    else if (bare(field).toLowerCase() === 'n/a' && mode !== 'technical-enabler')
      fail('"- Scope map: n/a" is only for a technical-enabler outside a G');
  }
  for (const group of named) {
    if (field === undefined || PLACEHOLDER.test(bare(field)))
      fail(`container names ${group}; "## Sizing decision" needs "- Scope map:" with a link to its decomposition`);
    else if (!linked.has(group))
      fail(`"- Scope map:" needs a link to ${roadmap}#work-item-decomposition-${group.toLowerCase()}`);
    if (!scope.groups.has(group)) fail(`${group} has no "### Work-item decomposition: ${group}" in ${roadmap}`);
  }
  for (const group of linked)
    if (!named.includes(group)) fail(`"- Scope map:" links ${group}, which "- Container:" does not name`);

  for (const row of owned) {
    const [id] = row[0].match(STORY) ?? [];
    if (!id) continue;
    for (const key of acKeys(id, row[1] ?? '')) {
      const entry = scope.keys.get(key);
      const mine = entry && named.includes(entry.group) && (entry.owner === name || entry.remaining.includes(name));
      if (!mine) fail(`${key} is not mapped to ${name} in the ${named.join('/') || 'G'} scope map`);
    }
  }
  return errors;
}

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
 * known status words, a coverage of `full`/`partial`/`n/a` on every primary row, and Files/Depends on/Acceptance/Verify
 * on every plan task. Items that are neither `legacy` nor `sizingGrandfathered` (created before GOV.1) must also pass
 * the sizing rules of docs/rules/work-item-sizing.md (`checkSizing`); grandfathered items keep the older "at most
 * MAX_PRIMARY_STORIES primary Stories unless a size exception is written". An entry of either list whose folder no
 * longer exists fails, and a grandfathered item that gains "## Sizing decision" must leave the list, so both lists can
 * only shrink. The gate checks structure; it does not prove that a spec is right.
 */
export function checkWorkItems(root, workItems) {
  const errors = [];
  const directory = resolve(root, workItems.directory);
  if (!existsSync(directory)) return [`Missing work-item directory: ${workItems.directory}`];
  const legacy = new Set(workItems.legacy ?? []);
  const grandfathered = new Set(workItems.sizingGrandfathered ?? []);
  const items = readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  for (const name of legacy) if (!items.includes(name)) errors.push(`Stale legacy work item (no folder): ${name}`);
  for (const name of grandfathered) {
    if (!items.includes(name)) errors.push(`Stale sizingGrandfathered work item (no folder): ${name}`);
    if (legacy.has(name)) errors.push(`${name} is legacy; do not list it in sizingGrandfathered`);
  }
  const index = existsSync(resolve(root, workItems.index)) ? read(resolve(root, workItems.index)) : '';
  if (!index) errors.push(`Missing work-item index: ${workItems.index}`);
  const scope = workItems.roadmap ? checkScopeMaps(root, workItems, items, index) : undefined;
  if (scope) errors.push(...scope.errors);

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
    if (!grandfathered.has(name)) {
      errors.push(...checkSizing(label, specSections, primary));
      if (scope && specSections.has('Sizing decision'))
        errors.push(
          ...checkScopeLinks(
            label,
            name,
            specPath,
            fields(specSections.get('Sizing decision')),
            primary,
            scope,
            workItems.roadmap,
          ),
        );
    } else if (specSections.has('Sizing decision'))
      errors.push(`${name} now has "## Sizing decision"; remove it from sizingGrandfathered`);
    else {
      const stories = new Set(primary.flatMap((row) => row[0].match(STORY) ?? []));
      if (stories.size > MAX_PRIMARY_STORIES && !specSections.has('Size exception'))
        errors.push(
          `${label}/spec.md: ${stories.size} primary Stories; at most ${MAX_PRIMARY_STORIES} without "## Size exception"`,
        );
    }

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
