// OD-T2: which integration folders a change on `dev` must run. Prints one line of Jest path arguments
// (`test/integration/<module>` …), `ALL`, or `NONE`, plus `SERIAL` on a second line when test/integration/_serial must run.
// usage: node scripts/ci/affected-modules.mjs <base-sha> [head-sha]   (CI: the push "before" sha or the PR base)
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dependentsOf } from '../arch/module-edges.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

// A change here can break any module: run everything.
const EVERYTHING = [
  /^src\/(core|infrastructure|app|worker|cli)\//,
  /^src\/[^/]+\.ts$/,
  /^prisma\//,
  /^prisma\.config\.ts$/,
  /^test\/(support|config)\//,
  /^package\.json$/,
  /^pnpm-lock\.yaml$/,
  /^pnpm-workspace\.yaml$/,
  /^tsconfig[^/]*\.json$/,
  /^nest-cli\.json$/,
  // the test database server is tuned and its role provisioned by the composite actions
  /^\.github\/(workflows|actions)\//,
  // scripts/build emits the dist/<name>-cli.js aliases the CLI suites start (TEST_CLI_RUNTIME=dist)
  /^scripts\/(ci|arch|build)\//,
];

/** { all, modules: string[], serial } for the changed repository-relative paths. */
export function affected(changed, dependents = (names) => dependentsOf(root, names)) {
  if (changed.some((file) => EVERYTHING.some((pattern) => pattern.test(file)))) {
    return { all: true, modules: [], serial: true };
  }
  const touched = new Set();
  const testDirs = new Set();
  let serial = false;
  for (const file of changed) {
    const source = /^src\/modules\/([^/]+)\//.exec(file);
    if (source) touched.add(source[1]);
    const test = /^test\/integration\/([^/]+)\//.exec(file);
    if (test && test[1] === '_serial') serial = true;
    else if (test) testDirs.add(test[1]);
  }
  const modules = new Set([...(touched.size ? dependents([...touched]) : []), ...testDirs]);
  return { all: false, modules: [...modules].sort(), serial };
}

function changedFiles(base, head) {
  const out = execFileSync('git', ['diff', '--name-only', `${base}...${head}`], { cwd: root, encoding: 'utf8' });
  return out.split(/\r?\n/).filter(Boolean);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [base, head = 'HEAD'] = process.argv.slice(2);
  // A first push, a force push or an unknown base: no trustworthy diff, so run everything.
  const unknown = !base || /^0+$/.test(base);
  const result = unknown ? { all: true, modules: [], serial: true } : affected(changedFiles(base, head));
  const dirs = result.modules.map((name) => `test/integration/${name}`).filter((dir) => existsSync(join(root, dir)));
  console.log(result.all ? 'ALL' : dirs.length ? dirs.join(' ') : 'NONE');
  console.log(result.serial ? 'SERIAL' : 'NO-SERIAL');
}
