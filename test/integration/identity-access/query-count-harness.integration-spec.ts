import { randomUUID } from 'node:crypto';
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
  let day = 0;

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
      roles: ['FINANCE'],
      admin,
    });
    organizationId = (await ctx.sql.query<{ id: string }>('SELECT id FROM organizations')).rows[0].id;
    counter = QueryCounter.on(relay);
  }, 120000);

  afterAll(async () => {
    await ctx?.close();
    await relay?.stop();
  });

  /** Rates written straight to the table: fixtures go through the direct URL, never through the counted relay. */
  const addRates = async (count: number): Promise<void> => {
    for (let index = 0; index < count; index += 1) {
      day += 1;
      await ctx.sql.query(
        `INSERT INTO exchange_rates (id, organization_id, currency, rate_date, rate)
         VALUES ($1, $2, 'JPY', DATE '2025-01-01' + $3::int, 171.5)`,
        [randomUUID(), organizationId, day],
      );
    }
  };
  const listRates = () =>
    counter.run(() =>
      request(ctx.app.getHttpServer())
        .get('/api/v1/exchange-rates?pageSize=100')
        .set({ Authorization: `Bearer ${finance.accessToken}` })
        .expect(200),
    );

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

  describe('characterization of an unchanged list (exchangeRateList)', () => {
    it('runs the same statements for 5 and for 60 rates, reads only exchange_rates and records no bind value', async () => {
      await addRates(5);
      const few = await listRates();
      await addRates(55);
      const many = await listRates();

      expect((few.result.body as { data: { items: unknown[] } }).data.items).toHaveLength(5);
      expect((many.result.body as { data: { items: unknown[] } }).data.items).toHaveLength(60);
      expect(dataStatements(many.statements)).toEqual(dataStatements(few.statements));
      const rateReads = dataStatements(many.statements).filter((sql) => tablesOf(sql).includes('exchange_rates'));
      // The page and its count, each from exchange_rates alone: no join, no per-row read.
      expect(rateReads.map(tablesOf)).toEqual([['exchange_rates'], ['exchange_rates']]);
      expect(JSON.stringify(many.statements)).not.toContain(organizationId);
    });
  });

  describe('a per-row read in a fixture', () => {
    /** One statement for the whole set: the shape every collection must have. */
    const readBatched = (client: Client, ids: string[]) =>
      client.query('SELECT id, rate::text FROM exchange_rates WHERE id = ANY($1::uuid[])', [ids]);
    /** One statement per row: the N+1 the harness exists to catch. */
    const readPerRow = async (client: Client, ids: string[]) => {
      for (const id of ids) await client.query('SELECT id, rate::text FROM exchange_rates WHERE id = $1', [id]);
    };

    it('shows a constant count for the batched read and a count that grows with the rows for the per-row one', async () => {
      const ids = (await ctx.sql.query<{ id: string }>('SELECT id FROM exchange_rates ORDER BY id')).rows.map(
        (row) => row.id,
      );
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
