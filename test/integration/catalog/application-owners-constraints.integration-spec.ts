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

describe('application business owner history (integration, PostgreSQL constraints)', () => {
  let database: DisposableDatabase;
  let sql: Client;
  let organizationId: string;
  let firstOwner: string;
  let secondOwner: string;

  const employee = async (code: string): Promise<string> => {
    const id = randomUUID();
    await sql.query(
      `INSERT INTO employees (id, organization_id, employee_code, full_name, employment_type, hire_date, updated_at)
       VALUES ($1, $2, $3, $3, 'STAFF', '2026-01-01', now())`,
      [id, organizationId, code],
    );

    return id;
  };
  const application = async (owner: string): Promise<string> => {
    const vendorId = randomUUID();
    await sql.query(`INSERT INTO vendors (id, organization_id, name, normalized_name) VALUES ($1, $2, $3, $3)`, [
      vendorId,
      organizationId,
      `vendor ${randomUUID()}`,
    ]);
    const id = randomUUID();
    await sql.query(
      `INSERT INTO applications (id, organization_id, kind, vendor_id, name, normalized_name, business_owner_employee_id,
         data_sensitivity, comm_person_to_person_messaging, comm_calls_or_meetings, comm_mailbox, is_communication_service)
       VALUES ($1, $2, 'SAAS', $3, $4, $4, $5, 'LOW', false, false, false, false)`,
      [id, organizationId, vendorId, `app ${randomUUID()}`, owner],
    );

    return id;
  };
  const period = (applicationId: string, employeeId: string, assignedAt: string, endedAt: string | null = null) =>
    sqlState(
      sql,
      `INSERT INTO application_business_owners (id, application_id, employee_id, assigned_at, assigned_by_app_user_id, ended_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [randomUUID(), applicationId, employeeId, assignedAt, randomUUID(), endedAt],
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
    firstOwner = await employee('B-1');
    secondOwner = await employee('B-2');
  }, 60000);

  afterAll(async () => {
    await sql?.end();
    if (database) await dropDisposableDatabase(database);
  });

  it('has one open period for an application, and any number of closed ones', async () => {
    const app = await application(firstOwner);

    expect(await period(app, firstOwner, '2026-01-01T00:00:00Z', '2026-06-01T00:00:00Z')).toBeNull();
    expect(await period(app, secondOwner, '2026-06-01T00:00:00Z')).toBeNull();
    expect(await period(app, firstOwner, '2026-07-01T00:00:00Z')).toBe('23505');
    expect(await period(app, firstOwner, '2026-02-01T00:00:00Z', '2026-03-01T00:00:00Z')).toBeNull();
  });

  it('ends a period at or after it began', async () => {
    const app = await application(firstOwner);

    expect(await period(app, firstOwner, '2026-06-01T00:00:00Z', '2026-06-01T00:00:00Z')).toBeNull();
    expect(await period(app, secondOwner, '2026-06-01T00:00:00Z', '2026-05-31T23:59:59Z')).toBe('23514');
  });

  it('refuses a period for an application or an employee that does not exist (foreign keys)', async () => {
    const app = await application(firstOwner);

    expect(await period(randomUUID(), firstOwner, '2026-01-01T00:00:00Z')).toBe('23503');
    expect(await period(app, randomUUID(), '2026-01-01T00:00:00Z')).toBe('23503');
  });

  it('closes an open period once, and never changes or deletes a closed one', async () => {
    const app = await application(firstOwner);
    await period(app, firstOwner, '2026-01-01T00:00:00Z');

    expect(
      await sqlState(
        sql,
        `UPDATE application_business_owners SET ended_at = '2026-06-01T00:00:00Z' WHERE application_id = $1`,
        [app],
      ),
    ).toBeNull();
    expect(
      await sqlState(
        sql,
        `UPDATE application_business_owners SET ended_at = '2026-07-01T00:00:00Z' WHERE application_id = $1`,
        [app],
      ),
    ).toBe('55000');
    expect(
      await sqlState(sql, `UPDATE application_business_owners SET employee_id = $2 WHERE application_id = $1`, [
        app,
        secondOwner,
      ]),
    ).toBe('55000');
    expect(await sqlState(sql, `DELETE FROM application_business_owners WHERE application_id = $1`, [app])).toBe(
      '55000',
    );
  });

  it('keeps an open period free to be closed but not to be moved to another application or employee', async () => {
    const app = await application(firstOwner);
    await period(app, firstOwner, '2026-01-01T00:00:00Z');

    expect(
      await sqlState(sql, `UPDATE application_business_owners SET employee_id = $2 WHERE application_id = $1`, [
        app,
        secondOwner,
      ]),
    ).toBe('55000');
  });
});
