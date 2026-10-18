import assert from 'node:assert/strict';
import { copyFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
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

const GOOD_SPEC = [
  '# Spec: example',
  '',
  '- Thiết kế: `draft`. Nguồn: Docs `9416fe0`, BE `186ad5f`.',
  '',
  '## Business outcome',
  'One outcome.',
  '## Primary Story/AC',
  '| Story | AC | Coverage | Remaining |',
  '| --- | --- | --- | --- |',
  '| US-01-01 | AC-1 | full | — |',
  '## Supporting references',
  '## Explicit out of scope',
  '## Dependencies and blockers',
  '## Ownership: module, data, API',
  '## Behavior and design',
  '## Test matrix',
  '## Definition of Done',
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
test('more than three primary Stories need a written size exception', (t) => {
  const f = workItemFixture(t);
  const rows = ['US-01-01', 'US-01-02', 'US-01-03', 'US-01-04'].map((s) => `| ${s} | AC-1 | full | — |`).join('\n');
  const spec = GOOD_SPEC.replace('| US-01-01 | AC-1 | full | — |', rows);
  f.write('items/example/spec.md', spec);
  assert.ok(f.items().some((e) => e.includes('4 primary Stories')));
  f.write('items/example/spec.md', `${spec}\n## Size exception\nSame transaction boundary.`);
  assert.deepEqual(f.items(), []);
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
