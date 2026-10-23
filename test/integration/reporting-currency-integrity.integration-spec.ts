import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';
import {
  DisposableDatabase,
  dropDisposableDatabase,
  migrateDisposableDatabase,
  provisionDisposableDatabase,
} from '../support/disposable-database';
import { waitForLockWaiters } from '../support/lock-wait';

const MIGRATIONS = join(process.cwd(), 'prisma', 'migrations');
const INTEGRITY = '_reporting_currency_integrity';

const migrationDirectories = (): string[] =>
  readdirSync(MIGRATIONS, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
const sqlOf = (directory: string): string => readFileSync(join(MIGRATIONS, directory, 'migration.sql'), 'utf8');

/** The SQLSTATE of a rejected statement, or null when it ran: the database, not the application, said no. */
async function sqlState(client: Client, text: string, values: unknown[] = []): Promise<string | null> {
  try {
    await client.query(text, values);

    return null;
  } catch (error) {
    return (error as { code?: string }).code ?? 'unknown';
  }
}

/** Runs the statement without waiting for it, so a test can watch it queue on a lock first. */
const start = (client: Client, text: string, values: unknown[] = []): Promise<string | null> =>
  sqlState(client, text, values);

describe('reporting currency integrity (integration, DB-01 and DB-02 of the post-merge review)', () => {
  interface Fixture {
    database: DisposableDatabase;
    admin: Client;
    first: Client;
    second: Client;
    observer: Client;
    organizationId: string;
    planId: string;
  }

  const connect = async (database: DisposableDatabase): Promise<Client> => {
    const client = new Client({ connectionString: database.url });
    await client.connect();

    return client;
  };

  /** A migrated installation with VND as its reporting currency, a plan to price, and four connections. */
  async function fixture(): Promise<Fixture> {
    const database = await provisionDisposableDatabase();
    await migrateDisposableDatabase(database);
    const [admin, first, second, observer] = [
      await connect(database),
      await connect(database),
      await connect(database),
      await connect(database),
    ];
    const organizationId = randomUUID();
    await admin.query(
      `INSERT INTO organizations (id, name, time_zone, reporting_currency) VALUES ($1, 'Acme', 'UTC', 'VND')`,
      [organizationId],
    );
    const ownerId = randomUUID();
    await admin.query(
      `INSERT INTO employees (id, organization_id, employee_code, full_name, employment_type, hire_date, updated_at)
       VALUES ($1, $2, 'E-1', 'Owner One', 'STAFF', '2026-01-01', now())`,
      [ownerId, organizationId],
    );
    const vendorId = randomUUID();
    await admin.query(
      `INSERT INTO vendors (id, organization_id, name, normalized_name) VALUES ($1, $2, 'Figma', 'figma')`,
      [vendorId, organizationId],
    );
    const applicationId = randomUUID();
    await admin.query(
      `INSERT INTO applications (id, organization_id, kind, vendor_id, name, normalized_name, business_owner_employee_id,
         data_sensitivity, comm_person_to_person_messaging, comm_calls_or_meetings, comm_mailbox, is_communication_service)
       VALUES ($1, $2, 'SAAS', $3, 'Figma', 'figma', $4, 'LOW', false, false, false, false)`,
      [applicationId, organizationId, vendorId, ownerId],
    );
    const planId = randomUUID();
    await admin.query(
      `INSERT INTO plans (id, organization_id, application_id, name, normalized_name, provisioning_type, pricing_model, control_level)
       VALUES ($1, $2, $3, 'Pro', 'pro', 'K2', 'PER_SEAT', 'FULL')`,
      [planId, organizationId, applicationId],
    );

    return { database, admin, first, second, observer, organizationId, planId };
  }

  async function dispose(f: Fixture): Promise<void> {
    for (const client of [f.first, f.second]) await client.query('ROLLBACK').catch(() => undefined);
    for (const client of [f.admin, f.first, f.second, f.observer]) await client.end().catch(() => undefined);
    await dropDisposableDatabase(f.database);
  }

  /** A statement the database must queue behind another transaction's lock; it must not slip through. */
  const expectQueued = (f: Fixture): Promise<void> => waitForLockWaiters(f.observer, 1, 5_000);

  const insertRate = (organizationId: string, currency: string): [string, unknown[]] => [
    `INSERT INTO exchange_rates (id, organization_id, currency, rate_date, rate) VALUES ($1, $2, $3, '2026-09-01', 25000)`,
    [randomUUID(), organizationId, currency],
  ];

  /** A draft subscription whose price was recorded in `currency` and frozen into `reportingCurrency` at rate 1. */
  const insertPriced = (f: Fixture, currency: string, reportingCurrency: string): [string, unknown[]] => [
    `INSERT INTO subscriptions (id, organization_id, plan_id, kind, status, unit_price_minor, unit_price_currency,
       price_recorded_on, price_rate, price_rate_date, price_rate_source, price_reporting_minor, price_reporting_currency)
     VALUES ($1, $2, $3, 'TERM', 'DRAFT', 1000, $4, '2026-09-01', 1, '2026-09-01', 'SAME_CURRENCY', 1000, $5)`,
    [randomUUID(), f.organizationId, f.planId, currency, reportingCurrency],
  ];

  const count = async (f: Fixture, from: string): Promise<number> =>
    Number((await f.admin.query<{ n: string }>(`SELECT count(*) AS n FROM ${from}`)).rows[0].n);
  const reportingCurrency = async (f: Fixture): Promise<string> =>
    (await f.admin.query<{ c: string }>('SELECT reporting_currency AS c FROM organizations')).rows[0].c;

  describe('DB-01: changing the reporting currency and recording a value in it cannot both commit', () => {
    it('queues a rate behind a change that is in flight, then refuses it in the new currency', async () => {
      const f = await fixture();
      try {
        await f.first.query('BEGIN');
        expect(await sqlState(f.first, `UPDATE organizations SET reporting_currency = 'USD'`)).toBeNull();
        await f.second.query('BEGIN');
        const rate = start(f.second, ...insertRate(f.organizationId, 'USD'));

        await expectQueued(f);
        await f.first.query('COMMIT');

        expect(await rate).toBe('23514');
        await f.second.query('ROLLBACK');
        expect(await reportingCurrency(f)).toBe('USD');
        expect(await count(f, 'exchange_rates')).toBe(0);
      } finally {
        await dispose(f);
      }
    }, 60_000);

    it('queues a change behind a rate that is in flight, then refuses the change', async () => {
      const f = await fixture();
      try {
        await f.second.query('BEGIN');
        expect(await sqlState(f.second, ...insertRate(f.organizationId, 'EUR'))).toBeNull();
        await f.first.query('BEGIN');
        const change = start(f.first, `UPDATE organizations SET reporting_currency = 'USD'`);

        await expectQueued(f);
        await f.second.query('COMMIT');

        expect(await change).toBe('55000');
        await f.first.query('ROLLBACK');
        expect(await reportingCurrency(f)).toBe('VND');
        expect(await count(f, 'exchange_rates')).toBe(1);
      } finally {
        await dispose(f);
      }
    }, 60_000);

    it('queues a converted price behind a change that is in flight, then refuses it in the old currency', async () => {
      const f = await fixture();
      try {
        await f.first.query('BEGIN');
        expect(await sqlState(f.first, `UPDATE organizations SET reporting_currency = 'USD'`)).toBeNull();
        await f.second.query('BEGIN');
        const price = start(f.second, ...insertPriced(f, 'VND', 'VND'));

        await expectQueued(f);
        await f.first.query('COMMIT');

        expect(await price).toBe('23514');
        await f.second.query('ROLLBACK');
        expect(await reportingCurrency(f)).toBe('USD');
        expect(await count(f, 'subscriptions WHERE price_reporting_currency IS NOT NULL')).toBe(0);
      } finally {
        await dispose(f);
      }
    }, 60_000);

    it('queues a change behind a converted price that is in flight, then refuses the change', async () => {
      const f = await fixture();
      try {
        await f.second.query('BEGIN');
        expect(await sqlState(f.second, ...insertPriced(f, 'VND', 'VND'))).toBeNull();
        await f.first.query('BEGIN');
        const change = start(f.first, `UPDATE organizations SET reporting_currency = 'USD'`);

        await expectQueued(f);
        await f.second.query('COMMIT');

        expect(await change).toBe('55000');
        await f.first.query('ROLLBACK');
        expect(await reportingCurrency(f)).toBe('VND');
        expect(await count(f, 'subscriptions WHERE price_reporting_currency IS NOT NULL')).toBe(1);
      } finally {
        await dispose(f);
      }
    }, 60_000);

    it('refuses a converted price that is not in the reporting currency, whoever writes it', async () => {
      const f = await fixture();
      try {
        expect(await sqlState(f.admin, ...insertPriced(f, 'USD', 'USD'))).toBe('23514');
        expect(await sqlState(f.admin, ...insertPriced(f, 'VND', 'VND'))).toBeNull();
        expect(await sqlState(f.admin, `UPDATE subscriptions SET price_reporting_currency = 'USD'`)).toBe('23514');
      } finally {
        await dispose(f);
      }
    }, 60_000);
  });

  describe('DB-02: the reporting currency is one the currency table knows', () => {
    it('refuses to change to a code outside the table', async () => {
      const f = await fixture();
      try {
        expect(await sqlState(f.admin, `UPDATE organizations SET reporting_currency = 'MYR'`)).toBe('23503');
        expect(await reportingCurrency(f)).toBe('VND');
      } finally {
        await dispose(f);
      }
    }, 60_000);

    it('refuses to create an installation with a code outside the table', async () => {
      const database = await provisionDisposableDatabase();
      await migrateDisposableDatabase(database);
      const sql = await connect(database);
      try {
        expect(
          await sqlState(
            sql,
            `INSERT INTO organizations (id, name, time_zone, reporting_currency) VALUES ($1, 'Acme', 'UTC', 'MYR')`,
            [randomUUID()],
          ),
        ).toBe('23503');
        expect((await sql.query('SELECT 1 FROM organizations')).rowCount).toBe(0);
      } finally {
        await sql.end();
        await dropDisposableDatabase(database);
      }
    }, 60_000);

    it('applies on an installation whose currency is in the table and keeps it', async () => {
      const database = await provisionDisposableDatabase();
      const sql = await connect(database);
      try {
        const directories = migrationDirectories();
        const integrity = directories.find((name) => name.endsWith(INTEGRITY)) ?? '';
        expect(integrity).not.toBe('');
        for (const directory of directories) {
          if (directory === integrity) break;
          await sql.query(sqlOf(directory));
        }
        await sql.query(
          `INSERT INTO organizations (id, name, time_zone, reporting_currency) VALUES ($1, 'Acme', 'UTC', 'USD')`,
          [randomUUID()],
        );

        await sql.query(sqlOf(integrity));

        expect((await sql.query<{ c: string }>('SELECT reporting_currency AS c FROM organizations')).rows[0].c).toBe(
          'USD',
        );
      } finally {
        await sql.end();
        await dropDisposableDatabase(database);
      }
    }, 60_000);

    it('stops on an installation whose currency is not in the table, and says which one and what to do', async () => {
      const database = await provisionDisposableDatabase();
      const sql = await connect(database);
      try {
        const directories = migrationDirectories();
        const integrity = directories.find((name) => name.endsWith(INTEGRITY)) ?? '';
        expect(integrity).not.toBe('');
        for (const directory of directories) {
          if (directory === integrity) break;
          await sql.query(sqlOf(directory));
        }
        await sql.query(
          `INSERT INTO organizations (id, name, time_zone, reporting_currency) VALUES ($1, 'Acme', 'UTC', 'MYR')`,
          [randomUUID()],
        );

        const failure = await sql.query(sqlOf(integrity)).then(
          () => null,
          (error: Error) => error,
        );

        expect(failure?.message).toContain('MYR');
        expect(failure?.message).toMatch(/currencies/);
        expect((await sql.query<{ c: string }>('SELECT reporting_currency AS c FROM organizations')).rows[0].c).toBe(
          'MYR',
        );
      } finally {
        await sql.end();
        await dropDisposableDatabase(database);
      }
    }, 60_000);
  });
});
