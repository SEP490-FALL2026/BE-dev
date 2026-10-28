import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';
import { dropDisposableDatabase, provisionDisposableDatabase } from '../support/disposable-database';

const MIGRATIONS = join(process.cwd(), 'prisma', 'migrations');

const migrationDirectories = (): string[] =>
  readdirSync(MIGRATIONS, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

describe('legacy catalog sample removal (integration, g3-catalog-foundation)', () => {
  it('leaves no catalog_applications table and no CatalogApplicationStatus type after every migration', async () => {
    const database = await provisionDisposableDatabase();
    const sql = new Client({ connectionString: database.url });
    await sql.connect();

    try {
      // `prisma migrate deploy` keeps `_prisma_migrations`, which a replay of the files does not make; a migration of G6 reads it
      // (F47) and, for a database that recorded nothing, changes nothing. The same table, empty, as Prisma creates it.
      await sql.query(`CREATE TABLE "_prisma_migrations" (
        "id" VARCHAR(36) PRIMARY KEY NOT NULL,
        "checksum" VARCHAR(64) NOT NULL,
        "finished_at" TIMESTAMPTZ,
        "migration_name" VARCHAR(255) NOT NULL,
        "logs" TEXT,
        "rolled_back_at" TIMESTAMPTZ,
        "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "applied_steps_count" INTEGER NOT NULL DEFAULT 0
      )`);
      for (const directory of migrationDirectories()) {
        await sql.query(readFileSync(join(MIGRATIONS, directory, 'migration.sql'), 'utf8'));
      }
      const table = await sql.query<{ name: string | null }>(
        `SELECT to_regclass('public.catalog_applications') AS name`,
      );
      const type = await sql.query<{ count: number }>(
        `SELECT count(*)::int AS count FROM pg_type WHERE typname = 'CatalogApplicationStatus'`,
      );

      expect(table.rows[0].name).toBeNull();
      expect(type.rows[0].count).toBe(0);
    } finally {
      await sql.end();
      await dropDisposableDatabase(database);
    }
  });
});
