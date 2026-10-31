import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RUNNERS } from './runners.mjs';
import { expectedFor, layoutProblems, listingProblems, missingRequired } from './test-layout.mjs';

const GOOD = [
  'src/app/app.module.ts',
  'src/modules/catalog/catalog.service.spec.ts',
  'test/http/platform/app.http-spec.ts',
  'test/http/platform/api-inventory.http-spec.ts',
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

test('a file of test/integration/_serial belongs to the serial runner, never to the parallel one', () => {
  const serial = 'test/integration/_serial/roles.integration-spec.ts';
  const integration = RUNNERS.find((runner) => runner.name === 'integration');
  const serialRunner = RUNNERS.find((runner) => runner.name === 'integration-serial');
  assert.deepEqual(layoutProblems([...GOOD, serial]), []);
  assert.deepEqual(expectedFor(integration, [...GOOD, serial]), ['test/integration/catalog.repo.integration-spec.ts']);
  assert.deepEqual(expectedFor(serialRunner, [...GOOD, serial]), [serial]);
});

test('a timing spec lives with its module and belongs to the timing runner; another suffix there is still reported', () => {
  const timing = 'test/integration/identity-access/me-unavailable.timing-spec.ts';
  const integration = RUNNERS.find((runner) => runner.name === 'integration');
  const timingRunner = RUNNERS.find((runner) => runner.name === 'integration-timing');
  assert.deepEqual(layoutProblems([...GOOD, timing]), []);
  assert.deepEqual(expectedFor(integration, [...GOOD, timing]), ['test/integration/catalog.repo.integration-spec.ts']);
  assert.deepEqual(expectedFor(timingRunner, [...GOOD, timing]), [timing]);
  assert.match(
    layoutProblems([...GOOD, 'test/integration/x/a.e2e-spec.ts']).join('\n'),
    /wrong suffix for the integration runner/,
  );
});

test('listing differences are reported in both directions', () => {
  const http = RUNNERS.find((runner) => runner.name === 'http');
  assert.deepEqual(expectedFor(http, GOOD), [
    'test/http/platform/api-inventory.http-spec.ts',
    'test/http/platform/app.http-spec.ts',
  ]);
  const problems = listingProblems(http, ['test/http/platform/app.http-spec.ts', 'test/http/ghost.http-spec.ts'], GOOD);
  assert.equal(problems.length, 2);
  assert.match(problems[0], /api-inventory.*does not list it/);
  assert.match(problems[1], /ghost.*does not assign/);
});

test('a deleted required spec fails', () => {
  assert.deepEqual(missingRequired(GOOD, ['test/http/platform/api-inventory.http-spec.ts']), []);
  assert.equal(
    missingRequired(['test/http/platform/app.http-spec.ts'], ['test/http/platform/api-inventory.http-spec.ts']).length,
    1,
  );
});
