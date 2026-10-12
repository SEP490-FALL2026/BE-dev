import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import {
  assertDisposableDatabase,
  checkDisposableUrl,
  DisposableDatabase,
  dropDisposableDatabase,
  MARKER_TABLE,
  provisionDisposableDatabase,
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

describe('Disposable database guard', () => {
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
