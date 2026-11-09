import assert from 'node:assert/strict';
import { test } from 'node:test';
import { affected } from '../ci/affected-modules.mjs';

// finance is imported by budgets, which requests imports.
const dependents = (names) =>
  [...new Set([...names, ...(names.includes('finance') ? ['budgets', 'requests'] : [])])].sort();

test('a module change runs that module and every module that imports it', () => {
  assert.deepEqual(affected(['src/modules/finance/public/finance.api.ts'], dependents), {
    all: false,
    modules: ['budgets', 'finance', 'requests'],
    serial: false,
  });
});

test('a change to an integration spec runs its folder; _serial runs the serial project', () => {
  assert.deepEqual(affected(['test/integration/audit/audit.integration-spec.ts'], dependents).modules, ['audit']);
  assert.equal(affected(['test/integration/_serial/x.integration-spec.ts'], dependents).serial, true);
});

test('core, infrastructure, prisma, harness or dependency changes run everything, the serial project included', () => {
  for (const file of [
    'src/core/business-date.ts',
    'src/infrastructure/database/transaction-runner.ts',
    'prisma/migrations/x/migration.sql',
    'test/support/http-test-app.ts',
    'test/config/jest.integration.cjs',
    'pnpm-lock.yaml',
  ]) {
    assert.deepEqual(affected([file], dependents), { all: true, modules: [], serial: true }, file);
  }
});

// These were missed before: the composite actions tune and provision the test database, scripts/build emits the CLI
// aliases the CLI suites start in CI (TEST_CLI_RUNTIME=dist), nest-cli.json and src/cli decide what dist/cli.js is.
test('CI actions, the alias emitter, the Nest build config and the CLI sources run everything', () => {
  for (const file of [
    '.github/actions/test-database/action.yml',
    '.github/actions/setup/action.yml',
    '.github/workflows/nightly.yml',
    'scripts/build/emit-cli-aliases.mjs',
    'nest-cli.json',
    'src/cli/commands.ts',
    'src/cli.ts',
  ]) {
    assert.deepEqual(affected([file], dependents), { all: true, modules: [], serial: true }, file);
  }
});

test('one such file among ordinary module changes still runs everything', () => {
  const changed = ['src/modules/finance/public/finance.api.ts', 'scripts/build/emit-cli-aliases.mjs'];
  assert.deepEqual(affected(changed, dependents), { all: true, modules: [], serial: true });
});

test('documentation alone runs no integration', () => {
  assert.deepEqual(affected(['docs/rules/module-structure.md', 'README.md'], dependents), {
    all: false,
    modules: [],
    serial: false,
  });
});
