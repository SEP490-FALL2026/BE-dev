import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import {
  assertDisposableDatabase,
  checkDisposableUrl,
  DisposableDatabase,
  dropDisposableDatabase,
  inspectMigrationBaseline,
  MARKER_TABLE,
  MIGRATION_KEPT_TABLES,
  MIGRATION_REFUSING_TABLES,
  provisionDisposableDatabase,
  STALE_MIGRATIONS,
} from '../support/disposable-database';

const withClient = async <T>(url: string, work: (client: Client) => Promise<T>): Promise<T> => {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    return await work(client);
  } finally {
    await client.end();
  }
};

describe('Disposable database guard (B1a)', () => {
  describe('conditions that need no database', () => {
    it.each([
      ['a remote host', 'postgresql://app:secret@db.example.com:5432/slm_ab12_test'],
      ['a host that only starts with localhost', 'postgresql://app:secret@localhost.evil.test:5432/slm_ab12_test'],
      ['a host that only starts with 127.0.0.1', 'postgresql://app:secret@127.0.0.1.nip.io:5432/slm_ab12_test'],
      ['an IPv6 loopback (not in the allowed set)', 'postgresql://app:secret@[::1]:5432/slm_ab12_test'],
    ])('refuses %s', (_label, url) => {
      expect(() => checkDisposableUrl(url)).toThrow(/localhost or 127\.0\.0\.1/);
    });

    it.each([
      ['no suffix', 'postgresql://app:secret@localhost:5432/software_license_management'],
      ['a suffix in the middle', 'postgresql://app:secret@localhost:5432/slm_test_data'],
      ['an upper-case name', 'postgresql://app:secret@localhost:5432/SLM_TEST'],
    ])('refuses a database name with %s', (_label, url) => {
      expect(() => checkDisposableUrl(url)).toThrow(/must end in "_test"/);
    });

    it('accepts a localhost URL for a `_test` database', () => {
      expect(checkDisposableUrl('postgresql://app:secret@localhost:5432/slm_ab12_test')).toEqual({
        host: 'localhost',
        database: 'slm_ab12_test',
      });
      expect(checkDisposableUrl('postgresql://app:secret@127.0.0.1:5432/slm_ab12_test').host).toBe('127.0.0.1');
    });

    it('never puts credentials in an error message', () => {
      for (const url of [
        'postgresql://app:hunter2@db.example.com:5432/slm_ab12_test',
        'postgresql://app:hunter2@localhost:5432/production',
      ]) {
        let message = '';
        try {
          checkDisposableUrl(url);
        } catch (error) {
          message = (error as Error).message;
        }
        expect(message).not.toBe('');
        expect(message).not.toContain('hunter2');
      }
    });
  });

  describe('the server that hosts disposable databases', () => {
    const original = process.env.TEST_DATABASE_ADMIN_URL;

    afterEach(() => {
      if (original === undefined) delete process.env.TEST_DATABASE_ADMIN_URL;
      else process.env.TEST_DATABASE_ADMIN_URL = original;
    });

    it('is refused before any connection when it is not on localhost', async () => {
      process.env.TEST_DATABASE_ADMIN_URL = 'postgresql://postgres:hunter2@db.example.com:5432/postgres';

      const attempt = provisionDisposableDatabase();

      await expect(attempt).rejects.toThrow(/must be on localhost or 127\.0\.0\.1/);
      await expect(attempt).rejects.not.toThrow(/hunter2/);
    });
  });

  describe('against a provisioned database', () => {
    let database: DisposableDatabase;

    beforeAll(async () => {
      database = await provisionDisposableDatabase();
    });

    afterAll(async () => {
      await dropDisposableDatabase(database);
    });

    it('is created for the run with a `_test` name and accepted for that run', async () => {
      expect(database.name).toMatch(/^slm_[0-9a-f]{8}_test$/);
      await expect(assertDisposableDatabase(database.url, database.runId)).resolves.toBeUndefined();
    });

    it('refuses a run id that does not own the database', async () => {
      await expect(assertDisposableDatabase(database.url, randomUUID())).rejects.toThrow(/no ownership marker/);
    });

    it('refuses a `_test` database on localhost that carries no marker', async () => {
      const other = await provisionDisposableDatabase();
      try {
        await withClient(other.url, (client) => client.query(`DROP TABLE "${MARKER_TABLE}"`));
        await expect(assertDisposableDatabase(other.url, other.runId)).rejects.toThrow(
          /no (readable )?ownership marker/,
        );
      } finally {
        await withClient(other.url, (client) =>
          client.query(
            `CREATE TABLE "${MARKER_TABLE}" (run_id text PRIMARY KEY); INSERT INTO "${MARKER_TABLE}" VALUES ('${other.runId}')`,
          ),
        );
        await dropDisposableDatabase(other);
      }
    });

    it('will not drop a database on behalf of a different run', async () => {
      await expect(dropDisposableDatabase({ ...database, runId: randomUUID() })).rejects.toThrow(/no ownership marker/);
      await expect(assertDisposableDatabase(database.url, database.runId)).resolves.toBeUndefined();
    });
  });
});

describe('Native migration preflight (B1a)', () => {
  let database: DisposableDatabase;

  beforeAll(async () => {
    database = await provisionDisposableDatabase();
  });

  afterAll(async () => {
    await dropDisposableDatabase(database);
  });

  it('reports a fresh database as safe, with every baseline table at zero', async () => {
    const result = await inspectMigrationBaseline(database.url);

    expect(result).toMatchObject({ migrationIds: [], staleMigrations: [], actionAllowed: true, blockedBy: [] });
    for (const table of [...MIGRATION_REFUSING_TABLES, ...MIGRATION_KEPT_TABLES]) {
      expect(result.rowCounts[table]).toBe(0);
    }
  });

  it.each(MIGRATION_REFUSING_TABLES)('refuses when %s holds rows', async (table) => {
    await withClient(database.url, async (client) => {
      await client.query(`CREATE TABLE "${table}" (id int)`);
      await client.query(`INSERT INTO "${table}" VALUES (1)`);
    });
    try {
      const result = await inspectMigrationBaseline(database.url);

      expect(result.actionAllowed).toBe(false);
      expect(result.blockedBy).toEqual([table]);
      expect(result.rowCounts[table]).toBe(1);
    } finally {
      await withClient(database.url, (client) => client.query(`DROP TABLE "${table}"`));
    }
  });

  it('does not refuse because of tables the native migration leaves alone', async () => {
    await withClient(database.url, async (client) => {
      await client.query('CREATE TABLE "access_requests" (id int)');
      await client.query('INSERT INTO "access_requests" VALUES (1)');
    });
    try {
      const result = await inspectMigrationBaseline(database.url);

      expect(result.rowCounts.access_requests).toBe(1);
      expect(result.actionAllowed).toBe(true);
    } finally {
      await withClient(database.url, (client) => client.query('DROP TABLE "access_requests"'));
    }
  });

  it('reports the removed S0 migration when it is still in the history', async () => {
    await withClient(database.url, async (client) => {
      await client.query('CREATE TABLE "_prisma_migrations" (migration_name text, started_at timestamptz)');
      await client.query(
        `INSERT INTO "_prisma_migrations" VALUES ('20260812000000_initial_foundation', now()), ('${STALE_MIGRATIONS[0]}', now() + interval '1 second')`,
      );
    });
    try {
      const result = await inspectMigrationBaseline(database.url);

      expect(result.migrationIds).toEqual(['20260812000000_initial_foundation', STALE_MIGRATIONS[0]]);
      expect(result.staleMigrations).toEqual([STALE_MIGRATIONS[0]]);
    } finally {
      await withClient(database.url, (client) => client.query('DROP TABLE "_prisma_migrations"'));
    }
  });

  it('carries no credentials in its report', async () => {
    const result = await inspectMigrationBaseline(database.url);
    const { password } = new URL(database.url);

    if (password) expect(JSON.stringify(result)).not.toContain(password);
    expect(Object.keys(result).sort()).toEqual([
      'actionAllowed',
      'blockedBy',
      'migrationIds',
      'rowCounts',
      'staleMigrations',
    ]);
  });
});
