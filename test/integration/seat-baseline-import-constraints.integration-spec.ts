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

describe('seat baseline imports (integration, PostgreSQL constraints)', () => {
  let database: DisposableDatabase;
  let sql: Client;
  let organizationId: string;
  let planId: string;
  let subscriptionId: string;

  const insertImport = (extra: { id?: string; status?: string; columns?: string; values?: unknown[] } = {}) =>
    sqlState(
      sql,
      `INSERT INTO seat_baseline_imports (id, organization_id, uploaded_by, file_name, content_hash, plan_id, subscription_id,
         status, ignored_columns, summary, expires_at${extra.columns ? `, ${extra.columns}` : ''})
       VALUES ($1, $2, $3, 'seats.csv', 'hash', $4, $5, $6::"SeatBaselineImportStatus", '{}', '{}', now() + interval '1 day'${
         extra.values ? `, ${extra.values.map((_, index) => `$${index + 7}`).join(', ')}` : ''
       })`,
      [
        extra.id ?? randomUUID(),
        organizationId,
        randomUUID(),
        planId,
        subscriptionId,
        extra.status ?? 'PREVIEW',
        ...(extra.values ?? []),
      ],
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
    const owner = randomUUID();
    await sql.query(
      `INSERT INTO employees (id, organization_id, employee_code, full_name, employment_type, hire_date, updated_at)
       VALUES ($1, $2, 'E-1', 'Owner', 'STAFF', '2026-01-01', now())`,
      [owner, organizationId],
    );
    const vendorId = randomUUID();
    await sql.query(
      `INSERT INTO vendors (id, organization_id, name, normalized_name) VALUES ($1, $2, 'Figma', 'figma')`,
      [vendorId, organizationId],
    );
    const applicationId = randomUUID();
    await sql.query(
      `INSERT INTO applications (id, organization_id, kind, vendor_id, name, normalized_name, business_owner_employee_id,
         data_sensitivity, comm_person_to_person_messaging, comm_calls_or_meetings, comm_mailbox, is_communication_service)
       VALUES ($1, $2, 'SAAS', $3, 'Figma', 'figma', $4, 'LOW', false, false, false, false)`,
      [applicationId, organizationId, vendorId, owner],
    );
    planId = randomUUID();
    await sql.query(
      `INSERT INTO plans (id, organization_id, application_id, name, normalized_name, provisioning_type, pricing_model, control_level)
       VALUES ($1, $2, $3, 'Org', 'org', 'K2', 'PER_SEAT', 'FULL')`,
      [planId, organizationId, applicationId],
    );
    subscriptionId = randomUUID();
    await sql.query(
      `INSERT INTO subscriptions (id, organization_id, plan_id, kind, status, purchased_quantity)
       VALUES ($1, $2, $3, 'TERM', 'DRAFT', 100)`,
      [subscriptionId, organizationId, planId],
    );
  }, 90000);

  afterAll(async () => {
    await sql?.end();
    if (database) await dropDisposableDatabase(database);
  });

  it('stores a preview, and an import of an internal plan with no subscription', async () => {
    expect(await insertImport()).toBeNull();
    expect(
      await sqlState(
        sql,
        `INSERT INTO seat_baseline_imports (id, organization_id, uploaded_by, file_name, content_hash, plan_id, status,
           ignored_columns, summary, expires_at)
         VALUES ($1, $2, $3, 'internal.csv', 'h', $4, 'PREVIEW', '{}', '{}', now() + interval '1 day')`,
        [randomUUID(), organizationId, randomUUID(), planId],
      ),
    ).toBeNull();
  });

  it('refuses a plan, a subscription or an organization that does not exist (foreign keys)', async () => {
    const insert = (columns: string, values: unknown[]) =>
      sqlState(
        sql,
        `INSERT INTO seat_baseline_imports (id, organization_id, uploaded_by, file_name, content_hash, plan_id, subscription_id,
           status, ignored_columns, summary, expires_at)
         VALUES ($1, $2, $3, 'x.csv', 'h', $4, $5, 'PREVIEW', '{}', '{}', now() + interval '1 day')`,
        [randomUUID(), values[0] ?? organizationId, randomUUID(), values[1] ?? planId, values[2] ?? subscriptionId],
      ).then((state) => ({ columns, state }));

    expect(await insert('organization', [randomUUID()])).toEqual({ columns: 'organization', state: '23503' });
    expect(await insert('plan', [undefined, randomUUID()])).toEqual({ columns: 'plan', state: '23503' });
    expect(await insert('subscription', [undefined, undefined, randomUUID()])).toEqual({
      columns: 'subscription',
      state: '23503',
    });
  });

  it('keeps the preview version positive', async () => {
    expect(await insertImport({ columns: 'preview_version', values: [0] })).toBe('23514');
    expect(await insertImport({ columns: 'preview_version', values: [3] })).toBeNull();
  });

  it('says when and under which key a written import was confirmed, and when a thrown-away one was cancelled', async () => {
    expect(await insertImport({ status: 'COMPLETED' })).toBe('23514');
    expect(
      await insertImport({
        status: 'COMPLETED',
        columns: 'confirmed_at, confirm_key, result',
        values: [new Date(), 'key-1', JSON.stringify({ created: 1 })],
      }),
    ).toBeNull();
    expect(await insertImport({ status: 'CANCELLED' })).toBe('23514');
    expect(await insertImport({ status: 'CANCELLED', columns: 'cancelled_at', values: [new Date()] })).toBeNull();
    expect(await insertImport({ status: 'PREVIEW', columns: 'confirmed_at', values: [new Date()] })).toBe('23514');
  });

  it('keeps a row a valid or an error one at a line below the header, and deletes the rows with the import', async () => {
    const id = randomUUID();
    await insertImport({ id });
    const row = (line: number, outcome: string) =>
      sqlState(
        sql,
        `INSERT INTO seat_baseline_import_rows (import_id, line_number, cells, outcome, errors) VALUES ($1, $2, '{}', $3, '[]')`,
        [id, line, outcome],
      );

    expect(await row(2, 'VALID')).toBeNull();
    expect(await row(3, 'ERROR')).toBeNull();
    expect(await row(3, 'VALID')).toBe('23505');
    expect(await row(4, 'MAYBE')).toBe('23514');
    expect(await row(1, 'VALID')).toBe('23514');

    await sql.query(`DELETE FROM seat_baseline_imports WHERE id = $1`, [id]);
    const left = await sql.query(`SELECT 1 FROM seat_baseline_import_rows WHERE import_id = $1`, [id]);
    expect(left.rows).toEqual([]);
  });
});
