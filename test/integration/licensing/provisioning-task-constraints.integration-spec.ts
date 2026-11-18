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

describe('provisioning tasks (integration, PostgreSQL constraints)', () => {
  let database: DisposableDatabase;
  let sql: Client;
  let organizationId: string;
  let planId: string;
  let employeeId: string;
  let counter = 0;
  const person = () => randomUUID();

  const newEmployee = async (code: string): Promise<string> => {
    const id = randomUUID();
    await sql.query(
      `INSERT INTO employees (id, organization_id, employee_code, full_name, employment_type, hire_date, updated_at)
       VALUES ($1, $2, $3, $3, 'STAFF', '2026-01-01', now())`,
      [id, organizationId, code],
    );

    return id;
  };
  const newAssignment = async (): Promise<string> => {
    const id = randomUUID();
    counter += 1;
    // One person holds a seat of one plan once at a time (INV-02): every assignment here is for someone new.
    const holder = await newEmployee(`E-HOLDER-${counter}`);
    await sql.query(
      `INSERT INTO license_assignments (id, organization_id, kind, source, plan_id, employee_id, account_identifier,
         normalized_account_identifier, valid_from, valid_from_basis, created_by_app_user_id)
       VALUES ($1, $2, 'PERSONAL', 'REQUEST', $3, $4, $5, $5, '2026-10-20', 'ACTUAL', $6)`,
      [id, organizationId, planId, holder, `user${counter}@congty.vn`, person()],
    );

    return id;
  };
  const newTask = async (extra: { assignmentId?: string; channel?: string; responsible?: string | null } = {}) => {
    const id = randomUUID();
    const code = await sqlState(
      sql,
      `INSERT INTO provisioning_tasks (id, organization_id, assignment_id, kind, channel, request_id,
         default_responsible_employee_id, max_attempts, created_by_app_user_id)
       VALUES ($1, $2, $3, 'GRANT', $4::"ProvisioningChannel", $5, $6, 4, $7)`,
      [
        id,
        organizationId,
        extra.assignmentId ?? (await newAssignment()),
        extra.channel ?? 'MANUAL',
        randomUUID(),
        extra.responsible ?? null,
        person(),
      ],
    );

    return { id, code };
  };
  const claim = (id: string) =>
    sqlState(
      sql,
      `UPDATE provisioning_tasks SET status = 'IN_PROGRESS', claimed_by_app_user_id = $2, claimed_at = now() WHERE id = $1`,
      [id, person()],
    );
  const claimed = async () => {
    const { id } = await newTask();
    await claim(id);

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
    employeeId = await newEmployee('E-ONE');
    const applicationId = randomUUID();
    await sql.query(
      `INSERT INTO applications (id, organization_id, kind, name, normalized_name, business_owner_employee_id,
         data_sensitivity, comm_person_to_person_messaging, comm_calls_or_meetings, comm_mailbox, is_communication_service)
       VALUES ($1, $2, 'INTERNAL', 'Portal', 'portal', $3, 'LOW', false, false, false, false)`,
      [applicationId, organizationId, employeeId],
    );
    planId = randomUUID();
    await sql.query(
      `INSERT INTO plans (id, organization_id, application_id, name, normalized_name, provisioning_type)
       VALUES ($1, $2, $3, 'Internal', 'internal', 'K5')`,
      [planId, organizationId, applicationId],
    );
  }, 90000);

  afterAll(async () => {
    await sql?.end();
    if (database) await dropDisposableDatabase(database);
  });

  it('stores a queued manual grant task of an assignment, with the person in charge of the department', async () => {
    const responsible = await newEmployee('E-INCHARGE');

    expect((await newTask({ responsible })).code).toBeNull();
    expect((await newTask({ channel: 'CONNECTOR' })).code).toBeNull();
  });

  it('keeps one grant task for one assignment', async () => {
    const assignmentId = await newAssignment();

    expect((await newTask({ assignmentId })).code).toBeNull();
    expect((await newTask({ assignmentId })).code).toBe('23505');
  });

  it('fixes the most tries when the task is made, from one to eleven, and never changes them (US-01-04 AC-13)', async () => {
    const insert = async (maxAttempts: number) =>
      sqlState(
        sql,
        `INSERT INTO provisioning_tasks (id, organization_id, assignment_id, kind, channel, request_id, max_attempts, created_by_app_user_id)
         VALUES (gen_random_uuid(), $1, $2, 'GRANT', 'MANUAL', $3, $4, $5)`,
        [organizationId, await newAssignment(), randomUUID(), maxAttempts, person()],
      );

    expect(await insert(0)).toBe('23514');
    expect(await insert(12)).toBe('23514');
    expect(await insert(1)).toBeNull();
    expect(await insert(11)).toBeNull();

    const { id } = await newTask();
    expect(await sqlState(sql, `UPDATE provisioning_tasks SET max_attempts = 5 WHERE id = $1`, [id])).toBe('55000');
    expect(
      (await sql.query<{ max_attempts: number }>(`SELECT max_attempts FROM provisioning_tasks WHERE id = $1`, [id]))
        .rows[0].max_attempts,
    ).toBe(4);
  });

  it('refuses an assignment or a person in charge that does not exist, and a task with no request', async () => {
    expect((await newTask({ assignmentId: randomUUID() })).code).toBe('23503');
    expect((await newTask({ responsible: randomUUID() })).code).toBe('23503');
    expect(
      await sqlState(
        sql,
        `INSERT INTO provisioning_tasks (id, organization_id, assignment_id, kind, channel, request_id, max_attempts, created_by_app_user_id)
         VALUES (gen_random_uuid(), $1, $2, 'GRANT', 'MANUAL', NULL, 4, $3)`,
        [organizationId, await newAssignment(), person()],
      ),
      // Not a NOT NULL any more: a revocation has no request, so the table says a grant needs one (g6-revocation-by-grant-kind).
    ).toBe('23514');
  });

  describe('status and columns say the same thing (US-07-02 AC-2, AC-5, AC-6)', () => {
    it('lets a queued task be taken, and taken again by another person', async () => {
      const { id } = await newTask();

      expect(await claim(id)).toBeNull();
      expect(await claim(id)).toBeNull();
    });

    it('refuses a task that is queued but already taken, or in progress with nobody who took it', async () => {
      const { id } = await newTask();

      expect(
        await sqlState(sql, `UPDATE provisioning_tasks SET claimed_by_app_user_id = $2 WHERE id = $1`, [id, person()]),
      ).toBe('23514');
      expect(await sqlState(sql, `UPDATE provisioning_tasks SET status = 'IN_PROGRESS' WHERE id = $1`, [id])).toBe(
        '23514',
      );
    });

    it('completes a task only with a person, a time and a note of evidence that is not blank', async () => {
      const id = await claimed();
      const complete = (evidence: string | null) =>
        sqlState(
          sql,
          `UPDATE provisioning_tasks SET status = 'COMPLETED', completed_by_app_user_id = $2, completed_at = now(),
             evidence = $3 WHERE id = $1`,
          [id, person(), evidence],
        );

      expect(await complete(null)).toBe('23514');
      expect(await complete('   ')).toBe('23514');
      expect(await complete('đã mua gói, biên lai số 12')).toBeNull();
    });

    it('refuses to complete without saying who did it', async () => {
      const id = await claimed();

      expect(
        await sqlState(sql, `UPDATE provisioning_tasks SET status = 'COMPLETED', evidence = 'xong' WHERE id = $1`, [
          id,
        ]),
      ).toBe('23514');
    });

    it('fails a task only with a person, a time and a reason that is not blank, and never with evidence', async () => {
      const id = await claimed();
      const fail = (reason: string | null, extra = '') =>
        sqlState(
          sql,
          `UPDATE provisioning_tasks SET status = 'FAILED', failed_by_app_user_id = $2, failed_at = now(),
             failure_reason = $3, failure_kind = 'NOT_DONE' ${extra} WHERE id = $1`,
          [id, person(), reason],
        );

      expect(await fail(null)).toBe('23514');
      expect(await fail('  ')).toBe('23514');
      expect(await fail('lý do', `, evidence = 'x'`)).toBe('23514');
      expect(await fail('nhà cung cấp từ chối')).toBeNull();
    });

    it('refuses a task that is queued and carries a completion or a failure', async () => {
      const { id } = await newTask();

      expect(
        await sqlState(
          sql,
          `UPDATE provisioning_tasks SET evidence = 'x', completed_by_app_user_id = $2, completed_at = now() WHERE id = $1`,
          [id, person()],
        ),
      ).toBe('23514');
      expect(await sqlState(sql, `UPDATE provisioning_tasks SET failure_reason = 'x' WHERE id = $1`, [id])).toBe(
        '23514',
      );
    });
  });

  describe('a task is the record of work (US-07-02 AC-1)', () => {
    it('never changes once completed, whoever writes', async () => {
      const id = await claimed();
      await sql.query(
        `UPDATE provisioning_tasks SET status = 'COMPLETED', completed_by_app_user_id = $2, completed_at = now(),
           evidence = 'xong' WHERE id = $1`,
        [id, person()],
      );

      expect(await sqlState(sql, `UPDATE provisioning_tasks SET evidence = 'đổi' WHERE id = $1`, [id])).toBe('55000');
      expect(await sqlState(sql, `UPDATE provisioning_tasks SET status = 'FAILED' WHERE id = $1`, [id])).toBe('55000');
    });

    it('is never deleted, in any state', async () => {
      const { id } = await newTask();
      const running = await claimed();

      expect(await sqlState(sql, `DELETE FROM provisioning_tasks WHERE id = $1`, [id])).toBe('55000');
      expect(await sqlState(sql, `DELETE FROM provisioning_tasks WHERE id = $1`, [running])).toBe('55000');
    });

    it('keeps no column for a password or any secret', async () => {
      const { rows } = await sql.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns WHERE table_name = 'provisioning_tasks'`,
      );

      expect(
        rows.map((row) => row.column_name).filter((name) => /password|secret|credential|token|key/i.test(name)),
      ).toEqual([]);
    });
  });
});
