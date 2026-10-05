import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildReport,
  packagesDefinedByPlan,
  parseMatrix,
  parsePackageMap,
  renderText,
  scanTitles,
} from './trace-coverage.mjs';

const VERIFICATION = `
## 2. Test matrix theo requirement
| IDs | Kịch bản | Tầng |
| --- | --- | --- |
| N01 | login | live |
| N02 | unknown email | unit |
| N34 | handover | integration |
| E07T | **E07T-01** a; **E07T-02** b | PostgreSQL |
| G01 | inventory | HTTP |
### 2.1 N34
| Id | pre | act | post |
| --- | --- | --- | --- |
| N34a | x | y | z |
| N34b | x | y | z |
## 3. Full API coverage gate
`;

const PLAN = `
### B1a — Foundations
### B3d — Login
### B6 — Employees
## 7. Test IDs → packages
| IDs | First implemented in |
| --- | --- |
| G01, N19 (harness self-test) | B1a |
| N01, N02 | B3d |
| E07T (constraints), N34 | B6 |
| N10–N12 | B3d / B6 |
## 8. Blockers register
`;

test('matrix IDs and sub-IDs are read from the verification guide', () => {
  const { ids, subs } = parseMatrix(VERIFICATION);
  assert.deepEqual([...ids].sort(), ['E07T', 'G01', 'N01', 'N02', 'N34']);
  assert.deepEqual([...subs.get('N34')].sort(), ['N34a', 'N34b']);
  assert.deepEqual([...subs.get('E07T')].sort(), ['E07T-01', 'E07T-02']);
});

test('package map expands ranges, ignores parentheses and splits packages', () => {
  const map = parsePackageMap(PLAN);
  assert.deepEqual([...map.get('N11')].sort(), ['B3d', 'B6']);
  assert.deepEqual([...map.get('N19')], ['B1a']);
  assert.ok(map.has('E07T') && map.has('N34'));
  assert.deepEqual([...packagesDefinedByPlan(PLAN)], ['B1a', 'B3d', 'B6']);
});

test('titles are scanned only on test-declaration lines', () => {
  const found = scanTitles([
    {
      path: 'a.ts',
      text: "describe('x', () => {\n  it('N01 — login works', () => {});\n  // N02 mentioned in a comment\n  const N19 = 1;\n});",
    },
  ]);
  assert.deepEqual([...found.keys()], ['N01']);
});

test('structural problems: unowned ID, unknown package, ID that does not exist', () => {
  const report = buildReport({
    verification: VERIFICATION,
    plan: PLAN,
    tests: [{ path: 'src/a.spec.ts', text: "it('N99 — ghost', () => {});\nit('N01 — ok', () => {});" }],
  });
  const text = report.problems.join('\n');
  assert.match(text, /N19 is assigned to a package but is not defined/);
  assert.match(text, /N11 is assigned to a package but is not defined/);
  assert.match(text, /test title uses N99/);
  assert.doesNotMatch(text, /N01/);
});

test('an ID in the matrix that no package owns is reported', () => {
  const plan = PLAN.replace('| N01, N02 | B3d |', '| N01 | B3d |');
  const report = buildReport({ verification: VERIFICATION, plan, tests: [] });
  assert.match(report.problems.join('\n'), /N02 is in the verification guide but no package owns it/);
});

test('coverage counts a base ID covered by any of its sub-IDs', () => {
  const report = buildReport({
    verification: VERIFICATION,
    plan: PLAN.replace('| N10–N12 | B3d / B6 |\n', ''),
    tests: [{ path: 'test/integration/n.integration-spec.ts', text: "it('N34a handover moved', () => {});" }],
  });
  const b6 = report.rows.find(([pkg]) => pkg === 'B6')[1];
  assert.ok(b6.covered.includes('N34'));
  assert.ok(b6.missing.includes('E07T'));
  assert.match(renderText(report, 'B6'), /B6 +2 +1/);
});

test('an ID owned by several packages is covered only by a title that names the package', () => {
  const plan = PLAN.replace('| N01, N02 | B3d |', '| N01 | B3d / B6 |\n| N02 | B3d |');
  const build = (title) =>
    buildReport({
      verification: VERIFICATION,
      plan: plan.replace('| N10–N12 | B3d / B6 |\n', ''),
      tests: [{ path: 'src/a.spec.ts', text: `it('${title}', () => {});` }],
    });
  const row = (report, pkg) => report.rows.find(([name]) => name === pkg)[1];

  assert.ok(row(build('N01 — plain'), 'B3d').missing.includes('N01'));
  assert.ok(row(build('N01 — plain'), 'B6').missing.includes('N01'));
  assert.ok(row(build('N01/B3d — tagged'), 'B3d').covered.includes('N01'));
  assert.ok(row(build('N01/B3d — tagged'), 'B6').missing.includes('N01'));
  assert.match(
    build('N01/B1a — wrong package').problems.join('\n'),
    /tags N01 with B1a, but the delivery plan assigns N01 to B3d, B6/,
  );
});
