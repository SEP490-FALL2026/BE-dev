import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const packageJson = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
const ciWorkflow = readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8');

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
  assert.match(
    ciWorkflow,
    /CREATE ROLE ci_integration LOGIN NOSUPERUSER CREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS/,
  );
  const provision = ciWorkflow.indexOf('CREATE ROLE ci_integration');
  const assertion = ciWorkflow.indexOf('Assert ordinary integration role');
  const integration = ciWorkflow.indexOf('run: pnpm test:integration');
  assert.ok(provision >= 0 && provision < assertion && assertion < integration);
  const roleAssertion = ciWorkflow.slice(assertion, integration);
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
