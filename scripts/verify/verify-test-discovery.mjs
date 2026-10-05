// pnpm test:discovery
// Proves every spec file is picked up by exactly the runner its location promises, and that
// nothing is orphaned. Reads the taxonomy from runners.mjs; fails on any violation.
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RUNNERS } from './runners.mjs';
import { layoutProblems, listingProblems, missingRequired, toPosix } from './test-layout.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const jestBin = createRequire(join(root, 'package.json')).resolve('jest/bin/jest');
const SKIP = new Set(['node_modules', 'generated', 'dist', 'coverage']);

function walk(dir) {
  return readdirSync(join(root, dir), { withFileTypes: true }).flatMap((entry) => {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) return SKIP.has(entry.name) ? [] : walk(path);
    return entry.name.endsWith('.ts') ? [path] : [];
  });
}

function listed(runner) {
  const args = [jestBin, '--listTests', ...(runner.config ? ['--config', runner.config] : [])];
  const out = execFileSync(process.execPath, args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  return out
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => toPosix(relative(root, line)));
}

export function run() {
  const files = ['src', 'test'].flatMap(walk).map(toPosix);
  const problems = [...layoutProblems(files), ...missingRequired(files)];
  const counts = [];

  for (const runner of RUNNERS) {
    const onDisk = files.filter(
      (file) => file.endsWith(runner.suffix) && runner.roots.some((r) => file.startsWith(`${r}/`)),
    );
    if (runner.jest) {
      let result;
      try {
        result = listed(runner);
      } catch (error) {
        const detail = String(error.stdout ?? '') + String(error.stderr ?? '');
        // jest exits non-zero when it finds no tests; that is fine only if the disk agrees.
        result = onDisk.length === 0 ? [] : null;
        if (result === null)
          problems.push(`${runner.name}: jest --listTests failed: ${detail.trim() || error.message}`);
      }
      if (result) problems.push(...listingProblems(runner, result, files));
    }
    counts.push(`${runner.name.padEnd(12)} ${String(onDisk.length).padStart(3)} spec file(s)`);
  }

  console.log(counts.join('\n'));
  if (problems.length) {
    console.error(`\nTest discovery FAILED (${problems.length}):`);
    for (const problem of problems) console.error(`  - ${problem}`);
    return 1;
  }
  console.log(
    '\nTest discovery passed: every spec file belongs to exactly one runner and every runner lists what the layout promises.',
  );
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = run();
