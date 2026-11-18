import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import {
  DisposableDatabase,
  dropDisposableDatabase,
  migrateDisposableDatabase,
  provisionDisposableDatabase,
} from '../../support/disposable-database';

async function sqlState(sql: Client, text: string, values: unknown[] = []): Promise<string | null> {
  try {
    await sql.query(text, values);

    return null;
  } catch (error) {
    return (error as { code?: string }).code ?? 'unknown';
  }
}

describe('revocation timing, withdrawn reasons and the guard of cancelling (integration, PostgreSQL constraints)', () => {
  let database: DisposableDatabase;
  let sql: Client;
  let organizationId: string;
  let planId: string;
  let counter = 0;

  const newEmployee = async (): Promise<string> => {
    const id = randomUUID();
    counter += 1;
    await sql.query(
      `INSERT INTO employees (id, organization_id, employee_code, full_name, employment_type, hire_date, updated_at)
       VALUES ($1, $2, $3, $3, 'STAFF', '2026-01-01', now())`,
      [id, organizationId, `E-TIM-${counter}`],
    );

    return id;
  };
  const newAssignment = async (): Promise<string> => {
    const id = randomUUID();
    counter += 1;
    await sql.query(
      `INSERT INTO license_assignments (id, organization_id, kind, source, plan_id, employee_id, account_identifier,
         normalized_account_identifier, valid_from, valid_from_basis, created_by_app_user_id)
       VALUES ($1, $2, 'PERSONAL', 'REQUEST', $3, $4, $5, $5, '2026-10-01', 'ACTUAL', $6)`,
      [id, organizationId, planId, await newEmployee(), `user${counter}@congty.vn`, randomUUID()],
    );

    return id;
  };
  const task = async (kind: 'REVOKE' | 'GRANT' = 'REVOKE'): Promise<string> => {
    const id = randomUUID();
    await sql.query(
      kind === 'REVOKE'
        ? `INSERT INTO provisioning_tasks (id, organization_id, assignment_id, kind, channel, revocation_source, max_attempts, created_by_app_user_id)
           VALUES ($1, $2, $3, 'REVOKE', 'MANUAL', 'GHOST_SEAT', 4, $4)`
        : `INSERT INTO provisioning_tasks (id, organization_id, assignment_id, kind, channel, request_id, max_attempts, created_by_app_user_id)
           VALUES ($1, $2, $3, 'GRANT', 'MANUAL', gen_random_uuid(), 4, $4)`,
      [id, organizationId, await newAssignment(), randomUUID()],
    );

    return id;
  };
  const reason = async (
    taskId: string,
    extra: { source?: string; referenceId?: string | null; notBefore?: string | null; dueOn?: string | null } = {},
  ): Promise<{ id: string; code: string | null }> => {
    const id = randomUUID();
    const code = await sqlState(
      sql,
      `INSERT INTO provisioning_task_reasons (id, task_id, source, decided_role, reference_kind, reference_id, not_before, due_on)
       VALUES ($1, $2, $3::"RevocationSource", 'MANAGER', $4, $5, $6, $7)`,
      [
        id,
        taskId,
        extra.source ?? 'GHOST_SEAT',
        extra.referenceId ? 'REVIEW' : null,
        extra.referenceId ?? null,
        extra.notBefore ?? null,
        extra.dueOn ?? null,
      ],
    );

    return { id, code };
  };
  const withdraw = (id: string, extra = '') =>
    sqlState(
      sql,
      `UPDATE provisioning_task_reasons SET withdrawn_at = now(), withdrawn_by_app_user_id = $2, withdraw_cause = 'NO_LONGER_APPLIES' ${extra}
        WHERE id = $1`,
      [id, randomUUID()],
    );
  const cancel = (id: string, closeReason: string) =>
    sqlState(
      sql,
      `UPDATE provisioning_tasks SET status = 'CANCELLED', closed_by_app_user_id = $2, closed_at = now(), close_reason = $3 WHERE id = $1`,
      [id, randomUUID(), closeReason],
    );
  const inProgress = (id: string) =>
    sql.query(
      `UPDATE provisioning_tasks SET status = 'IN_PROGRESS', claimed_by_app_user_id = $2, claimed_at = now() WHERE id = $1`,
      [id, randomUUID()],
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
    const owner = await newEmployee();
    const applicationId = randomUUID();
    await sql.query(
      `INSERT INTO applications (id, organization_id, kind, name, normalized_name, business_owner_employee_id,
         data_sensitivity, comm_person_to_person_messaging, comm_calls_or_meetings, comm_mailbox, is_communication_service)
       VALUES ($1, $2, 'INTERNAL', 'Portal', 'portal', $3, 'LOW', false, false, false, false)`,
      [applicationId, organizationId, owner],
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

  describe('BR-MF5-04: the timing columns', () => {
    it('stores a reason with no timing (the old rows) and one with a day not before and a due day', async () => {
      const id = await task();

      expect((await reason(id)).code).toBeNull();
      expect(
        (await reason(id, { source: 'TIME_LIMITED_EXPIRY', notBefore: '2026-11-08', dueOn: '2026-11-20' })).code,
      ).toBeNull();
      const { rows } = await sql.query(`SELECT not_before, due_on FROM provisioning_tasks WHERE id = $1`, [id]);
      expect(rows[0]).toEqual({ not_before: null, due_on: null });
    });

    it('refuses a day not before that is after the due day', async () => {
      expect((await reason(await task(), { notBefore: '2026-11-20', dueOn: '2026-11-08' })).code).toBe('23514');
    });
  });

  describe('BR-MF5-04: the trigger and the index of the reasons', () => {
    it('lets a reason be withdrawn once and changes nothing else of it; never deletes it', async () => {
      const taskId = await task();
      const { id } = await reason(taskId);

      expect(await sqlState(sql, `UPDATE provisioning_task_reasons SET note = 'đổi' WHERE id = $1`, [id])).toBe(
        '55000',
      );
      expect(await withdraw(id, `, note = 'đổi'`)).toBe('55000');
      expect(await withdraw(id)).toBeNull();
      expect(await withdraw(id)).toBe('55000');
      expect(await sqlState(sql, `DELETE FROM provisioning_task_reasons WHERE id = $1`, [id])).toBe('55000');
    });

    it('refuses a withdrawal without its cause and a cause without its withdrawal', async () => {
      const { id } = await reason(await task());

      expect(await sqlState(sql, `UPDATE provisioning_task_reasons SET withdrawn_at = now() WHERE id = $1`, [id])).toBe(
        '55000',
      );
      expect(await sqlState(sql, `UPDATE provisioning_task_reasons SET withdraw_cause = 'x' WHERE id = $1`, [id])).toBe(
        '55000',
      );
    });

    it('refuses a row that is inserted withdrawn without its cause', async () => {
      expect(
        await sqlState(
          sql,
          `INSERT INTO provisioning_task_reasons (id, task_id, source, decided_role, withdrawn_at)
           VALUES (gen_random_uuid(), $1, 'GHOST_SEAT', 'MANAGER', now())`,
          [await task()],
        ),
      ).toBe('23514');
    });

    it('lets the same source and reference ask again after it was withdrawn, and refuses two that stand', async () => {
      const taskId = await task();
      const referenceId = randomUUID();
      const first = await reason(taskId, { referenceId });

      expect((await reason(taskId, { referenceId })).code).toBe('23505');
      expect(await withdraw(first.id)).toBeNull();
      expect((await reason(taskId, { referenceId })).code).toBeNull();
      expect((await reason(taskId, { referenceId })).code).toBe('23505');
    });
  });

  describe('BR-MF5-04: the guard of a task that is being worked', () => {
    it('lets a revocation that is being worked end as cancelled for NO_LONGER_APPLIES, and no other reason', async () => {
      const id = await task();
      await inProgress(id);

      expect(await cancel(id, 'OTHER')).toBe('55000');
      expect(await cancel(id, 'NO_LONGER_APPLIES')).toBeNull();
    });

    it('does not let a grant that is being worked end as cancelled for NO_LONGER_APPLIES', async () => {
      const id = await task('GRANT');
      await inProgress(id);

      expect(await cancel(id, 'NO_LONGER_APPLIES')).toBe('55000');
    });

    it('keeps the old reason that cancels a task that is being worked', async () => {
      const id = await task('GRANT');
      await inProgress(id);

      expect(await cancel(id, 'BENEFICIARY_TRANSFERRED')).toBeNull();
    });
  });
});
