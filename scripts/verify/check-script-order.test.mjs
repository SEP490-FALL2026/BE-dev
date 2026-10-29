import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const packageJson = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
const ciWorkflow = readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8');
const testDatabaseAction = readFileSync(
  new URL('../../.github/actions/test-database/action.yml', import.meta.url),
  'utf8',
);

const steps = packageJson.scripts.check.split(' && ');

// ESLint type-checks against src/generated, which is git-ignored, so a clean
// checkout only passes lint after the Prisma client has been generated (R-01).
test('check generates the Prisma client before every step that reads it', () => {
  const generate = steps.indexOf('pnpm prisma:generate');
  assert.notEqual(generate, -1, 'check must run pnpm prisma:generate');
  for (const consumer of ['pnpm lint', 'pnpm typecheck', 'pnpm test', 'pnpm build']) {
    const index = steps.indexOf(consumer);
    assert.notEqual(index, -1, `check must run ${consumer}`);
    assert.ok(generate < index, `pnpm prisma:generate must run before ${consumer}`);
  }
});

test('CI path filters only list files that exist in the repository', () => {
  assert.ok(!ciWorkflow.includes("'.env.example'"), '.env.example was removed; its CI path filter is stale');
});

test('CI provisions and asserts an ordinary integration role before running the suite', () => {
  assert.match(ciWorkflow, /POSTGRES_USER: ci_bootstrap/);
  // The integration job provisions through the composite action before any integration command runs.
  const integrationJob = ciWorkflow.slice(ciWorkflow.indexOf('\n  integration:'));
  const uses = integrationJob.indexOf('uses: ./.github/actions/test-database');
  const integration = integrationJob.indexOf('pnpm test:integration');
  assert.ok(uses >= 0 && uses < integration, 'the integration job must provision the role before its suites');
  assert.match(
    testDatabaseAction,
    /CREATE ROLE ci_integration LOGIN NOSUPERUSER CREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS/,
  );
  const provision = testDatabaseAction.indexOf('CREATE ROLE ci_integration');
  const assertion = testDatabaseAction.indexOf('Assert ordinary integration role');
  assert.ok(provision >= 0 && provision < assertion);
  const roleAssertion = testDatabaseAction.slice(assertion);
  for (const attribute of [
    'rolsuper',
    'rolcreatedb',
    'rolcreaterole',
    'rolreplication',
    'rolcanlogin',
    'rolbypassrls',
  ]) {
    assert.ok(roleAssertion.includes(attribute), `CI must assert ${attribute}`);
  }
  assert.match(
    ciWorkflow,
    /TEST_DATABASE_ADMIN_URL: postgresql:\/\/ci_integration:ci-integration-only@127\.0\.0\.1:5432\/postgres/,
  );
  assert.doesNotMatch(ciWorkflow, /TEST_DATABASE_ADMIN_URL:.*ci_bootstrap/);
});
