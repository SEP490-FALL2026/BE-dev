import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';
import { normalizeDisplayName } from '../../../src/core/display-name';
import {
  DisposableDatabase,
  dropDisposableDatabase,
  provisionDisposableDatabase,
} from '../../support/disposable-database';

const MIGRATIONS = join(process.cwd(), 'prisma', 'migrations');
const LIFECYCLE = '_job_title_lifecycle';

/** The comparison form of a title as the code gives it today: the display name in lower case. */
const normalizeJobTitleName = (name: string): string => normalizeDisplayName(name).toLowerCase();

/** How the code normalized a name before this slice: trim, NFC, lower case. */
const legacyNormalize = (name: string): string => name.trim().normalize('NFC').toLowerCase();

function migrationDirectories(): string[] {
  return readdirSync(MIGRATIONS, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

const sqlOf = (directory: string): string => readFileSync(join(MIGRATIONS, directory, 'migration.sql'), 'utf8');

describe('job title lifecycle migration (integration, R-10)', () => {
  let lifecycleDirectory: string;

  beforeAll(() => {
    lifecycleDirectory = migrationDirectories().find((name) => name.endsWith(LIFECYCLE)) ?? '';
  });

  /** A database migrated up to, and not including, the lifecycle migration: an installation as it is today. */
  async function legacyDatabase(): Promise<{ database: DisposableDatabase; sql: Client; organizationId: string }> {
    const database = await provisionDisposableDatabase();
    const sql = new Client({ connectionString: database.url });
    await sql.connect();
    for (const directory of migrationDirectories()) {
      if (directory.endsWith(LIFECYCLE)) break;
      await sql.query(sqlOf(directory));
    }
    const organizationId = randomUUID();
    await sql.query(
      `INSERT INTO organizations (id, name, time_zone, reporting_currency) VALUES ($1, 'Acme', 'UTC', 'VND')`,
      [organizationId],
    );

    return { database, sql, organizationId };
  }

  async function addLegacyTitles(sql: Client, organizationId: string, names: string[]): Promise<void> {
    for (const name of names) {
      await sql.query(`INSERT INTO job_titles (id, organization_id, name, normalized_name) VALUES ($1, $2, $3, $4)`, [
        randomUUID(),
        organizationId,
        name,
        legacyNormalize(name),
      ]);
    }
  }

  async function dispose(database: DisposableDatabase, sql: Client): Promise<void> {
    await sql.end();
    await dropDisposableDatabase(database);
  }

  it('exists', () => {
    expect(lifecycleDirectory).not.toBe('');
  });

  it('recomputes every normalized name with the rule the code now uses, so SQL and TypeScript agree', async () => {
    const { database, sql, organizationId } = await legacyDatabase();
    try {
      const names = ['Administrator', 'Kế   toán', 'ĐẠI DIỆN ƯU TIÊN', ' Senior Designer\t', 'Ké toán', 'Developer'];
      await addLegacyTitles(sql, organizationId, names);

      await sql.query(sqlOf(lifecycleDirectory));

      const { rows } = await sql.query<{ name: string; normalized_name: string }>(
        'SELECT name, normalized_name FROM job_titles',
      );
      expect(rows).toHaveLength(names.length);
      for (const row of rows) expect(row.normalized_name).toBe(normalizeJobTitleName(row.name));
    } finally {
      await dispose(database, sql);
    }
  });

  it('gives every existing title the ACTIVE status, version 1 and an update time', async () => {
    const { database, sql, organizationId } = await legacyDatabase();
    try {
      await addLegacyTitles(sql, organizationId, ['Administrator', 'Developer']);

      await sql.query(sqlOf(lifecycleDirectory));

      const { rows } = await sql.query<{ status: string; version: number; updated_at: Date | null }>(
        'SELECT status, version, updated_at FROM job_titles',
      );
      expect(rows.map((row) => [row.status, row.version])).toEqual([
        ['ACTIVE', 1],
        ['ACTIVE', 1],
      ]);
      expect(rows.every((row) => row.updated_at instanceof Date)).toBe(true);
    } finally {
      await dispose(database, sql);
    }
  });

  it('keeps the unique name per organization, now on the new rule', async () => {
    const { database, sql, organizationId } = await legacyDatabase();
    try {
      await addLegacyTitles(sql, organizationId, ['Developer']);
      await sql.query(sqlOf(lifecycleDirectory));

      await expect(
        sql.query(
          `INSERT INTO job_titles (id, organization_id, name, normalized_name) VALUES ($1, $2, 'DEVELOPER', 'developer')`,
          [randomUUID(), organizationId],
        ),
      ).rejects.toMatchObject({ code: '23505' });
    } finally {
      await dispose(database, sql);
    }
  });

  it('stops, with a message naming the names, when two titles become one under the new rule, and changes nothing', async () => {
    const { database, sql, organizationId } = await legacyDatabase();
    try {
      // Different for the old rule (spaces inside were kept), the same for the new one.
      await addLegacyTitles(sql, organizationId, ['Senior Designer', 'Senior   Designer', 'Developer']);

      await expect(sql.query(sqlOf(lifecycleDirectory))).rejects.toThrow(/senior designer/i);

      const { rows } = await sql.query<{ normalized_name: string }>(
        'SELECT normalized_name FROM job_titles ORDER BY name',
      );
      expect(rows.map((row) => row.normalized_name).sort()).toEqual([
        'developer',
        'senior   designer',
        'senior designer',
      ]);
      const columns = await sql.query(
        `SELECT 1 FROM information_schema.columns WHERE table_name = 'job_titles' AND column_name = 'status'`,
      );
      expect(columns.rows).toEqual([]);
    } finally {
      await dispose(database, sql);
    }
  });

  it('runs on an installation with no job title at all', async () => {
    const { database, sql } = await legacyDatabase();
    try {
      await expect(sql.query(sqlOf(lifecycleDirectory))).resolves.toBeDefined();
    } finally {
      await dispose(database, sql);
    }
  });
});
