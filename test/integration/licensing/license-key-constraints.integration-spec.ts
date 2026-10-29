import { randomBytes, randomUUID } from 'node:crypto';
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

describe('license keys (integration, PostgreSQL constraints)', () => {
  let database: DisposableDatabase;
  let sql: Client;
  let organizationId: string;
  let subscriptionId: string;
  let otherSubscriptionId: string;

  const hex = () => randomBytes(32).toString('hex');
  const sealed = (length = 40) => randomBytes(length);

  const insertKey = async (
    over: Partial<{
      id: string;
      organizationId: string;
      subscriptionId: string;
      fingerprint: string;
      masked: string;
      ciphertext: Buffer;
      cipherKeyId: string;
      status: string;
    }> = {},
  ) => {
    const id = over.id ?? randomUUID();
    const code = await sqlState(
      sql,
      `INSERT INTO license_keys (id, organization_id, subscription_id, fingerprint, masked, ciphertext, cipher_key_id,
         status, imported_by_app_user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::"LicenseKeyStatus", $9)`,
      [
        id,
        over.organizationId ?? organizationId,
        over.subscriptionId ?? subscriptionId,
        over.fingerprint ?? hex(),
        over.masked ?? '••••1234',
        over.ciphertext ?? sealed(),
        over.cipherKeyId ?? 'k1',
        over.status ?? 'IN_STORE',
        randomUUID(),
      ],
    );

    return { id, code };
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
    // A subscription always has the department that owns it (F02): one department stands for all of them.
    await sql.query(
      `INSERT INTO departments (id, organization_id, code, name, updated_at)
       VALUES (gen_random_uuid(), $1, 'P-OWNER', 'The department that owns the subscriptions', now())`,
      [organizationId],
    );
    const employeeId = randomUUID();
    await sql.query(
      `INSERT INTO employees (id, organization_id, employee_code, full_name, employment_type, hire_date, updated_at)
       VALUES ($1, $2, 'E-ONE', 'E-ONE', 'STAFF', '2026-01-01', now())`,
      [employeeId, organizationId],
    );
    const vendorId = randomUUID();
    await sql.query(`INSERT INTO vendors (id, organization_id, name, normalized_name) VALUES ($1, $2, 'V', 'v')`, [
      vendorId,
      organizationId,
    ]);
    const applicationId = randomUUID();
    await sql.query(
      `INSERT INTO applications (id, organization_id, kind, vendor_id, name, normalized_name, business_owner_employee_id,
         data_sensitivity, comm_person_to_person_messaging, comm_calls_or_meetings, comm_mailbox, is_communication_service)
       VALUES ($1, $2, 'LICENSED', $4, 'Office', 'office', $3, 'LOW', false, false, false, false)`,
      [applicationId, organizationId, employeeId, vendorId],
    );
    const planId = randomUUID();
    await sql.query(
      `INSERT INTO plans (id, organization_id, application_id, name, normalized_name, provisioning_type, pricing_model, control_level)
       VALUES ($1, $2, $3, 'Office 2021', 'office 2021', 'K4', 'PER_SEAT', 'FULL')`,
      [planId, organizationId, applicationId],
    );
    subscriptionId = randomUUID();
    await sql.query(
      `INSERT INTO subscriptions (id, organization_id, plan_id, owner_department_id, kind, status, purchased_quantity)
       VALUES ($1, $2, $3, (SELECT id FROM departments WHERE organization_id = $2 LIMIT 1), 'PERPETUAL', 'DRAFT', 50)`,
      [subscriptionId, organizationId, planId],
    );
    otherSubscriptionId = randomUUID();
    await sql.query(
      `INSERT INTO subscriptions (id, organization_id, plan_id, owner_department_id, kind, status, purchased_quantity)
       VALUES ($1, $2, $3, (SELECT id FROM departments WHERE organization_id = $2 LIMIT 1), 'PERPETUAL', 'DRAFT', 10)`,
      [otherSubscriptionId, organizationId, planId],
    );
  }, 90000);

  afterAll(async () => {
    await sql?.end();
    if (database) await dropDisposableDatabase(database);
  });

  it('stores a sealed key of a purchase in the store, with the masked tail and the key id of its cipher', async () => {
    const { id, code } = await insertKey();
    const row = (
      await sql.query<{ status: string; masked: string; cipher_key_id: string }>(
        `SELECT status, masked, cipher_key_id FROM license_keys WHERE id = $1`,
        [id],
      )
    ).rows[0];

    expect(code).toBeNull();
    expect(row).toEqual({ status: 'IN_STORE', masked: '••••1234', cipher_key_id: 'k1' });
  });

  it('keeps a key once in an organization, whichever purchase it is for', async () => {
    const fingerprint = hex();

    expect((await insertKey({ fingerprint })).code).toBeNull();
    expect((await insertKey({ fingerprint })).code).toBe('23505');
    expect((await insertKey({ fingerprint, subscriptionId: otherSubscriptionId })).code).toBe('23505');
  });

  it('refuses a fingerprint that is not an HMAC in hex, a key that was not sealed, and an empty or overlong mask', async () => {
    expect((await insertKey({ fingerprint: 'OFFICE-2021-XXXXX-12345' })).code).toBe('23514');
    expect((await insertKey({ fingerprint: hex().toUpperCase() })).code).toBe('23514');
    expect((await insertKey({ fingerprint: hex().slice(1) })).code).toBe('23514');
    expect((await insertKey({ ciphertext: sealed(28) })).code).toBe('23514');
    expect((await insertKey({ ciphertext: sealed(29) })).code).toBeNull();
    expect((await insertKey({ masked: '' })).code).toBe('23514');
    expect((await insertKey({ masked: 'x'.repeat(17) })).code).toBe('23514');
    expect((await insertKey({ cipherKeyId: 'has space' })).code).toBe('23514');
    expect((await insertKey({ cipherKeyId: 'k'.repeat(33) })).code).toBe('23514');
  });

  it('refuses a purchase or an organization that does not exist', async () => {
    expect((await insertKey({ subscriptionId: randomUUID() })).code).toBe('23503');
    expect((await insertKey({ organizationId: randomUUID() })).code).toBe('23503');
  });

  it('refuses a status that is not one of the three', async () => {
    expect((await insertKey({ status: 'LOST' })).code).toBe('22P02');
    for (const status of ['IN_STORE', 'ASSIGNED', 'RETIRED']) expect((await insertKey({ status })).code).toBeNull();
  });

  it('never deletes a key, and moves nothing but its status', async () => {
    const { id } = await insertKey();

    expect(await sqlState(sql, `DELETE FROM license_keys WHERE id = $1`, [id])).toBe('55000');
    expect(await sqlState(sql, `UPDATE license_keys SET status = 'ASSIGNED' WHERE id = $1`, [id])).toBeNull();
    expect(await sqlState(sql, `UPDATE license_keys SET status = 'RETIRED' WHERE id = $1`, [id])).toBeNull();
    for (const [column, value] of [
      ['fingerprint', hex()],
      ['masked', '••••9999'],
      ['subscription_id', otherSubscriptionId],
      ['organization_id', randomUUID()],
      ['imported_by_app_user_id', randomUUID()],
      ['imported_at', '2020-01-01T00:00:00Z'],
    ] as const) {
      expect(await sqlState(sql, `UPDATE license_keys SET ${column} = $2 WHERE id = $1`, [id, value])).toBe('55000');
    }
  });

  it('lets the ciphertext be sealed again, and a key id follow only a new ciphertext', async () => {
    const { id } = await insertKey();

    expect(await sqlState(sql, `UPDATE license_keys SET cipher_key_id = 'k2' WHERE id = $1`, [id])).toBe('55000');
    expect(
      await sqlState(sql, `UPDATE license_keys SET ciphertext = $2, cipher_key_id = 'k2' WHERE id = $1`, [
        id,
        sealed(),
      ]),
    ).toBeNull();
    expect(await sqlState(sql, `UPDATE license_keys SET ciphertext = $2 WHERE id = $1`, [id, sealed()])).toBeNull();
  });
});
