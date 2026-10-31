import { cpSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { cliWorkingDirectory, type CliResult, PROJECT_ROOT, runScript } from './cli-process';
import type { DisposableDatabase } from './disposable-database';

/**
 * A database with a migration history like a real one: `prisma migrate deploy` itself writes `_prisma_migrations`, so the
 * checksums a later deploy compares are the ones Prisma recorded. A history that stops at a migration is deployed from a
 * byte-for-byte copy of the committed folders up to that one; the full history from the committed folders and the
 * repository's own Prisma config. Every copy goes through `cli-process.ts` (recorded before use, removed by
 * `stopCliProcesses()`), and so does the Prisma process. Prisma runs from the project root, not from a removable working
 * directory: after a failed migration its schema engine can outlive the CLI for a few seconds and hold its working
 * directory on Windows. Every variable the config reads is passed explicitly, and `dotenv` never overrides a variable
 * that is set, so a developer `.env` cannot redirect it. Nothing here asserts.
 */
const MIGRATIONS = join(PROJECT_ROOT, 'prisma', 'migrations');
const PRISMA = join('node_modules', 'prisma', 'build', 'index.js');
/** Deploying the whole history on a cold Prisma start takes about a minute on a loaded machine. */
export const DEPLOY_TIMEOUT_MS = 240000;

/** The committed migration folders, oldest first (their names start with the timestamp). */
export function committedMigrations(): string[] {
  return readdirSync(MIGRATIONS, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

/** The one committed migration whose folder ends with `suffix` (for example `_cost_centers_unit_only`). */
export function migrationEndingWith(suffix: string): string {
  const found = committedMigrations().filter((name) => name.endsWith(suffix));
  if (found.length !== 1) throw new Error(`Expected one migration ending with ${suffix}, found ${found.length}`);

  return found[0];
}

/** The committed migration just before `name`. */
export function migrationBefore(name: string): string {
  const all = committedMigrations();
  const index = all.indexOf(name);
  if (index < 1) throw new Error(`No committed migration before ${name}`);

  return all[index - 1];
}

/** A Prisma config whose migrations are a byte-for-byte copy of the committed folders up to and including `last`. */
function configThrough(last: string): string {
  const directory = cliWorkingDirectory('slm-migration-history');
  const copy = join(directory, 'migrations');
  for (const name of committedMigrations().filter((migration) => migration <= last)) {
    cpSync(join(MIGRATIONS, name), join(copy, name), { recursive: true });
  }
  cpSync(join(MIGRATIONS, 'migration_lock.toml'), join(copy, 'migration_lock.toml'));
  const config = join(directory, 'prisma.config.mjs');
  writeFileSync(
    config,
    `export default { schema: ${JSON.stringify(join(PROJECT_ROOT, 'prisma'))}, migrations: { path: ${JSON.stringify(copy)} }, datasource: { url: process.env.DATABASE_URL } };\n`,
  );

  return config;
}

/**
 * Runs `prisma migrate deploy` on the owned database: the committed history up to and including `through`, or all of it.
 * Returns the process result (Prisma prints the failing statement's message on a failure); never throws for a failure.
 */
export function deployMigrations(database: DisposableDatabase, options: { through?: string } = {}): Promise<CliResult> {
  const config = options.through ? configThrough(options.through) : join(PROJECT_ROOT, 'prisma.config.ts');

  return runScript(PRISMA, ['migrate', 'deploy', '--config', config], {
    cwd: PROJECT_ROOT,
    environment: PRISMA_ENVIRONMENT(database),
    timeoutMs: DEPLOY_TIMEOUT_MS,
  });
}

/** What Prisma reads, and no update check (the network call of `disposable-database.ts`, P28-13). */
const PRISMA_ENVIRONMENT = (database: DisposableDatabase): Record<string, string> => ({
  NODE_ENV: 'test',
  DATABASE_URL: database.url,
  TEST_DATABASE_URL: database.url,
  CHECKPOINT_DISABLE: '1',
});

/**
 * The drift step of CI (`DB-16`) on the owned database: exit 0 when the applied migrations give exactly the schema of
 * `prisma/models`, 2 when they differ. Prisma does not see SQL-only triggers, functions or CHECK constraints.
 */
export function schemaDrift(database: DisposableDatabase): Promise<CliResult> {
  return runScript(
    PRISMA,
    [
      'migrate',
      'diff',
      '--from-config-datasource',
      '--to-schema',
      join(PROJECT_ROOT, 'prisma'),
      '--exit-code',
      '--config',
      join(PROJECT_ROOT, 'prisma.config.ts'),
    ],
    {
      cwd: PROJECT_ROOT,
      environment: PRISMA_ENVIRONMENT(database),
      timeoutMs: DEPLOY_TIMEOUT_MS,
    },
  );
}
