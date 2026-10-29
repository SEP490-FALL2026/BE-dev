import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The order of the migrations (F51, `DB-15`). A database that already applied the merged migrations must never meet a NEW
 * migration whose name sorts before one of them: Prisma applies unapplied migrations by name, so such a migration would run
 * against data the older ones already changed, in an order nobody tested. The merged migrations are listed in
 * `scripts/verify/merged-migrations.txt` (one folder name per line, written when a release is merged — the line to add is the
 * only maintenance); a migration that is not in that list must sort after the last one in it, and a merged migration is never
 * renamed or removed (a deployed database holds its checksum under that name).
 */
const MIGRATION_NAME = /^\d{14}_[a-z0-9]+(_[a-z0-9]+)*$/;

function migrationOrderProblems(merged: readonly string[], onDisk: readonly string[]): string[] {
  const problems: string[] = [];
  const disk = new Set(onDisk);
  const mergedSet = new Set(merged);

  for (const name of [...merged, ...onDisk]) {
    if (!MIGRATION_NAME.test(name))
      problems.push(`${name}: a migration folder is <14 digit UTC time>_<snake_case words>`);
  }
  for (const name of merged) {
    if (!disk.has(name))
      problems.push(`${name}: a merged migration was renamed or removed (a deployed database holds its checksum)`);
  }
  const sortedMerged = [...merged].sort();
  if (merged.some((name, index) => name !== sortedMerged[index])) {
    problems.push('merged-migrations.txt is not in ascending order of the folder names');
  }
  const last = sortedMerged[sortedMerged.length - 1] ?? '';
  for (const name of onDisk) {
    if (!mergedSet.has(name) && name <= last) {
      problems.push(`${name}: a new migration must sort after the last merged one (${last})`);
    }
  }
  const seen = new Set<string>();
  for (const name of onDisk) {
    if (seen.has(name)) problems.push(`${name}: duplicated`);
    seen.add(name);
  }

  return [...new Set(problems)].sort();
}

describe('migrationOrderProblems', () => {
  const merged = ['20261001000000_first', '20261002000000_second'];

  it('accepts a new migration after the last merged one and the merged ones as they are', () => {
    expect(migrationOrderProblems(merged, [...merged, '20261003000000_third'])).toEqual([]);
  });

  it('names a new migration that sorts before the last merged one (the F51 failure)', () => {
    expect(migrationOrderProblems(merged, [...merged, '20261001120000_backwards'])).toEqual([
      '20261001120000_backwards: a new migration must sort after the last merged one (20261002000000_second)',
    ]);
  });

  it('names a merged migration that was renamed or removed', () => {
    expect(migrationOrderProblems(merged, ['20261001000000_first', '20261002000000_renamed'])).toEqual([
      '20261002000000_renamed: a new migration must sort after the last merged one (20261002000000_second)',
      '20261002000000_second: a merged migration was renamed or removed (a deployed database holds its checksum)',
    ]);
  });

  it('names a folder that is not <time>_<words>', () => {
    expect(migrationOrderProblems(merged, [...merged, '20261003_short'])).toEqual([
      '20261003_short: a migration folder is <14 digit UTC time>_<snake_case words>',
    ]);
  });

  it('names a merged list that is not ascending', () => {
    expect(migrationOrderProblems([merged[1], merged[0]], merged)).toEqual([
      'merged-migrations.txt is not in ascending order of the folder names',
    ]);
  });
});

describe('the migrations of the repository', () => {
  const root = join(__dirname, '..', '..');
  const merged = readFileSync(join(root, 'scripts', 'verify', 'merged-migrations.txt'), 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const onDisk = readdirSync(join(root, 'prisma', 'migrations'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  it('keep the order every deployed database already applied (a new migration sorts last, a merged one is untouched)', () => {
    expect(migrationOrderProblems(merged, onDisk)).toEqual([]);
  });
});
