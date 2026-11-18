// `pnpm test:flows [-- <jest arguments>]`: the flows runner (test/config/jest.flows.cjs), in band.
//
// pnpm passes the `--` of `pnpm test:flows -- -t "@D1"` on to the script, and Jest reads everything after a `--` as a path pattern, so
// `-t` would find no test. This takes that one `--` off and leaves every other argument as it came.
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const jest = createRequire(join(root, 'package.json')).resolve('jest/bin/jest');
const rest = process.argv.slice(2);
const forwarded = rest[0] === '--' ? rest.slice(1) : rest;

const run = spawnSync(process.execPath, [jest, '--config', 'test/config/jest.flows.cjs', '--runInBand', ...forwarded], {
  cwd: root,
  stdio: 'inherit',
  env: process.env,
});

process.exit(run.status ?? 1);
