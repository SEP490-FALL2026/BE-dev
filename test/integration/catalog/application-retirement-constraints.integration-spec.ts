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

describe('the retirement of an application (integration, PostgreSQL constraints)', () => {
  let database: DisposableDatabase;
  let sql: Client;
  let organizationId: string;
  let owner: string;
  let counter = 0;

  const newApplication = async (): Promise<string> => {
    const id = randomUUID();
    counter += 1;
    await sql.query(
      `INSERT INTO applications (id, organization_id, kind, name, normalized_name, business_owner_employee_id,
         data_sensitivity, comm_person_to_person_messaging, comm_calls_or_meetings, comm_mailbox, is_communication_service)
       VALUES ($1, $2, 'INTERNAL', $3, $3, $4, 'LOW', false, false, false, false)`,
      [id, organizationId, `App ${counter}`, owner],
    );

    return id;
  };
  const confirm = async (applicationId: string, note = 'đã dọn xong'): Promise<{ code: string | null; id: string }> => {
    const id = randomUUID();
    const code = await sqlState(
      sql,
      `INSERT INTO application_retirement_confirmations (id, organization_id, application_id, business_owner_employee_id,
         note, recorded_by_app_user_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, organizationId, applicationId, owner, note, randomUUID()],
    );

    return { code, id };
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
    owner = randomUUID();
    await sql.query(
      `INSERT INTO employees (id, organization_id, employee_code, full_name, employment_type, hire_date, updated_at)
       VALUES ($1, $2, 'E-OWN', 'Owner', 'STAFF', '2026-01-01', now())`,
      [owner, organizationId],
    );
  }, 90000);

  afterAll(async () => {
    await sql?.end();
    if (database) await dropDisposableDatabase(database);
  });

  describe('a confirmation of the Business Owner (US-04-01 AC-8)', () => {
    it('stores what was confirmed for an application and a person that exist', async () => {
      const application = await newApplication();

      expect((await confirm(application)).code).toBeNull();
      expect(
        await sqlState(
          sql,
          `INSERT INTO application_retirement_confirmations (id, organization_id, application_id, business_owner_employee_id,
             note, recorded_by_app_user_id)
           VALUES (gen_random_uuid(), $1, $2, $3, 'x', $4)`,
          [organizationId, randomUUID(), owner, randomUUID()],
        ),
      ).toBe('23503');
    });

    it('says what it confirms: a blank note is none', async () => {
      const application = await newApplication();

      expect((await confirm(application, '')).code).toBe('23514');
      expect((await confirm(application, '   ')).code).toBe('23514');
    });

    it('is never changed and never deleted', async () => {
      const application = await newApplication();
      const { id } = await confirm(application);

      expect(
        await sqlState(sql, `UPDATE application_retirement_confirmations SET note = 'khác' WHERE id = $1`, [id]),
      ).toBe('55000');
      expect(await sqlState(sql, `DELETE FROM application_retirement_confirmations WHERE id = $1`, [id])).toBe('55000');
    });
  });

  describe('a retired application (US-04-01 AC-8)', () => {
    const retire = (id: string, confirmationId: string | null = null, by: string | null = null) =>
      sqlState(
        sql,
        `UPDATE applications SET catalog_status = 'RETIRED', retired_at = now(), retired_by_app_user_id = $2,
           retirement_confirmation_id = $3 WHERE id = $1`,
        [id, by, confirmationId],
      );

    it('is retired and dated together, and who retired it and on what come only with a retirement', async () => {
      const application = await newApplication();
      const { id: confirmation } = await confirm(application);

      expect(
        await sqlState(sql, `UPDATE applications SET catalog_status = 'RETIRED' WHERE id = $1`, [application]),
      ).toBe('23514');
      expect(await sqlState(sql, `UPDATE applications SET retired_at = now() WHERE id = $1`, [application])).toBe(
        '23514',
      );
      expect(
        await sqlState(sql, `UPDATE applications SET retired_by_app_user_id = $2 WHERE id = $1`, [
          application,
          randomUUID(),
        ]),
      ).toBe('23514');
      expect(await retire(application, confirmation, randomUUID())).toBeNull();
    });

    it('names a confirmation that exists', async () => {
      const application = await newApplication();

      expect(await retire(application, randomUUID(), randomUUID())).toBe('23503');
    });

    it('is retired for good: it never comes back and never changes how it was retired, while its other data may change', async () => {
      const application = await newApplication();
      const { id: confirmation } = await confirm(application);
      await retire(application, confirmation, randomUUID());

      expect(
        await sqlState(
          sql,
          `UPDATE applications SET catalog_status = 'APPROVED', retired_at = NULL, retired_by_app_user_id = NULL,
             retirement_confirmation_id = NULL WHERE id = $1`,
          [application],
        ),
      ).toBe('55000');
      expect(
        await sqlState(sql, `UPDATE applications SET retired_at = now() - interval '1 day' WHERE id = $1`, [
          application,
        ]),
      ).toBe('55000');
      expect(await sqlState(sql, `UPDATE applications SET name = 'Tên mới' WHERE id = $1`, [application])).toBeNull();
    });
  });
});
