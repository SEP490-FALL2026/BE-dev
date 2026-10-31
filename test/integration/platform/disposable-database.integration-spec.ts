import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import {
  assertDisposableDatabase,
  assertIntegrationDatabaseRole,
  checkDisposableUrl,
  DisposableDatabase,
  DisposableDatabaseError,
  dropDisposableDatabase,
  MARKER_TABLE,
  provisionDisposableDatabase,
} from '../../support/disposable-database';

// pg exposes callback overloads last; select its promise API for these boundary stubs.
const promiseClientPrototype = Client.prototype as unknown as {
  connect(): Promise<void>;
  end(): Promise<void>;
  query(sql: string): Promise<{ rows: Record<string, unknown>[]; rowCount?: number }>;
};

const withClient = async <T>(url: string, work: (client: Client) => Promise<T>): Promise<T> => {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    return await work(client);
  } finally {
    await client.end();
  }
};

describe('Disposable database guard', () => {
  describe('ordinary integration role assertion without a database', () => {
    const ordinaryRole = {
      rolsuper: false,
      rolcreatedb: true,
      rolcreaterole: false,
      rolreplication: false,
      rolcanlogin: true,
      rolbypassrls: false,
    };

    afterEach(() => jest.restoreAllMocks());

    it('accepts only a login role with CREATEDB and no elevated attributes', async () => {
      await expect(
        assertIntegrationDatabaseRole({ query: () => Promise.resolve({ rows: [ordinaryRole] }) }),
      ).resolves.toBeUndefined();
    });

    it.each([
      ['a superuser', { rolsuper: true }],
      ['a role without CREATEDB', { rolcreatedb: false }],
      ['a role creator', { rolcreaterole: true }],
      ['a replication role', { rolreplication: true }],
      ['a role without LOGIN', { rolcanlogin: false }],
      ['a role with BYPASSRLS', { rolbypassrls: true }],
    ])('refuses %s', async (_label, attributes) => {
      await expect(
        assertIntegrationDatabaseRole({ query: () => Promise.resolve({ rows: [{ ...ordinaryRole, ...attributes }] }) }),
      ).rejects.toThrow(/NOSUPERUSER CREATEDB NOCREATEROLE NOREPLICATION/);
    });

    it('fails closed when the role is missing or attributes are unreadable', async () => {
      await expect(assertIntegrationDatabaseRole({ query: () => Promise.resolve({ rows: [] }) })).rejects.toThrow();
      await expect(
        assertIntegrationDatabaseRole({
          query: () => Promise.resolve({ rows: [{ ...ordinaryRole, rolcreatedb: null }] }),
        }),
      ).rejects.toThrow();
    });

    it('refuses a superuser before creating any database', async () => {
      const original = process.env.TEST_DATABASE_ADMIN_URL;
      process.env.TEST_DATABASE_ADMIN_URL = 'postgresql://bootstrap:test-only@127.0.0.1:5432/postgres';
      jest.spyOn(promiseClientPrototype, 'connect').mockResolvedValue(undefined);
      jest.spyOn(promiseClientPrototype, 'end').mockResolvedValue(undefined);
      const query = jest
        .spyOn(promiseClientPrototype, 'query')
        .mockResolvedValue({ rows: [{ ...ordinaryRole, rolsuper: true }] });
      try {
        await expect(provisionDisposableDatabase()).rejects.toThrow(/Do not use the bootstrap role/);
        expect(query).toHaveBeenCalledTimes(1);
        expect(query.mock.calls[0][0]).not.toContain('CREATE DATABASE');
      } finally {
        if (original === undefined) delete process.env.TEST_DATABASE_ADMIN_URL;
        else process.env.TEST_DATABASE_ADMIN_URL = original;
      }
    });
  });

  describe('teardown diagnostics without a database', () => {
    const database = {
      url: 'postgresql://app:hunter2@127.0.0.1:5432/slm_ab12_test',
      name: 'slm_ab12_test',
      runId: 'run-id',
    };

    afterEach(() => jest.restoreAllMocks());

    it.each([
      [false, false],
      [true, false],
      [false, true],
      [true, true],
    ])(
      'preserves the DROP SQLSTATE with diagnostics failure %s and close failure %s',
      async (diagnosticsFail, closeFail) => {
        jest.spyOn(promiseClientPrototype, 'connect').mockResolvedValue(undefined);
        let closes = 0;
        jest.spyOn(promiseClientPrototype, 'end').mockImplementation(() => {
          if (++closes > 1 && closeFail) return Promise.reject(Object.assign(new Error('hunter2'), { code: '08006' }));
          return Promise.resolve();
        });
        const query = jest.spyOn(promiseClientPrototype, 'query').mockImplementation((sql: string) => {
          if (sql.startsWith('SELECT run_id')) return Promise.resolve({ rowCount: 1, rows: [{ run_id: 'run-id' }] });
          if (sql.startsWith('DROP DATABASE')) {
            return Promise.reject(
              Object.assign(new Error('query includes hunter2 and private business data'), { code: '55006' }),
            );
          }
          if (sql.includes('pg_stat_activity')) {
            if (diagnosticsFail) return Promise.reject(Object.assign(new Error('hunter2'), { code: '42501' }));
            return Promise.resolve({
              rows: [
                {
                  database: database.name,
                  application_name: 'slm-api',
                  pid: 123,
                  state: 'idle in transaction',
                  wait_event_type: 'Client',
                  wait_event: 'ClientRead',
                  query: 'SELECT private_business_data',
                  password: 'hunter2',
                },
              ],
            });
          }
          throw new Error('Unexpected diagnostic query');
        });

        let failure: unknown;
        try {
          await dropDisposableDatabase(database);
        } catch (error) {
          failure = error;
        }

        expect(failure).toBeInstanceOf(DisposableDatabaseError);
        expect(failure).toMatchObject({ sqlState: '55006' });
        expect(
          query.mock.calls.filter(([sql]) => typeof sql === 'string' && sql.startsWith('DROP DATABASE')),
        ).toHaveLength(1);
        const serialized = JSON.stringify(failure) + (failure as Error).message;
        expect(serialized).not.toMatch(/hunter2|private_business_data|postgresql:\/\//);
        if (diagnosticsFail) expect(serialized).toContain('42501');
        else {
          expect(serialized).toContain('slm-api');
          expect(serialized).toContain('idle in transaction');
          expect(serialized).toContain('123');
        }
        if (closeFail) expect(serialized).toContain('08006');
      },
    );
  });

  describe('teardown while autovacuum works in the database (GATE-02)', () => {
    const database = {
      url: 'postgresql://app:hunter2@127.0.0.1:5432/slm_ab12_test',
      name: 'slm_ab12_test',
      runId: 'run-id',
    };

    afterEach(() => jest.restoreAllMocks());

    // PostgreSQL refuses `DROP DATABASE ... WITH (FORCE)` from an ordinary role with 42501 while a process it may not
    // signal is in the database: an autovacuum worker (reproduced 22/10/2026 on PostgreSQL 17). The ordinary role
    // cannot even see that process's backend_type. A plain DROP DATABASE signals autovacuum workers itself and
    // terminates nothing else: a real session still holding the database makes it fail with 55006.
    const stubDrop = (plainDrop: 'succeeds' | 'held by a session') => {
      jest.spyOn(promiseClientPrototype, 'connect').mockResolvedValue(undefined);
      jest.spyOn(promiseClientPrototype, 'end').mockResolvedValue(undefined);
      return jest.spyOn(promiseClientPrototype, 'query').mockImplementation((sql: string) => {
        if (sql.startsWith('SELECT run_id')) return Promise.resolve({ rowCount: 1, rows: [{ run_id: 'run-id' }] });
        if (sql.endsWith('WITH (FORCE)'))
          return Promise.reject(Object.assign(new Error('permission denied to terminate process'), { code: '42501' }));
        if (sql.startsWith('DROP DATABASE'))
          return plainDrop === 'succeeds'
            ? Promise.resolve({ rows: [] })
            : Promise.reject(Object.assign(new Error('database is being accessed by other users'), { code: '55006' }));
        if (sql.includes('pg_stat_activity'))
          return Promise.resolve({
            rows: [
              {
                database: database.name,
                application_name: '',
                pid: 900,
                state: null,
                wait_event_type: null,
                wait_event: null,
              },
            ],
          });
        throw new Error('Unexpected query');
      });
    };
    const drops = (query: jest.SpyInstance) =>
      query.mock.calls.map(([sql]) => String(sql)).filter((sql) => sql.startsWith('DROP DATABASE'));

    it('drops once more without FORCE when FORCE may not terminate a process in the database (42501)', async () => {
      const query = stubDrop('succeeds');

      await dropDisposableDatabase(database);

      expect(drops(query)).toEqual(['DROP DATABASE "slm_ab12_test" WITH (FORCE)', 'DROP DATABASE "slm_ab12_test"']);
    });

    it('fails with both SQLSTATEs and no third DROP when a session still holds the database', async () => {
      const query = stubDrop('held by a session');

      await expect(dropDisposableDatabase(database)).rejects.toMatchObject({
        sqlState: '42501',
        diagnostics: { plainDropSqlState: '55006' },
      });
      expect(drops(query)).toHaveLength(2);
    });
  });

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

    it.each([
      'https://localhost/example_test',
      'postgresql://app:secret@localhost/example_test?host=remote.example.com',
      'postgresql://app:secret@localhost/example_test?dbname=production',
    ])('refuses a URL that can redirect the database target: %s', (url) => {
      expect(() => checkDisposableUrl(url)).toThrow();
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
      if (database) await dropDisposableDatabase(database);
    });

    it('is created for the run with a `_test` name and accepted for that run', async () => {
      expect(database.name).toMatch(/^slm_[0-9a-f]{8}_test$/);
      await expect(assertDisposableDatabase(database.url, database.runId)).resolves.toBeUndefined();
    });

    it('uses the ordinary CREATEDB role required by CI', async () => {
      await withClient(database.url, async (client) => {
        await expect(assertIntegrationDatabaseRole(client)).resolves.toBeUndefined();
      });
    });

    it('refuses a run id that does not own the database', async () => {
      await expect(assertDisposableDatabase(database.url, randomUUID())).rejects.toThrow(/no ownership marker/);
    });

    it('refuses a `_test` database on localhost that carries no marker', async () => {
      const other = await provisionDisposableDatabase();
      try {
        await withClient(other.url, (client) => client.query(`DROP TABLE test_harness."${MARKER_TABLE}"`));
        await expect(assertDisposableDatabase(other.url, other.runId)).rejects.toThrow(
          /no (readable )?ownership marker/,
        );
      } finally {
        await withClient(other.url, (client) =>
          client.query(
            `CREATE TABLE test_harness."${MARKER_TABLE}" (run_id text PRIMARY KEY); INSERT INTO test_harness."${MARKER_TABLE}" VALUES ('${other.runId}')`,
          ),
        );
        await dropDisposableDatabase(other);
      }
    });

    it('rejects a forged name without touching the owned database', async () => {
      await expect(dropDisposableDatabase({ ...database, name: 'another_test' })).rejects.toThrow(/does not match/);
      await expect(assertDisposableDatabase(database.url, database.runId)).resolves.toBeUndefined();
    });

    it('uses the owned handle even when the admin environment changes', async () => {
      const owned = await provisionDisposableDatabase();
      const original = process.env.TEST_DATABASE_ADMIN_URL;
      process.env.TEST_DATABASE_ADMIN_URL = 'postgresql://app:secret@remote.example.com/postgres';
      try {
        await expect(dropDisposableDatabase(owned)).resolves.toBeUndefined();
      } finally {
        if (original === undefined) delete process.env.TEST_DATABASE_ADMIN_URL;
        else process.env.TEST_DATABASE_ADMIN_URL = original;
      }
    });

    it('will not drop a database on behalf of a different run', async () => {
      await expect(dropDisposableDatabase({ ...database, runId: randomUUID() })).rejects.toThrow(/no ownership marker/);
      await expect(assertDisposableDatabase(database.url, database.runId)).resolves.toBeUndefined();
    });
  });
});
