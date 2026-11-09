import assert from 'node:assert/strict';
import { copyFileSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { anchors, checkRepository, checkWorkItems } from './check-rules.mjs';

function fixture(t) {
  const base = mkdtempSync(join(tmpdir(), 'rules-gate-'));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const root = join(base, 'repo');
  mkdirSync(join(root, 'rules'), { recursive: true });
  const write = (path, text) => writeFileSync(join(root, path), text);
  write('AGENTS.md', '[router](rules/README.md)');
  write('rules/README.md', '[workflow](workflow.md#thiết-kế)\n[external](../../Docs/rules/skill-workflow.md)');
  write('rules/workflow.md', '# Thiết kế\n');
  const config = {
    entry: 'AGENTS.md',
    rules: 'rules',
    files: ['AGENTS.md'],
    siblings: ['../Docs'],
    requiredEdges: [
      ['AGENTS.md', 'rules/README.md'],
      ['rules/README.md', 'rules/workflow.md'],
    ],
  };
  return { root, write, config, check: (strict = false) => checkRepository(root, config, strict) };
}

test('valid local graph reports absent sibling without pretending to verify it', (t) => {
  const f = fixture(t);
  const result = f.check();
  assert.deepEqual(result.errors, []);
  assert.equal(result.unavailable.length, 1);
  assert.ok(f.check(true).errors.some((e) => e.includes('missing sibling')));
});
test('broken file and anchor fail independently', (t) => {
  const f = fixture(t);
  f.write('rules/workflow.md', '# Thiết kế\n[missing](missing.md)\n[anchor](README.md#absent)');
  const errors = f.check().errors;
  assert.ok(errors.some((e) => e.includes('missing link target')));
  assert.ok(errors.some((e) => e.includes('missing anchor')));
});
test('orphan rule and removed workflow edge are rejected', (t) => {
  const f = fixture(t);
  f.write('rules/README.md', '# Router');
  const errors = f.check().errors;
  assert.ok(errors.some((e) => e.includes('Unreachable rule')));
  assert.ok(errors.some((e) => e.includes('Missing workflow edge')));
});
test('existing sibling with a missing file must fail, even in standalone mode', (t) => {
  const f = fixture(t);
  mkdirSync(join(f.root, '../Docs'));
  assert.ok(f.check().errors.some((e) => e.includes('missing link target')));
});
test('fenced and inline code examples are not executable routing links', (t) => {
  const f = fixture(t);
  f.write('rules/workflow.md', '# Thiết kế\n```md\n[bad](absent.md)\n```\n`[bad](absent.md)`');
  assert.deepEqual(f.check().errors, []);
});
test('Unicode, repeated headings and explicit HTML ids resolve', () => {
  const ids = anchors('# Thiết kế\n# Thiết kế\n# Thiết kế-1\n<a id="custom"></a>');
  for (const id of ['thiết-kế', 'thiết-kế-1', 'thiết-kế-1-1', 'custom']) assert.ok(ids.has(id));
});
test('unsupported reference links fail loudly', (t) => {
  const f = fixture(t);
  f.write('rules/workflow.md', '# Thiết kế\n[route][ref]\n[ref]: README.md');
  assert.ok(f.check().errors.some((e) => e.includes('reference-style')));
});
test('escaping the declared repository set is rejected', (t) => {
  const f = fixture(t);
  f.write('rules/workflow.md', '# Thiết kế\n[outside](../../../unknown.md)');
  assert.ok(f.check().errors.some((e) => e.includes('outside declared')));
});

test('missing shared workflow edge fails even without a sibling checkout', (t) => {
  const f = fixture(t);
  f.config.requiredEdges.push(['rules/README.md', '../Docs/rules/skill-workflow.md']);
  assert.deepEqual(f.check().errors, []);
  f.write('rules/README.md', '[workflow](workflow.md#thiết-kế)');
  assert.ok(f.check().errors.some((e) => e.includes('Missing workflow edge')));
});

test('CLI returns nonzero for defects so CI cannot silently pass', (t) => {
  const f = fixture(t);
  mkdirSync(join(f.root, 'scripts'));
  copyFileSync(fileURLToPath(new URL('./check-rules.mjs', import.meta.url)), join(f.root, 'scripts/check-rules.mjs'));
  f.write('rules-check.config.json', JSON.stringify([{ ...f.config, root: '.', name: 'fixture' }]));
  const run = () => spawnSync(process.execPath, ['scripts/check-rules.mjs'], { cwd: f.root, encoding: 'utf8' });
  assert.equal(run().status, 0);
  f.write('rules/workflow.md', '# Thiết kế\n[broken](missing.md)');
  const failed = run();
  assert.equal(failed.status, 1);
  assert.match(failed.stderr, /missing link target/);
});

test('Claude and Gemini instruction imports resolve to the shared instructions', (t) => {
  const f = fixture(t);
  f.write('CLAUDE.md', '@AGENTS.md\n');
  f.write('GEMINI.md', '@./AGENTS.md\n');
  f.config.files.push('CLAUDE.md', 'GEMINI.md');
  f.config.requiredEdges.push(['CLAUDE.md', 'AGENTS.md'], ['GEMINI.md', 'AGENTS.md']);
  assert.deepEqual(f.check().errors, []);
  f.write('GEMINI.md', '@./missing.md\n');
  assert.ok(f.check().errors.some((e) => e.includes('missing link target ./missing.md')));
  assert.ok(f.check().errors.some((e) => e.includes('Missing workflow edge: GEMINI.md -> AGENTS.md')));
});

test('fenced import examples do not load instructions or satisfy required edges', (t) => {
  const f = fixture(t);
  f.write('CLAUDE.md', '~~~md\n@AGENTS.md\n@missing.md\n~~~\n');
  f.config.files.push('CLAUDE.md');
  f.config.requiredEdges.push(['CLAUDE.md', 'AGENTS.md']);
  const errors = f.check().errors;
  assert.ok(errors.some((e) => e.includes('Missing workflow edge: CLAUDE.md -> AGENTS.md')));
  assert.ok(!errors.some((e) => e.includes('missing link target')));
});

test('shared planning checks nested items but excludes personal scratch', (t) => {
  const f = fixture(t);
  mkdirSync(join(f.root, 'workspace/items/example'), { recursive: true });
  mkdirSync(join(f.root, 'workspace/local'), { recursive: true });
  f.config.directories = ['workspace'];
  f.config.excludeDirectories = ['workspace/local'];
  f.write('workspace/local/note.md', '[private](missing-local.md)');
  f.write('workspace/items/example/spec.md', '[broken](missing-shared.md)');
  assert.ok(f.check().errors.some((e) => e.includes('missing-shared.md')));
  assert.ok(!f.check().errors.some((e) => e.includes('missing-local.md')));
  f.write('workspace/items/example/spec.md', '# Shared spec');
  assert.deepEqual(f.check().errors, []);
});
test('missing configured documentation directory fails', (t) => {
  const f = fixture(t);
  f.config.directories = ['missing-workspace'];
  assert.ok(f.check().errors.some((e) => e.includes('Missing documentation directory')));
});

/**
 * A spec of a new (sized) work item. `rows` are the Primary Story/AC table rows; `extra` is appended at the end (for a
 * `## Size exception`). Defaults describe a valid `single-story` item.
 */
function specWith({
  mode = 'single-story',
  rows = ['| US-02-07 | AC-1→AC-3 | full | — |'],
  siblings = 'none',
  outcome = 'An IT Admin keeps the job title catalogue; capability organization/job-title.',
  sizing = true,
  extra = '',
  container = 'G2, assigned with G3.',
  scopeMap,
} = {}) {
  return [
    '# Spec: example',
    '',
    '- Thiết kế: `draft`. Nguồn: Docs `9416fe0`, BE `186ad5f`.',
    '',
    '## Business outcome',
    'One outcome.',
    ...(sizing
      ? [
          '## Sizing decision',
          `- Container: ${container}`,
          ...(scopeMap === undefined ? [] : [`- Scope map: ${scopeMap}`]),
          `- Mode: \`${mode}\``,
          `- Outcome and owner: ${outcome}`,
          '- Boundaries: one transaction per write on job_titles; HTTP /job-titles; no event; IT_ADMIN only.',
          '- Not larger: the import of job titles has its own preview/confirm transaction and tests.',
          '- Not smaller: rename and retire share the uniqueness rule and one test matrix.',
          `- Siblings: ${siblings}`,
        ]
      : []),
    '## Primary Story/AC',
    '| Story | AC | Coverage | Remaining |',
    '| --- | --- | --- | --- |',
    ...rows,
    '## Supporting references',
    '## Explicit out of scope',
    '## Dependencies and blockers',
    '## Ownership: module, data, API',
    '## Behavior and design',
    '## Test matrix',
    '## Definition of Done',
    extra,
  ].join('\n');
}
const GOOD_SPEC = specWith();
/** A complete `## Size exception`: every evidence field filled. */
const SIZE_EXCEPTION = [
  '## Size exception',
  '- Cohesion: the four catalogue Stories change one table under one uniqueness rule for one actor.',
  '- Why not split: separate items would repeat the same uniqueness and permission tests four times.',
  '- Checkpoints: phase A create/rename, phase B retire/reactivate; gate green after each phase.',
  '- Maximum scope: these four Stories on job_titles only; no import, transfer or standard toolset.',
  '- Accepted by: Owner, 19/10/2026 session.',
].join('\n');
const GOOD_PLAN = [
  '# Plan: example',
  '- Triển khai: `not-started`.',
  '## Before coding',
  '## Tasks',
  '### Task 1: one thing',
  '- Files: src/x.ts',
  '- Depends on: none',
  '- Acceptance: AC-1 passes',
  '- Verify: `pnpm test` → green',
  '### Checkpoint',
  'Gate green after the task.',
  '## Verification and handoff',
].join('\n');

function workItemFixture(t) {
  const f = fixture(t);
  mkdirSync(join(f.root, 'items/example'), { recursive: true });
  mkdirSync(join(f.root, 'items/old'), { recursive: true });
  f.write('items/README.md', '[example](example/spec.md) [old](old/spec.md)');
  f.write('items/example/spec.md', GOOD_SPEC);
  f.write('items/example/plan.md', GOOD_PLAN);
  f.write('items/old/spec.md', '# Legacy spec');
  f.write('items/old/plan.md', '# Legacy plan');
  const workItems = { directory: 'items', index: 'items/README.md', legacy: ['old'] };
  return { ...f, workItems, items: () => checkWorkItems(f.root, workItems) };
}

test('a work item that follows the template passes and a legacy item is only registration-checked', (t) => {
  const f = workItemFixture(t);
  assert.deepEqual(f.items(), []);
});
test('work items fail on a missing section, pin, status word, coverage or task field', (t) => {
  const f = workItemFixture(t);
  f.write(
    'items/example/spec.md',
    GOOD_SPEC.replace('## Supporting references\n', '').replace('BE `186ad5f`', 'BE latest'),
  );
  f.write(
    'items/example/plan.md',
    GOOD_PLAN.replace('`not-started`', '`done`').replace('- Verify: `pnpm test` → green\n', ''),
  );
  const errors = f.items();
  assert.ok(errors.some((e) => e.includes('missing section "## Supporting references"')));
  assert.ok(errors.some((e) => e.includes('must pin BE')));
  assert.ok(errors.some((e) => e.includes('"Triển khai:" must be one of')));
  assert.ok(errors.some((e) => e.includes('needs "- Verify:"')));
  f.write('items/example/spec.md', GOOD_SPEC.replace('| full |', '| done |'));
  assert.ok(f.items().some((e) => e.includes('needs coverage full, partial or n/a')));
});
const FOUR_STORIES = ['US-02-07', 'US-02-08', 'US-02-09', 'US-02-10'].map((s) => `| ${s} | AC-1→AC-4 | full | — |`);

test('more than three primary Stories need a complete size exception, not a sentence', (t) => {
  const f = workItemFixture(t);
  const spec = specWith({ mode: 'grouped-stories', rows: FOUR_STORIES });
  f.write('items/example/spec.md', spec);
  assert.ok(f.items().some((e) => e.includes('4 primary Stories')));
  f.write('items/example/spec.md', `${spec}\n## Size exception\nSame transaction boundary.`);
  const errors = f.items();
  for (const field of ['Cohesion', 'Why not split', 'Checkpoints', 'Maximum scope', 'Accepted by'])
    assert.ok(
      errors.some((e) => e.includes(`"## Size exception" needs "- ${field}:"`)),
      field,
    );
  f.write('items/example/spec.md', specWith({ mode: 'grouped-stories', rows: FOUR_STORIES, extra: SIZE_EXCEPTION }));
  assert.deepEqual(f.items(), []);
});

test('a size exception missing any one evidence field fails on that field', (t) => {
  const f = workItemFixture(t);
  for (const field of ['Cohesion', 'Why not split', 'Checkpoints', 'Maximum scope', 'Accepted by']) {
    const partial = SIZE_EXCEPTION.split('\n')
      .filter((line) => !line.startsWith(`- ${field}:`))
      .join('\n');
    f.write('items/example/spec.md', specWith({ mode: 'grouped-stories', rows: FOUR_STORIES, extra: partial }));
    assert.deepEqual(f.items(), [`items/example/spec.md: "## Size exception" needs "- ${field}:"`], field);
  }
  const placeholder = SIZE_EXCEPTION.replace(/- Checkpoints: .*/, '- Checkpoints: TBD');
  f.write('items/example/spec.md', specWith({ mode: 'grouped-stories', rows: FOUR_STORIES, extra: placeholder }));
  assert.deepEqual(f.items(), ['items/example/spec.md: "## Size exception" needs "- Checkpoints:"']);
});

test('a sized item passes in each of the four sizing modes', (t) => {
  const f = workItemFixture(t);
  const valid = {
    'single-story': specWith(),
    'grouped-stories': specWith({
      mode: 'grouped-stories',
      rows: ['| US-02-07 | AC-1→AC-3 | full | — |', '| US-02-08 | AC-1, AC-2 | full | — |'],
    }),
    'split-story': specWith({
      mode: 'split-story',
      rows: ['| US-02-01 | AC-1→AC-4 (preview, validation) | partial | AC-5→AC-10: `g2-import-confirm` |'],
      siblings: '`g2-import-confirm` owns confirm and idempotent persistence.',
      outcome: 'An IT Admin previews an employee file with row errors; capability data-import.',
    }),
    'technical-enabler': specWith({
      mode: 'technical-enabler',
      rows: ['| — | GATE2-01 | n/a | unblocks `g3-catalog-foundation` |'],
      outcome: 'The capability gate names every intra-module contract; architecture tests.',
    }),
  };
  for (const [mode, spec] of Object.entries(valid)) {
    f.write('items/example/spec.md', spec);
    assert.deepEqual(f.items(), [], mode);
  }
});

test('a new item needs "## Sizing decision" with a known mode', (t) => {
  const f = workItemFixture(t);
  f.write('items/example/spec.md', specWith({ sizing: false }));
  assert.ok(f.items().some((e) => e.includes('missing section "## Sizing decision"')));
  f.write('items/example/spec.md', specWith({ mode: 'g-group' }));
  assert.ok(f.items().some((e) => e.includes('"- Mode:" must be one of single-story, grouped-stories')));
  f.write('items/example/spec.md', specWith().replace(/- Not smaller: .*/, '- Not smaller: —'));
  assert.ok(f.items().some((e) => e.includes('"## Sizing decision" needs "- Not smaller:"')));
});

test('the sizing mode must match the primary Stories', (t) => {
  const f = workItemFixture(t);
  const expectError = (spec, text) => {
    f.write('items/example/spec.md', spec);
    assert.ok(
      f.items().some((e) => e.includes(text)),
      text,
    );
  };
  const twoStories = ['| US-02-07 | AC-1 | full | — |', '| US-02-08 | AC-1 | full | — |'];
  expectError(specWith({ rows: ['| — | TE-01 | n/a | unblocks `g3-x-y` |'] }), 'single-story needs exactly one');
  expectError(specWith({ rows: twoStories }), 'single-story needs exactly one');
  expectError(specWith({ mode: 'grouped-stories' }), 'grouped-stories needs at least two');
  expectError(specWith({ mode: 'split-story', siblings: '`g2-a-b`' }), 'split-story needs at least one partial row');
});

test('a partial row must name the item that owns the remaining AC', (t) => {
  const f = workItemFixture(t);
  for (const remaining of ['', '—', 'none', 'n/a', 'later in G6']) {
    const rows = [`| US-02-01 | AC-1→AC-4 | partial | ${remaining} |`];
    f.write('items/example/spec.md', specWith({ mode: 'split-story', rows, siblings: '`g2-import-confirm`' }));
    assert.ok(
      f.items().some((e) => e.includes('partial row "US-02-01" needs the item that owns the remaining AC')),
      `remaining "${remaining}"`,
    );
  }
  const linked = ['| US-02-01 | AC-1→AC-4 | partial | AC-5: [confirm](../g2-import-confirm/spec.md) |'];
  f.write('items/example/spec.md', specWith({ mode: 'split-story', rows: linked, siblings: '`g2-import-confirm`' }));
  assert.deepEqual(f.items(), []);
});

test('a full row owns an exact AC range and leaves nothing remaining', (t) => {
  const f = workItemFixture(t);
  f.write('items/example/spec.md', specWith({ rows: ['| US-02-07 | all | full | — |'] }));
  assert.ok(f.items().some((e) => e.includes('primary row "US-02-07" needs the exact AC')));
  f.write('items/example/spec.md', specWith({ rows: ['| US-02-07 | AC-1 | full | AC-2: `g2-x-y` |'] }));
  assert.ok(f.items().some((e) => e.includes('full row "US-02-07" must not leave remaining AC')));
});

test('a technical enabler claims no Story and names the item it unblocks', (t) => {
  const f = workItemFixture(t);
  const enabler = (rows) => specWith({ mode: 'technical-enabler', rows });
  f.write('items/example/spec.md', enabler(['| US-02-07 | AC-1 | full | — |']));
  assert.ok(f.items().some((e) => e.includes('technical-enabler claims Story coverage')));
  f.write('items/example/spec.md', enabler(['| US-02-07 | AC-1 | partial | `g2-a-b` |']));
  assert.ok(f.items().some((e) => e.includes('technical-enabler claims Story coverage')));
  f.write('items/example/spec.md', enabler(['| — | GATE2-01 | n/a | — |']));
  assert.ok(f.items().some((e) => e.includes('technical-enabler needs the downstream item')));
  f.write('items/example/spec.md', enabler(['| US-02-07 | GATE2-01 | n/a | `g3-a-b` |']));
  assert.ok(f.items().some((e) => e.includes('n/a row "US-02-07" must not name a Story')));
  f.write(
    'items/example/spec.md',
    specWith({ rows: ['| US-02-07 | AC-1 | full | — |', '| — | TE-1 | n/a | `g3-a` |'] }),
  );
  assert.ok(f.items().some((e) => e.includes('n/a coverage is only for a technical-enabler item')));
});

test('one whole G in one item, because it is one G, is rejected', (t) => {
  const f = workItemFixture(t);
  const wholeG = ['US-04-01', 'US-04-02', 'US-04-03', 'US-04-04', 'US-04-05'].map(
    (s) => `| ${s} | AC-1→AC-6 | full | — |`,
  );
  const exception = SIZE_EXCEPTION.replace(
    /- Cohesion: .*/,
    '- Cohesion: all G3 Stories go into one item because they are one G.',
  );
  f.write(
    'items/example/spec.md',
    specWith({ mode: 'grouped-stories', rows: wholeG, outcome: 'Everything of G3.', extra: exception }),
  );
  assert.ok(f.items().some((e) => e.includes('uses the roadmap group as the sizing reason')));
  const vietnamese = SIZE_EXCEPTION.replace(/- Cohesion: .*/, '- Cohesion: gom toàn bộ G3 vì cùng một G.');
  f.write('items/example/spec.md', specWith({ mode: 'grouped-stories', rows: wholeG, extra: vietnamese }));
  assert.ok(f.items().some((e) => e.includes('uses the roadmap group as the sizing reason')));
});

test('items created before GOV.1 skip only the sizing rules, and that list can only shrink', (t) => {
  const f = workItemFixture(t);
  f.workItems.sizingGrandfathered = ['example'];
  f.write('items/example/spec.md', specWith({ sizing: false }));
  assert.deepEqual(f.items(), []);
  f.write('items/example/spec.md', specWith({ sizing: false }).replace('## Supporting references\n', ''));
  assert.ok(f.items().some((e) => e.includes('missing section "## Supporting references"')));
  f.write('items/example/spec.md', GOOD_SPEC);
  assert.ok(
    f.items().some((e) => e.includes('example now has "## Sizing decision"; remove it from sizingGrandfathered')),
  );
  f.workItems.sizingGrandfathered = ['example', 'gone'];
  f.write('items/example/spec.md', specWith({ sizing: false }));
  assert.ok(f.items().some((e) => e.includes('Stale sizingGrandfathered work item (no folder): gone')));
  f.workItems.sizingGrandfathered = ['old'];
  assert.ok(f.items().some((e) => e.includes('old is legacy; do not list it in sizingGrandfathered')));
});

/** The work items that existed before GOV.1 (Prompt 20, 19/10/2026). The real list may lose entries, never gain one. */
const PRE_SIZING_ITEMS = new Set([
  'foundation-remediation-handoff-2026-10-18',
  'h1-auth-session-refresh-expiry',
  'h2a-openapi-presentation',
  'h2b-openapi-wire-messages',
  'h3a-r1-department-in-use-details',
  'h3b-r2-lock-unlock-reason',
  'h3c-forgot-password-during-recovery',
  'h4-1-organization-root-cleanup',
  'h4-2-project-capability',
  'h4-3a-core-display-name',
  'h4-wave2-organization-capabilities',
  'h4-wave3-department-and-root-contracts',
  'h5-wave-a-identity-access-contract-layout',
  'h5-wave-b-identity-access-capability-recovery',
]);

test('the repository grandfathers no item created after GOV.1', () => {
  const [be] = JSON.parse(readFileSync(fileURLToPath(new URL('../rules-check.config.json', import.meta.url)), 'utf8'));
  const added = be.workItems.sizingGrandfathered.filter((name) => !PRE_SIZING_ITEMS.has(name));
  assert.deepEqual(added, []);
});
test('an unregistered item, a missing plan and a stale legacy entry fail', (t) => {
  const f = workItemFixture(t);
  f.write('items/README.md', '[old](old/spec.md)');
  assert.ok(f.items().some((e) => e.includes('items/example: not registered')));
  rmSync(join(f.root, 'items/example/plan.md'));
  assert.ok(f.items().some((e) => e.includes('needs spec.md and plan.md')));
  f.workItems.legacy.push('gone');
  assert.ok(f.items().some((e) => e.includes('Stale legacy work item (no folder): gone')));
});

// PLAN-02: scope maps (`### Work-item decomposition: Gx` in the roadmap) and the items that own their AC.
const MAP_LINK = (g) => `[${g}](../../roadmap.md#work-item-decomposition-${g.toLowerCase()})`;
const MAP_HEADER = '| Story | AC | Disposition | Owner | Remaining owner | Reason | Order |';

function scopeMap(g, rows, { stories, acs, pins = true, active = true, header = MAP_HEADER } = {}) {
  return [
    `### Work-item decomposition: ${g}`,
    '',
    ...(pins ? ['- Nguồn: Docs `9416fe0` (US v0.15), BE `bdc9fe8`.'] : []),
    ...(active ? [`- Active: ${stories} Story, ${acs} AC.`] : []),
    '',
    header,
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...rows,
  ].join('\n');
}

/** A repository with a roadmap and the scope-map check switched on. `add` registers an item with a valid plan. */
function scopeFixture(t) {
  const f = fixture(t);
  mkdirSync(join(f.root, 'items'), { recursive: true });
  const names = [];
  const add = (name, spec) => {
    mkdirSync(join(f.root, 'items', name), { recursive: true });
    f.write(`items/${name}/spec.md`, spec);
    f.write(`items/${name}/plan.md`, GOOD_PLAN);
    if (!names.includes(name)) names.push(name);
    f.write('items/README.md', names.map((n) => `[${n}](${n}/spec.md)`).join('\n'));
  };
  const roadmap = (...maps) => f.write('roadmap.md', ['# Roadmap', '## Nhóm triển khai', ...maps, ''].join('\n\n'));
  const workItems = { directory: 'items', index: 'items/README.md', legacy: [], roadmap: 'roadmap.md' };
  return { ...f, add, roadmap, workItems, items: () => checkWorkItems(f.root, workItems) };
}

const g3Item = (rows, options = {}) =>
  specWith({ container: 'G3', scopeMap: MAP_LINK('G3'), mode: 'grouped-stories', rows, ...options });
const CATALOG_ROWS = ['| US-04-01 | AC-1→AC-2 | full | — |', '| US-04-02 | AC-1 | full | — |'];
const CATALOG_MAP_ROWS = [
  '| US-04-01 | AC-1→AC-2 | full | `g3-catalog` | — | — | 1 |',
  '| US-04-02 | AC-1 | full | `g3-catalog` | — | — | 1 |',
  '| US-04-03 | AC-1 | not affected | — | — | done by g2-cost-center-catalogue before GOV.1 | — |',
];

/** A valid G3 assignment: one grouped item, one AC not affected. */
function validGrouped(t) {
  const f = scopeFixture(t);
  f.add('g3-catalog', g3Item(CATALOG_ROWS));
  f.roadmap(scopeMap('G3', CATALOG_MAP_ROWS, { stories: 3, acs: 4 }));
  return f;
}

/** One complex Story split across two existing sibling items; AC-7 is shared by aspect (preview side, confirm side). */
const SPLIT_MAP = scopeMap(
  'G3',
  [
    '| US-02-01 | AC-1, AC-6 | full | `g3-import-preview` | — | — | 1 |',
    '| US-02-01 | AC-7 | partial | `g3-import-preview` | `g3-import-confirm` | — | 1 |',
    '| US-02-01 | AC-2→AC-4 | full | `g3-import-confirm` | — | — | 2 |',
  ],
  { stories: 1, acs: 6 },
);
function validSplit(t) {
  const f = scopeFixture(t);
  const split = (rows, sibling) =>
    specWith({ container: 'G3', scopeMap: MAP_LINK('G3'), mode: 'split-story', rows, siblings: `\`${sibling}\`` });
  f.add(
    'g3-import-preview',
    split(
      ['| US-02-01 | AC-1, AC-6, AC-7 | partial | AC-2→AC-4, AC-7 (confirm side): `g3-import-confirm` |'],
      'g3-import-confirm',
    ),
  );
  f.add(
    'g3-import-confirm',
    split(
      ['| US-02-01 | AC-2→AC-4, AC-7 | partial | AC-1, AC-6, AC-7 (preview side): `g3-import-preview` |'],
      'g3-import-preview',
    ),
  );
  f.roadmap(SPLIT_MAP);
  return f;
}

test('PLAN-02: a grouped item, a split Story, a two-G assignment and an enabler outside G pass', (t) => {
  assert.deepEqual(validGrouped(t).items(), []);
  assert.deepEqual(validSplit(t).items(), []);

  const twoG = scopeFixture(t);
  twoG.add(
    'g3-g4-plan-and-capacity',
    specWith({
      container: 'G3 and G4 (both assigned to one developer)',
      scopeMap: `${MAP_LINK('G3')}, ${MAP_LINK('G4')}`,
      mode: 'grouped-stories',
      rows: ['| US-04-02 | AC-1→AC-3 | full | — |', '| US-07-01 | AC-1 | full | — |'],
    }),
  );
  twoG.roadmap(
    scopeMap('G3', ['| US-04-02 | AC-1→AC-3 | full | `g3-g4-plan-and-capacity` | — | — | 1 |'], {
      stories: 1,
      acs: 3,
    }),
    scopeMap('G4', ['| US-07-01 | AC-1 | full | `g3-g4-plan-and-capacity` | — | — | 1 |'], { stories: 1, acs: 1 }),
  );
  assert.deepEqual(twoG.items(), []);

  const enabler = scopeFixture(t);
  enabler.add(
    'gate-hardening',
    specWith({
      container: 'finding bundle from a review',
      scopeMap: 'n/a',
      mode: 'technical-enabler',
      rows: ['| — | GATE2-02 | n/a | unblocks `g3-catalog` |'],
    }),
  );
  enabler.roadmap();
  assert.deepEqual(enabler.items(), []);
});

test('PLAN-02 1–2: a G item links the scope map of every G it names, and that map exists', (t) => {
  const f = validGrouped(t);
  f.add('g3-catalog', g3Item(CATALOG_ROWS, { scopeMap: undefined }));
  assert.ok(f.items().some((e) => e.includes('container names G3; "## Sizing decision" needs "- Scope map:"')));
  f.add('g3-catalog', g3Item(CATALOG_ROWS, { scopeMap: 'n/a' }));
  assert.ok(f.items().some((e) => e.includes('container names G3; "## Sizing decision" needs "- Scope map:"')));
  f.add('g3-catalog', g3Item(CATALOG_ROWS, { scopeMap: '[G3](../../roadmap.md#work-item-decomposition-g4)' }));
  assert.ok(f.items().some((e) => e.includes('"- Scope map:" needs a link to roadmap.md#work-item-decomposition-g3')));
  assert.ok(f.items().some((e) => e.includes('links G4, which "- Container:" does not name')));
  f.add('g3-catalog', g3Item(CATALOG_ROWS));
  f.roadmap(scopeMap('G4', [], { stories: 0, acs: 0 }));
  assert.ok(f.items().some((e) => e.includes('G3 has no "### Work-item decomposition: G3" in roadmap.md')));
});

test('PLAN-02 3–8: every map row has a valid disposition and the owners it requires', (t) => {
  const expectMapError = (rows, counts, text) => {
    const f = validGrouped(t);
    f.roadmap(scopeMap('G3', rows, counts));
    assert.ok(
      f.items().some((e) => e.includes(text)),
      text,
    );
  };
  const base = CATALOG_MAP_ROWS.slice(0, 2);
  const counts = { stories: 3, acs: 4 };
  expectMapError(
    [...base, '| US-04-03 | AC-1 | done | `g3-catalog` | — | — | — |'],
    counts,
    'disposition "done" must be one of full, partial, deferred, not affected',
  );
  expectMapError(
    [...base, '| US-04-01 | AC-2 | full | `g3-catalog` | — | — | — |'],
    { stories: 2, acs: 4 },
    'US-04-01 AC-2 is mapped twice',
  );
  expectMapError(
    ['| US-04-01 | AC-1→AC-2 | full | — | — | — | 1 |', base[1]],
    { stories: 2, acs: 3 },
    'full row "US-04-01 AC-1→AC-2" needs exactly one owner and no remaining owner',
  );
  expectMapError(
    ['| US-04-01 | AC-1→AC-2 | full | `g3-catalog`, `g3-other` | — | — | 1 |', base[1]],
    { stories: 2, acs: 3 },
    'full row "US-04-01 AC-1→AC-2" needs exactly one owner and no remaining owner',
  );
  expectMapError(
    [...base, '| US-04-03 | AC-1 | partial | `g3-catalog` | — | — | — |'],
    counts,
    'partial row "US-04-03 AC-1" needs one owner and a different remaining owner',
  );
  expectMapError(
    [...base, '| US-04-03 | AC-1 | deferred | — | `g3-tax-later` | waits for the tax profile | 2 |'],
    counts,
    'owner `g3-tax-later` is not a registered work item',
  );
  expectMapError(
    [...base, '| US-04-03 | AC-1 | deferred | — | — | waits for the tax profile | 2 |'],
    counts,
    'deferred row "US-04-03 AC-1" needs one existing target in "Remaining owner", no owner and a reason',
  );
  expectMapError(
    [...base, '| US-04-03 | AC-1 | deferred | — | `g3-catalog` | — | 2 |'],
    counts,
    'deferred row "US-04-03 AC-1" needs one existing target in "Remaining owner", no owner and a reason',
  );
  expectMapError(
    [...base, '| US-04-03 | AC-1 | not affected | — | — | — | — |'],
    counts,
    'not affected row "US-04-03 AC-1" needs a reason and no owner',
  );
  expectMapError(
    [...base, '| US-04-03 | AC-1 | not affected | `g3-catalog` | — | done in G2 | — |'],
    counts,
    'not affected row "US-04-03 AC-1" needs a reason and no owner',
  );
});

test('PLAN-02 9: an owner must be a registered item folder with spec.md and plan.md', (t) => {
  const f = validGrouped(t);
  f.roadmap(
    scopeMap('G3', [...CATALOG_MAP_ROWS.slice(0, 2), '| US-04-03 | AC-1 | full | `g3-ghost` | — | — | 2 |'], {
      stories: 3,
      acs: 4,
    }),
  );
  assert.ok(
    f.items().some((e) => e.includes('owner `g3-ghost` is not a registered work item with spec.md and plan.md')),
  );
  mkdirSync(join(f.root, 'items/g3-ghost'));
  f.write('items/g3-ghost/spec.md', g3Item(['| US-04-03 | AC-1 | full | — |'], { mode: 'single-story' }));
  assert.ok(f.items().some((e) => e.includes('owner `g3-ghost` is not a registered work item')));
});

test('PLAN-02 10–12: specs and the map agree on every Story/AC key and coverage', (t) => {
  const f = validGrouped(t);
  f.add('g3-catalog', g3Item([...CATALOG_ROWS, '| US-04-05 | AC-1 | full | — |']));
  assert.ok(f.items().some((e) => e.includes('US-04-05 AC-1 is not mapped to g3-catalog in the G3 scope map')));

  f.add('g3-catalog', g3Item(['| US-04-01 | AC-1 | partial | AC-2: `g3-other` |', CATALOG_ROWS[1]]));
  assert.ok(f.items().some((e) => e.includes('`g3-catalog` spec does not claim US-04-01 AC-2 mapped to it')));

  const g = validGrouped(t);
  g.add(
    'g3-other',
    g3Item(['| US-04-01 | AC-2 | partial | AC-1: `g3-catalog` |'], { mode: 'split-story', siblings: '`g3-catalog`' }),
  );
  g.roadmap(
    scopeMap(
      'G3',
      [
        '| US-04-01 | AC-1 | full | `g3-catalog` | — | — | 1 |',
        '| US-04-01 | AC-2 | partial | `g3-catalog` | `g3-other` | — | 1 |',
        CATALOG_MAP_ROWS[1],
        CATALOG_MAP_ROWS[2],
      ],
      { stories: 3, acs: 4 },
    ),
  );
  assert.ok(g.items().some((e) => e.includes('`g3-catalog` claims US-04-01 as full but the map shares or splits it')));

  const h = validGrouped(t);
  h.add('g3-catalog', g3Item(['| US-04-01 | AC-1→AC-2 | partial | none left: `g3-catalog` |', CATALOG_ROWS[1]]));
  assert.ok(
    h.items().some((e) => e.includes('`g3-catalog` claims US-04-01 as partial but owns all its mapped AC in full')),
  );
});

test('PLAN-02: a map pins Docs and BE and declares counts that match its rows', (t) => {
  const f = validGrouped(t);
  f.roadmap(scopeMap('G3', CATALOG_MAP_ROWS, { stories: 3, acs: 4, pins: false }));
  assert.ok(f.items().some((e) => e.includes('G3 map: must pin Docs `<sha>` and BE `<sha>`')));
  f.roadmap(scopeMap('G3', CATALOG_MAP_ROWS, { stories: 3, acs: 4, active: false }));
  assert.ok(f.items().some((e) => e.includes('G3 map: needs "- Active: <n> Story, <m> AC."')));
  f.roadmap(scopeMap('G3', CATALOG_MAP_ROWS, { stories: 3, acs: 5 }));
  assert.ok(f.items().some((e) => e.includes('G3 map: declares 3 Story, 5 AC but lists 3 Story, 4 AC')));
  f.roadmap(
    scopeMap('G3', CATALOG_MAP_ROWS, {
      stories: 3,
      acs: 4,
      header: '| Story | AC | Status | Owner | Next | Why | Order |',
    }),
  );
  assert.ok(f.items().some((e) => e.includes('G3 map: table columns must be Story | AC | Disposition')));
});

test('PLAN-02: an item that implements Stories cannot leave G with "Scope map: n/a"', (t) => {
  const f = scopeFixture(t);
  f.add('direct-catalog', specWith({ container: 'direct request from the Owner', scopeMap: 'n/a' }));
  f.roadmap();
  const errors = f.items();
  assert.ok(errors.some((e) => e.includes('an item that implements Stories must name its G in "- Container:"')));
  assert.ok(errors.some((e) => e.includes('"- Scope map: n/a" is only for a technical-enabler outside a G')));
});

test('PLAN-02 mutations: a duplicated AC and a removed owner row fail, and the valid split comes back byte for byte', (t) => {
  const f = validSplit(t);
  const original = readFileSync(join(f.root, 'roadmap.md'));
  const confirmRow = '| US-02-01 | AC-2→AC-4 | full | `g3-import-confirm` | — | — | 2 |';
  f.roadmap(
    SPLIT_MAP.replace(confirmRow, `${confirmRow}\n| US-02-01 | AC-6 | full | \`g3-import-confirm\` | — | — | 2 |`),
  );
  assert.ok(f.items().some((e) => e.includes('US-02-01 AC-6 is mapped twice')));
  f.roadmap(SPLIT_MAP.replace(`\n${confirmRow}`, ''));
  const removed = f.items();
  assert.ok(removed.some((e) => e.includes('US-02-01 AC-2 is not mapped to g3-import-confirm')));
  assert.ok(removed.some((e) => e.includes('declares 1 Story, 6 AC but lists 1 Story, 3 AC')));
  f.roadmap(SPLIT_MAP);
  assert.ok(readFileSync(join(f.root, 'roadmap.md')).equals(original));
  assert.deepEqual(f.items(), []);
});

test('PLAN-02: grandfathered items skip sizing and scope maps, nothing else', (t) => {
  const f = validGrouped(t);
  f.add('h9-old-slice', specWith({ sizing: false, rows: ['| US-09-01 | AC-1 | full | — |'] }));
  f.workItems.sizingGrandfathered = ['h9-old-slice'];
  assert.deepEqual(f.items(), []);
  f.add('h9-old-slice', specWith({ sizing: false, rows: ['| US-09-01 | AC-1 | done | — |'] }));
  assert.ok(f.items().some((e) => e.includes('needs coverage full, partial or n/a')));
});

test('the repository runs the scope-map check against its roadmap', () => {
  const [be] = JSON.parse(readFileSync(fileURLToPath(new URL('../rules-check.config.json', import.meta.url)), 'utf8'));
  assert.equal(be.workItems.roadmap, 'docs/roadmap.md');
});
