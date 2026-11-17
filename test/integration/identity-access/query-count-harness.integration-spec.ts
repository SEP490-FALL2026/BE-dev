import request from 'supertest';
import { Client } from 'pg';
import { ApiAccount, adminToken, createActivatedAccount } from '../../support/api-accounts';
import { HttpTestApp, createHttpTestApp, seedInstallation } from '../../support/http-test-app';
import { PgRelay } from '../../support/pg-relay';
import { QueryCounter, dataStatements, tablesOf } from '../../support/query-count';

/**
 * API-LIST-DETAIL.1, LD-R3: the statement-count harness itself. A collection test of a capability item uses it the way
 * the second describe below does: a fixed number of statements whatever the number of rows, a direct projection, and no
 * bind value in what it records. The third describe shows it catching a per-row fan-out.
 */
describe('query-count harness (integration, real PostgreSQL)', () => {
  let ctx: HttpTestApp;
  let relay: PgRelay;
  let relayUrl: string;
  let finance: ApiAccount;
  let organizationId: string;
  let counter: QueryCounter;
  let added = 0;

  beforeAll(async () => {
    ctx = await createHttpTestApp({
      appDatabaseUrl: async (directUrl) => {
        const url = new URL(directUrl);
        relay = await PgRelay.start(url.hostname, Number(url.port || 5432));
        url.port = String(relay.port);
        relayUrl = url.toString();
        return relayUrl;
      },
    });
    const seed = await seedInstallation(ctx.app);
    const admin = await adminToken(ctx, seed);
    finance = await createActivatedAccount(ctx, seed, {
      code: 'E-FIN',
      email: 'fin@acme.vn',
      role: 'FINANCE',
      admin,
    });
    organizationId = (await ctx.sql.query<{ id: string }>('SELECT id FROM organizations')).rows[0].id;
    counter = QueryCounter.on(relay);
  }, 120000);

  afterAll(async () => {
    await ctx?.close();
    await relay?.stop();
  });

  /** Currencies written straight to the table: fixtures go through the direct URL, never through the counted relay. */
  const addCurrencies = async (count: number): Promise<void> => {
    for (let index = 0; index < count; index += 1) {
      const code = `Q${String.fromCharCode(65 + Math.floor(added / 26))}${String.fromCharCode(65 + (added % 26))}`;
      added += 1;
      await ctx.sql.query(`INSERT INTO currencies (code, name, minor_unit) VALUES ($1, 'Fixture', 2)`, [code]);
    }
  };
  const listCurrencies = () =>
    counter.run(() =>
      request(ctx.app.getHttpServer())
        .get('/api/v1/currencies')
        .set({ Authorization: `Bearer ${finance.accessToken}` })
        .expect(200),
    );
  const itemsOf = (response: { result: { body: unknown } }) =>
    (response.result.body as { data: { items: unknown[] } }).data.items;

  describe('what it records', () => {
    it('counts every execution once, a re-executed prepared statement included, with SQL text and no bind value', async () => {
      const client = new Client({ connectionString: relayUrl });
      await client.connect();
      try {
        const { statements } = await counter.run(async () => {
          await client.query('SELECT $1::text AS marker', ['bind-value-never-recorded']);
          // A named statement is parsed once; its second execution sends only Bind and Execute.
          await client.query({ name: 'probe', text: 'SELECT 1 + $1::int AS next', values: [41] });
          await client.query({ name: 'probe', text: 'SELECT 1 + $1::int AS next', values: [42] });
        });

        expect(statements).toEqual([
          'SELECT $1::text AS marker',
          'SELECT 1 + $1::int AS next',
          'SELECT 1 + $1::int AS next',
        ]);
        expect(JSON.stringify(statements)).not.toContain('bind-value-never-recorded');
      } finally {
        await client.end();
      }
    });

    it('records nothing outside run', async () => {
      const client = new Client({ connectionString: relayUrl });
      await client.connect();
      try {
        await client.query('SELECT 1');
        const { statements } = await counter.run(() => Promise.resolve(undefined));

        expect(statements).toEqual([]);
      } finally {
        await client.end();
      }
    });
  });

  describe('characterization of an unchanged list (currencyList)', () => {
    it('runs the same statements for 5 and for 60 more currencies, reads only currencies and records no bind value', async () => {
      const base = itemsOf(await listCurrencies()).length;
      await addCurrencies(5);
      const few = await listCurrencies();
      await addCurrencies(55);
      const many = await listCurrencies();

      expect(itemsOf(few)).toHaveLength(base + 5);
      expect(itemsOf(many)).toHaveLength(base + 60);
      expect(dataStatements(many.statements)).toEqual(dataStatements(few.statements));
      const currencyReads = dataStatements(many.statements).filter((sql) => tablesOf(sql).includes('currencies'));
      // The list is one read of currencies alone: no join, no per-row read.
      expect(currencyReads.map(tablesOf)).toEqual([['currencies']]);
      expect(JSON.stringify(many.statements)).not.toContain(organizationId);
    });
  });

  describe('a per-row read in a fixture', () => {
    /** One statement for the whole set: the shape every collection must have. */
    const readBatched = (client: Client, ids: string[]) =>
      client.query('SELECT code, name FROM currencies WHERE code = ANY($1::text[])', [ids]);
    /** One statement per row: the N+1 the harness exists to catch. */
    const readPerRow = async (client: Client, ids: string[]) => {
      for (const id of ids) await client.query('SELECT code, name FROM currencies WHERE code = $1', [id]);
    };

    it('shows a constant count for the batched read and a count that grows with the rows for the per-row one', async () => {
      const ids = (
        await ctx.sql.query<{ code: string }>(`SELECT code FROM currencies WHERE code LIKE 'Q%' ORDER BY code`)
      ).rows.map((row) => row.code);
      const client = new Client({ connectionString: relayUrl });
      await client.connect();
      try {
        const count = async (read: (c: Client, i: string[]) => Promise<unknown>, rows: number) =>
          dataStatements((await counter.run(() => read(client, ids.slice(0, rows)))).statements).length;

        expect([await count(readBatched, 5), await count(readBatched, 50)]).toEqual([1, 1]);
        expect([await count(readPerRow, 5), await count(readPerRow, 50)]).toEqual([5, 50]);
      } finally {
        await client.end();
      }
    });
  });
});
