import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import {
  DisposableDatabase,
  dropDisposableDatabase,
  migrateDisposableDatabase,
  provisionDisposableDatabase,
} from '../support/disposable-database';

/** The SQLSTATE a rejected statement carries: the constraint, not the application, said no. */
async function sqlState(sql: Client, text: string, values: unknown[] = []): Promise<string | null> {
  try {
    await sql.query(text, values);

    return null;
  } catch (error) {
    return (error as { code?: string }).code ?? 'unknown';
  }
}

describe('vendor tax profiles (integration, PostgreSQL constraints)', () => {
  let database: DisposableDatabase;
  let sql: Client;
  let organizationId: string;
  let vendorId: string;

  const head = async (forVendor: string = vendorId): Promise<void> => {
    await sql.query(
      `INSERT INTO vendor_tax_profiles (vendor_id, organization_id, current_version) VALUES ($1, $2, 0)`,
      [forVendor, organizationId],
    );
  };
  const version = async (forVendor: string, number: number, group = 'T2'): Promise<string> => {
    const id = randomUUID();
    await sql.query(
      `INSERT INTO vendor_tax_profile_versions (id, vendor_id, version, tax_group, declared_by_app_user_id)
       VALUES ($1, $2, $3, $4::"TaxGroup", $5)`,
      [id, forVendor, number, group, randomUUID()],
    );

    return id;
  };
  const line = (versionId: string, position: number, taxType: string, rateBp: number) =>
    sqlState(
      sql,
      `INSERT INTO vendor_tax_profile_lines (version_id, position, tax_type, normalized_tax_type, rate_bp, deductible)
       VALUES ($1, $2, $3, $4, $5, true)`,
      [versionId, position, taxType, taxType.toLowerCase(), rateBp],
    );
  const newVendor = async (name: string): Promise<string> => {
    const id = randomUUID();
    await sql.query(`INSERT INTO vendors (id, organization_id, name, normalized_name) VALUES ($1, $2, $3, $3)`, [
      id,
      organizationId,
      name,
    ]);

    return id;
  };

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
    vendorId = await newVendor('figma');
    await head();
  }, 60000);

  afterAll(async () => {
    await sql?.end();
    if (database) await dropDisposableDatabase(database);
  });

  it('has one head per vendor and refuses a vendor that does not exist (foreign key)', async () => {
    const insert = (forVendor: string) =>
      sqlState(sql, `INSERT INTO vendor_tax_profiles (vendor_id, organization_id) VALUES ($1, $2)`, [
        forVendor,
        organizationId,
      ]);

    expect(await insert(vendorId)).toBe('23505');
    expect(await insert(randomUUID())).toBe('23503');
  });

  it('keeps the version number positive and unique for a vendor, and a group of T1, T2 or T3', async () => {
    const versionState = (number: number, group = 'T2') =>
      sqlState(
        sql,
        `INSERT INTO vendor_tax_profile_versions (id, vendor_id, version, tax_group, declared_by_app_user_id)
         VALUES ($1, $2, $3, $4::"TaxGroup", $5)`,
        [randomUUID(), vendorId, number, group, randomUUID()],
      );

    expect(await versionState(1)).toBeNull();
    expect(await versionState(1)).toBe('23505');
    expect(await versionState(0)).toBe('23514');
    expect(await versionState(2, 'T4')).toBe('22P02');
  });

  it('refuses a version for a vendor that has no head (foreign key)', async () => {
    const unheaded = await newVendor('no head');

    await expect(version(unheaded, 1)).rejects.toMatchObject({ code: '23503' });
  });

  it('keeps a rate between 0 and 100 percent in hundredths of a percent, and a position from 1 to 20', async () => {
    const owner = await newVendor('rates');
    await head(owner);
    const versionId = await version(owner, 1);

    expect(await line(versionId, 1, 'GTGT', 1000)).toBeNull();
    expect(await line(versionId, 2, 'Zero', 0)).toBeNull();
    expect(await line(versionId, 3, 'Whole', 10000)).toBeNull();
    expect(await line(versionId, 4, 'Negative', -1)).toBe('23514');
    expect(await line(versionId, 5, 'Over', 10001)).toBe('23514');
    expect(await line(versionId, 0, 'Position zero', 100)).toBe('23514');
    expect(await line(versionId, 21, 'Position 21', 100)).toBe('23514');
  });

  it('refuses a tax type twice in one version, ignoring case, and a position used twice', async () => {
    const owner = await newVendor('dupes');
    await head(owner);
    const versionId = await version(owner, 1);

    expect(await line(versionId, 1, 'GTGT', 1000)).toBeNull();
    expect(await line(versionId, 2, 'gtgt', 500)).toBe('23505');
    expect(await line(versionId, 1, 'TNDN', 500)).toBe('23505');
    const other = await version(owner, 2);
    expect(await line(other, 1, 'GTGT', 1000)).toBeNull();
  });

  it('never changes or deletes a recorded version or its lines, whoever writes it: the history stays whole', async () => {
    const owner = await newVendor('history');
    await head(owner);
    const versionId = await version(owner, 1);
    await line(versionId, 1, 'GTGT', 1000);

    expect(
      await sqlState(sql, `UPDATE vendor_tax_profile_versions SET tax_group = 'T3' WHERE id = $1`, [versionId]),
    ).toBe('55000');
    expect(await sqlState(sql, `DELETE FROM vendor_tax_profile_versions WHERE id = $1`, [versionId])).toBe('55000');
    expect(
      await sqlState(sql, `UPDATE vendor_tax_profile_lines SET rate_bp = 1 WHERE version_id = $1`, [versionId]),
    ).toBe('55000');
    expect(await sqlState(sql, `DELETE FROM vendor_tax_profile_lines WHERE version_id = $1`, [versionId])).toBe(
      '55000',
    );

    const stored = await sql.query<{ rate_bp: number }>(
      `SELECT rate_bp FROM vendor_tax_profile_lines WHERE version_id = $1`,
      [versionId],
    );
    expect(stored.rows).toEqual([{ rate_bp: 1000 }]);
  });

  it('lets the head move to the next version, and has no column that holds a tax amount payable or a filing', async () => {
    expect(
      await sqlState(sql, `UPDATE vendor_tax_profiles SET current_version = 1 WHERE vendor_id = $1`, [vendorId]),
    ).toBeNull();

    const columns = await sql.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name IN ('vendor_tax_profiles', 'vendor_tax_profile_versions', 'vendor_tax_profile_lines')
          AND (column_name ILIKE '%amount%' OR column_name ILIKE '%payable%' OR column_name ILIKE '%filing%'
               OR column_name ILIKE '%paid%')`,
    );
    expect(columns.rows).toEqual([]);
  });
});
