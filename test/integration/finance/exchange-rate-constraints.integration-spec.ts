import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import {
  DisposableDatabase,
  dropDisposableDatabase,
  migrateDisposableDatabase,
  provisionDisposableDatabase,
} from '../../support/disposable-database';

/** The SQLSTATE a rejected statement carries: the constraint, not the application, said no. */
async function sqlState(sql: Client, text: string, values: unknown[] = []): Promise<string | null> {
  try {
    await sql.query(text, values);

    return null;
  } catch (error) {
    return (error as { code?: string }).code ?? 'unknown';
  }
}

describe('currencies and exchange rates (integration, PostgreSQL constraints)', () => {
  let database: DisposableDatabase;
  let sql: Client;
  let organizationId: string;

  const insertRate = (currency: string, date: string, rate: string): Promise<string | null> =>
    sqlState(
      sql,
      `INSERT INTO exchange_rates (id, organization_id, currency, rate_date, rate) VALUES ($1, $2, $3, $4, $5)`,
      [randomUUID(), organizationId, currency, date, rate],
    );

  beforeAll(async () => {
    database = await provisionDisposableDatabase();
    await migrateDisposableDatabase(database);
    sql = new Client({ connectionString: database.url });
    await sql.connect();
    organizationId = randomUUID();
    await sql.query(
      `INSERT INTO organizations (id, name, time_zone, reporting_currency) VALUES ($1, 'Acme', 'UTC', 'VND')`,
      [organizationId],
    );
  }, 60000);

  afterAll(async () => {
    await sql?.end();
    if (database) await dropDisposableDatabase(database);
  });

  it('seeds exactly the supported currencies with their minor digits', async () => {
    const rows = await sql.query<{ code: string; minor_unit: number }>(
      'SELECT code, minor_unit FROM currencies ORDER BY code',
    );

    expect(rows.rows).toEqual([
      { code: 'AUD', minor_unit: 2 },
      { code: 'CAD', minor_unit: 2 },
      { code: 'CNY', minor_unit: 2 },
      { code: 'EUR', minor_unit: 2 },
      { code: 'GBP', minor_unit: 2 },
      { code: 'JPY', minor_unit: 0 },
      { code: 'KRW', minor_unit: 0 },
      { code: 'SGD', minor_unit: 2 },
      { code: 'THB', minor_unit: 2 },
      { code: 'USD', minor_unit: 2 },
      { code: 'VND', minor_unit: 0 },
    ]);
  });

  it('stores a rate with ten decimals exactly and reads it back as text', async () => {
    expect(await insertRate('USD', '2026-09-01', '25431.5000000001')).toBeNull();

    const row = await sql.query<{ rate: string }>(
      `SELECT rate::text AS rate FROM exchange_rates WHERE currency = 'USD' AND rate_date = '2026-09-01'`,
    );
    expect(row.rows[0].rate).toBe('25431.5000000001');
  });

  it('refuses a rate of zero or below (CHECK); 10^10 and above cannot even be stored (NUMERIC(20,10) overflow)', async () => {
    expect(await insertRate('USD', '2026-09-02', '0')).toBe('23514');
    expect(await insertRate('USD', '2026-09-03', '-1')).toBe('23514');
    expect(await insertRate('USD', '2026-09-04', '10000000000')).toBe('22003');
    expect(await insertRate('USD', '2026-09-05', '9999999999.9999999999')).toBeNull();
  });

  it('refuses a second rate for the same currency and date (unique) and allows the same date for another currency', async () => {
    expect(await insertRate('EUR', '2026-09-10', '27000')).toBeNull();
    expect(await insertRate('EUR', '2026-09-10', '27001')).toBe('23505');
    expect(await insertRate('GBP', '2026-09-10', '32000')).toBeNull();
  });

  it('refuses a currency that is not in the table (foreign key)', async () => {
    expect(await insertRate('XYZ', '2026-09-11', '1')).toBe('23503');
  });

  it('refuses a rate for the organization reporting currency, even inserted by SQL (trigger)', async () => {
    expect(await insertRate('VND', '2026-09-12', '1')).toBe('23514');
  });

  it('never changes or deletes a recorded rate, whoever writes it (history that snapshots point at)', async () => {
    expect(await insertRate('CAD', '2026-09-14', '18000')).toBeNull();

    expect(
      await sqlState(sql, `UPDATE exchange_rates SET rate = 1 WHERE currency = 'CAD' AND rate_date = '2026-09-14'`),
    ).toBe('55000');
    expect(await sqlState(sql, `DELETE FROM exchange_rates WHERE currency = 'CAD' AND rate_date = '2026-09-14'`)).toBe(
      '55000',
    );

    const row = await sql.query<{ rate: string }>(
      `SELECT rate::text AS rate FROM exchange_rates WHERE currency = 'CAD' AND rate_date = '2026-09-14'`,
    );
    expect(row.rows[0].rate).toBe('18000.0000000000');
  });

  it('keeps the reporting currency while rates exist, and still allows other changes', async () => {
    expect(
      await sql
        .query(`SELECT 1 FROM exchange_rates WHERE organization_id = $1`, [organizationId])
        .then((r) => r.rowCount),
    ).toBeGreaterThan(0);
    expect(
      await sqlState(sql, `UPDATE organizations SET reporting_currency = 'USD' WHERE id = $1`, [organizationId]),
    ).toBe('55000');

    // An update that leaves the currency as it is stays allowed.
    expect(
      await sqlState(sql, `UPDATE organizations SET reporting_currency = 'VND', name = 'Acme Ltd' WHERE id = $1`, [
        organizationId,
      ]),
    ).toBeNull();
  });
});
