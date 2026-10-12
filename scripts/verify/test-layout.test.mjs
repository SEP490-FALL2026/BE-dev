import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RUNNERS } from './runners.mjs';
import { expectedFor, layoutProblems, listingProblems, missingRequired } from './test-layout.mjs';

const GOOD = [
  'src/app.module.ts',
  'src/modules/catalog/catalog.service.spec.ts',
  'test/e2e/app.e2e-spec.ts',
  'test/e2e/api-inventory.e2e-spec.ts',
  'test/integration/catalog.repo.integration-spec.ts',
  'test/support/disposable-database.ts',
  'test/config/unused.ts',
];

test('a correct tree has no problems', () => {
  assert.deepEqual(layoutProblems(GOOD), []);
});

// A test outside registered roots must not pass silently.
test('a spec outside every runner directory is reported', () => {
  const problems = layoutProblems([...GOOD, 'test/api-inventory.spec.ts']);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /outside every runner directory/);
});

test('a spec with the wrong suffix for its directory is reported', () => {
  const problems = layoutProblems([...GOOD, 'test/e2e/catalog.integration-spec.ts']);
  assert.match(problems.join('\n'), /wrong suffix for the e2e runner/);
});

test('a unit spec carrying an e2e suffix inside src is reported', () => {
  assert.match(layoutProblems([...GOOD, 'src/modules/x/x.e2e-spec.ts']).join('\n'), /wrong suffix for the unit runner/);
});

test('a spec inside a support directory is reported', () => {
  assert.match(layoutProblems([...GOOD, 'test/support/helper.e2e-spec.ts']).join('\n'), /inside test\/support/);
});

test('a helper inside a runner directory is reported', () => {
  assert.match(layoutProblems([...GOOD, 'test/e2e/helpers.ts']).join('\n'), /non-spec file inside the e2e runner/);
});

test('listing differences are reported in both directions', () => {
  const e2e = RUNNERS.find((runner) => runner.name === 'e2e');
  assert.deepEqual(expectedFor(e2e, GOOD), ['test/e2e/api-inventory.e2e-spec.ts', 'test/e2e/app.e2e-spec.ts']);
  const problems = listingProblems(e2e, ['test/e2e/app.e2e-spec.ts', 'test/e2e/ghost.e2e-spec.ts'], GOOD);
  assert.equal(problems.length, 2);
  assert.match(problems[0], /api-inventory.*does not list it/);
  assert.match(problems[1], /ghost.*does not assign/);
});

test('a deleted required spec fails', () => {
  assert.deepEqual(missingRequired(GOOD, ['test/e2e/api-inventory.e2e-spec.ts']), []);
  assert.equal(missingRequired(['test/e2e/app.e2e-spec.ts'], ['test/e2e/api-inventory.e2e-spec.ts']).length, 1);
});
