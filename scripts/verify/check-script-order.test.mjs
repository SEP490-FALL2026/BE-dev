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
