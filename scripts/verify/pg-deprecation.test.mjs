// INF.1 / F-30: the PostgreSQL adapter specs run with --throw-deprecation, so a pg deprecation warning (a custom
// Promise, a query queued on a busy client, a private field read) fails here instead of scrolling past in a log.
import { spawnSync } from 'node:child_process';
import { strict as assert } from 'node:assert';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

test('the PostgreSQL adapter specs emit no deprecation warning', () => {
  const run = spawnSync(
    process.execPath,
    [
      '--throw-deprecation',
      join(root, 'node_modules', 'jest', 'bin', 'jest.js'),
      '--runInBand',
      'src/infrastructure/database/pg-pool',
    ],
    { cwd: root, encoding: 'utf8', timeout: 180000 },
  );

  assert.equal(run.error, undefined);
  assert.doesNotMatch(`${run.stdout}${run.stderr}`, /DeprecationWarning/);
  assert.match(run.stderr, /Tests:\s+\d+ passed, \d+ total/);
  assert.equal(run.status, 0);
});
