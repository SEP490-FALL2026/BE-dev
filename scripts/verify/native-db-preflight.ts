// pnpm db:preflight
// Read-only report of what the native migration (B1b) would meet in the database that
// DATABASE_URL points to. Exit 0 when the migration may be applied, 1 when it must be refused.
// Prints counts and migration names only, never credentials or row contents.
import { config } from 'dotenv';
import { inspectMigrationBaseline } from '../../test/support/disposable-database';

config({ quiet: true });

async function main(): Promise<number> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is not set.');
    return 1;
  }

  const result = await inspectMigrationBaseline(url);
  console.log(JSON.stringify(result, null, 2));

  if (result.staleMigrations.length > 0) {
    console.warn(
      `Warning: this database still lists the removed migration(s) ${result.staleMigrations.join(', ')}. ` +
        'Use a new disposable database for the native migration; do not reset this one.',
    );
  }
  if (!result.actionAllowed) {
    console.error(`Refused: the native migration would destroy or reshape rows in ${result.blockedBy.join(', ')}.`);
    return 1;
  }
  console.log('Preflight passed: no row would be destroyed or reshaped.');
  return 0;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    console.error('Preflight could not run:', error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  },
);
