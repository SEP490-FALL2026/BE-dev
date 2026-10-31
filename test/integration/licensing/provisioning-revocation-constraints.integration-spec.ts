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

describe('the tasks of a revocation (integration, PostgreSQL constraints)', () => {
  let database: DisposableDatabase;
  let sql: Client;
  let organizationId: string;
  let planId: string;
  let counter = 0;
  const person = () => randomUUID();

  const newEmployee = async (): Promise<string> => {
    const id = randomUUID();
    counter += 1;
    await sql.query(
      `INSERT INTO employees (id, organization_id, employee_code, full_name, employment_type, hire_date, updated_at)
       VALUES ($1, $2, $3, $3, 'STAFF', '2026-01-01', now())`,
      [id, organizationId, `E-REV-${counter}`],
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
      [id, organizationId, planId, await newEmployee(), `user${counter}@congty.vn`, person()],
    );

    return id;
  };
  /** A revocation task, queued, with the columns the test adds or overrides. */
  const revocation = async (
    extra: { assignmentId?: string; source?: string | null; requestId?: string | null } = {},
  ) => {
    const id = randomUUID();
    const code = await sqlState(
      sql,
      `INSERT INTO provisioning_tasks (id, organization_id, assignment_id, kind, channel, request_id, revocation_source,
         max_attempts, created_by_app_user_id)
       VALUES ($1, $2, $3, 'REVOKE', 'MANUAL', $4, $5::"RevocationSource", 4, $6)`,
      [
        id,
        organizationId,
        extra.assignmentId ?? (await newAssignment()),
        extra.requestId ?? null,
        extra.source === undefined ? 'RETURN' : extra.source,
        person(),
      ],
    );

    return { id, code };
  };
  const grant = (assignmentId: string, requestId: string | null = randomUUID()) =>
    sqlState(
      sql,
      `INSERT INTO provisioning_tasks (id, organization_id, assignment_id, kind, channel, request_id, max_attempts,
         created_by_app_user_id)
       VALUES (gen_random_uuid(), $1, $2, 'GRANT', 'MANUAL', $3, 4, $4)`,
      [organizationId, assignmentId, requestId, person()],
    );
  /** The grant task with an id the test knows, so that it can be ended afterwards. */
  const grantWithId = async (assignmentId: string): Promise<{ id: string; code: string | null }> => {
    const id = randomUUID();
    const code = await sqlState(
      sql,
      `INSERT INTO provisioning_tasks (id, organization_id, assignment_id, kind, channel, request_id, max_attempts,
         created_by_app_user_id)
       VALUES ($1, $2, $3, 'GRANT', 'MANUAL', $4, 4, $5)`,
      [id, organizationId, assignmentId, randomUUID(), person()],
    );

    return { id, code };
  };
  const claimed = async (assignmentId?: string) => {
    const made = await revocation({ ...(assignmentId ? { assignmentId } : {}) });
    await sql.query(
      `UPDATE provisioning_tasks SET status = 'IN_PROGRESS', claimed_by_app_user_id = $2, claimed_at = now() WHERE id = $1`,
      [made.id, person()],
    );

    return made.id;
  };
  /** Completes a claimed revocation with the given columns; the statement says the same thing as the application's write. */
  const complete = (id: string, columns: Record<string, string | null>) => {
    const names = Object.keys(columns);

    return sqlState(
      sql,
      `UPDATE provisioning_tasks SET status = 'COMPLETED', completed_by_app_user_id = $2, completed_at = now(),
         evidence = 'đã làm' ${names.map((name, index) => `, ${name} = $${index + 3}`).join('')} WHERE id = $1`,
      [id, person(), ...names.map((name) => columns[name])],
    );
  };
  const reason = (taskId: string, extra: { source?: string; referenceId?: string | null; role?: string } = {}) =>
    sqlState(
      sql,
      `INSERT INTO provisioning_task_reasons (id, task_id, source, decided_role, reference_kind, reference_id)
       VALUES (gen_random_uuid(), $1, $2::"RevocationSource", $3, $4, $5)`,
      [
        taskId,
        extra.source ?? 'RETURN',
        extra.role ?? 'MANAGER',
        extra.referenceId ? 'REQUEST' : null,
        extra.referenceId ?? null,
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

  describe('a grant answers for a request and a revocation for none (US-07-05 AC-3, AC-11)', () => {
    it('stores a revocation with the source that opened it and no request', async () => {
      expect((await revocation()).code).toBeNull();
    });

    it('refuses a revocation with no source, and a grant that carries a column of a revocation', async () => {
      expect((await revocation({ source: null })).code).toBe('23514');
      expect(
        await sqlState(
          sql,
          `INSERT INTO provisioning_tasks (id, organization_id, assignment_id, kind, channel, request_id,
             revocation_source, max_attempts, created_by_app_user_id)
           VALUES (gen_random_uuid(), $1, $2, 'GRANT', 'MANUAL', $3, 'RETURN', 4, $4)`,
          [organizationId, await newAssignment(), randomUUID(), person()],
        ),
      ).toBe('23514');
      expect(
        await sqlState(
          sql,
          `INSERT INTO provisioning_tasks (id, organization_id, assignment_id, kind, channel, request_id,
             completion_note, max_attempts, created_by_app_user_id)
           VALUES (gen_random_uuid(), $1, $2, 'GRANT', 'MANUAL', $3, 'x', 4, $4)`,
          [organizationId, await newAssignment(), randomUUID(), person()],
        ),
      ).toBe('23514');
    });

    it('refuses a grant with no request and a revocation with one', async () => {
      expect(await grant(await newAssignment(), null)).toBe('23514');
      expect((await revocation({ requestId: randomUUID() })).code).toBe('23514');
    });
  });

  describe('one grant and one live revocation for a seat (US-07-05 AC-11, AC-15)', () => {
    it('keeps one OPEN grant task for one assignment: a grant that ended no longer blocks the next one (F07)', async () => {
      const assignmentId = await newAssignment();

      const first = await grantWithId(assignmentId);
      expect(first.code).toBeNull();
      expect(await grant(assignmentId)).toBe('23505');
      expect(
        await sqlState(
          sql,
          `UPDATE provisioning_tasks SET status = 'CANCELLED', closed_by_app_user_id = $2, closed_at = now(),
             close_reason = 'REQUESTER_WITHDREW' WHERE id = $1`,
          [first.id, person()],
        ),
      ).toBeNull();

      expect(await grant(assignmentId)).toBeNull();
      expect(await grant(assignmentId)).toBe('23505');
    });

    it('lets the next grant of an assignment follow one that was closed as failed or completed, and refuses it while one is open in any state (F07)', async () => {
      const toInProgress = (id: string) =>
        sql.query(
          `UPDATE provisioning_tasks SET status = 'IN_PROGRESS', claimed_by_app_user_id = $2, claimed_at = now() WHERE id = $1`,
          [id, person()],
        );

      // A grant that is being worked, and then one that failed and waits for the IT Admin, are both still open.
      const closedAsFailed = await newAssignment();
      const first = await grantWithId(closedAsFailed);
      expect(first.code).toBeNull();
      await toInProgress(first.id);
      expect(await grant(closedAsFailed)).toBe('23505');
      await sql.query(
        `UPDATE provisioning_tasks SET status = 'FAILED', failed_by_app_user_id = $2, failed_at = now(),
           failure_reason = 'không cấp được', failure_kind = 'NOT_DONE' WHERE id = $1`,
        [first.id, person()],
      );
      expect(await grant(closedAsFailed)).toBe('23505');
      // Closed as failed: it ended, so the next grant is allowed, and it is the one open grant from then on.
      await sql.query(
        `UPDATE provisioning_tasks SET status = 'CLOSED_FAILED', closed_by_app_user_id = $2, closed_at = now(),
           close_reason = 'đóng' WHERE id = $1`,
        [first.id, person()],
      );
      expect(await grant(closedAsFailed)).toBeNull();
      expect(await grant(closedAsFailed)).toBe('23505');

      // A completed grant ended as well: the next one is allowed, and the open one blocks a third.
      const completed = await newAssignment();
      const done = await grantWithId(completed);
      await toInProgress(done.id);
      await sql.query(
        `UPDATE provisioning_tasks SET status = 'COMPLETED', completed_by_app_user_id = $2, completed_at = now(),
           evidence = 'xong' WHERE id = $1`,
        [done.id, person()],
      );
      expect(await grant(completed)).toBeNull();
      expect(await grant(completed)).toBe('23505');
    });

    it('lets a seat have a grant and a revocation, but not two live revocations', async () => {
      const assignmentId = await newAssignment();

      expect(await grant(assignmentId)).toBeNull();
      expect((await revocation({ assignmentId })).code).toBeNull();
      expect((await revocation({ assignmentId, source: 'DEPARTURE' })).code).toBe('23505');
    });

    it('lets a source open another revocation after the first was closed as failed or cancelled', async () => {
      const assignmentId = await newAssignment();
      const first = await claimed(assignmentId);
      await sql.query(
        `UPDATE provisioning_tasks SET status = 'FAILED', failed_by_app_user_id = $2, failed_at = now(),
           failure_reason = 'không xóa được', failure_kind = 'NOT_DONE' WHERE id = $1`,
        [first, person()],
      );
      expect((await revocation({ assignmentId })).code).toBe('23505');

      await sql.query(
        `UPDATE provisioning_tasks SET status = 'CLOSED_FAILED', closed_by_app_user_id = $2, closed_at = now(),
           close_reason = 'đóng' WHERE id = $1`,
        [first, person()],
      );
      const second = await revocation({ assignmentId });

      expect(second.code).toBeNull();
      await sql.query(
        `UPDATE provisioning_tasks SET status = 'CANCELLED', closed_by_app_user_id = $2, closed_at = now(),
           close_reason = 'hủy' WHERE id = $1`,
        [second.id, person()],
      );
      expect((await revocation({ assignmentId })).code).toBeNull();
    });

    it('does not let a completed revocation be followed by another: it ended the seat', async () => {
      const assignmentId = await newAssignment();
      const id = await claimed(assignmentId);
      expect(await complete(id, { completion: 'OFF_SYSTEM_REVOKED' })).toBeNull();

      expect((await revocation({ assignmentId })).code).toBe('23505');
    });
  });

  describe('the columns of a completed revocation say what was done (US-07-05 AC-1, AC-4, AC-5, AC-8)', () => {
    it('completes a revocation only with the way it was done', async () => {
      const id = await claimed();

      expect(await complete(id, {})).toBe('23514');
      expect(await complete(id, { completion: 'ACCOUNT_REMOVED' })).toBeNull();
    });

    it('refuses a way before the task is completed', async () => {
      const id = await claimed();

      expect(
        await sqlState(sql, `UPDATE provisioning_tasks SET completion = 'ACCOUNT_REMOVED' WHERE id = $1`, [id]),
      ).toBe('23514');
    });

    it('needs a note of who confirmed it when the account was already gone', async () => {
      const blank = await claimed();
      const noted = await claimed();

      expect(await complete(blank, { completion: 'ALREADY_GONE' })).toBe('23514');
      expect(await complete(blank, { completion: 'ALREADY_GONE', completion_note: '  ' })).toBe('23514');
      expect(await complete(noted, { completion: 'ALREADY_GONE', completion_note: 'người dùng tự xóa' })).toBeNull();
    });

    it('needs the end of the paid period and the state of the access for a K1 renewal that was cancelled', async () => {
      const renewal = { completion: 'RENEWAL_CANCELLED' };
      const missing = await claimed();

      expect(await complete(missing, renewal)).toBe('23514');
      expect(await complete(missing, { ...renewal, paid_through_on: '2026-11-30' })).toBe('23514');
      expect(await complete(missing, { ...renewal, access_state: 'UNTIL_PAID_END' })).toBe('23514');
      expect(
        await complete(missing, { ...renewal, paid_through_on: '2026-11-30', access_state: 'UNTIL_PAID_END' }),
      ).toBeNull();
    });

    it('needs the day and the evidence when the access was cut, and neither when it runs on', async () => {
      const base = { completion: 'RENEWAL_CANCELLED', paid_through_on: '2026-11-30' };
      const id = await claimed();

      expect(await complete(id, { ...base, access_state: 'CUT' })).toBe('23514');
      expect(await complete(id, { ...base, access_state: 'CUT', access_cut_on: '2026-10-20' })).toBe('23514');
      expect(
        await complete(id, { ...base, access_state: 'CUT', access_cut_on: '2026-10-20', access_evidence: ' ' }),
      ).toBe('23514');
      expect(await complete(id, { ...base, access_state: 'UNTIL_PAID_END', access_cut_on: '2026-10-20' })).toBe(
        '23514',
      );
      expect(
        await complete(id, { ...base, access_state: 'CUT', access_cut_on: '2026-10-20', access_evidence: 'đã khóa' }),
      ).toBeNull();
    });

    it('refuses the columns of a K1 renewal on any other way', async () => {
      const id = await claimed();

      expect(await complete(id, { completion: 'ACCOUNT_REMOVED', paid_through_on: '2026-11-30' })).toBe('23514');
      expect(await complete(id, { completion: 'OFF_SYSTEM_REVOKED', access_state: 'UNTIL_PAID_END' })).toBe('23514');
    });
  });

  describe('a completed revocation is final, but for the one cut of an access that ran on (US-07-05 AC-19)', () => {
    const renewal = { completion: 'RENEWAL_CANCELLED', paid_through_on: '2026-11-30', access_state: 'UNTIL_PAID_END' };
    const cut = (id: string, extra = '') =>
      sqlState(
        sql,
        `UPDATE provisioning_tasks SET access_state = 'CUT', access_cut_on = '2026-11-12', access_evidence = 'đã khóa' ${extra}
          WHERE id = $1`,
        [id],
      );

    it('takes the cut once and nothing else', async () => {
      const id = await claimed();
      expect(await complete(id, renewal)).toBeNull();

      expect(await cut(id, `, evidence = 'đổi'`)).toBe('55000');
      expect(await cut(id, `, paid_through_on = '2026-12-31'`)).toBe('55000');
      expect(await cut(id)).toBeNull();
      expect(await cut(id)).toBe('55000');
      expect(await sqlState(sql, `UPDATE provisioning_tasks SET evidence = 'đổi' WHERE id = $1`, [id])).toBe('55000');
    });

    it('takes no cut where the access did not run on, and changes nothing of a revocation that ended another way', async () => {
      const removed = await claimed();
      const alreadyCut = await claimed();
      expect(await complete(removed, { completion: 'ACCOUNT_REMOVED' })).toBeNull();
      expect(
        await complete(alreadyCut, {
          ...renewal,
          access_state: 'CUT',
          access_cut_on: '2026-10-20',
          access_evidence: 'đã khóa',
        }),
      ).toBeNull();

      expect(await cut(removed)).toBe('55000');
      expect(await cut(alreadyCut)).toBe('55000');
    });

    it('never deletes a task, whatever the state', async () => {
      const { id } = await revocation();

      expect(await sqlState(sql, `DELETE FROM provisioning_tasks WHERE id = $1`, [id])).toBe('55000');
    });
  });

  describe('the reasons that asked for a revocation (US-07-05 AC-11)', () => {
    it('keeps one reason for each source and what it refers to', async () => {
      const { id } = await revocation();
      const request = randomUUID();

      expect(await reason(id)).toBeNull();
      expect(await reason(id)).toBe('23505');
      expect(await reason(id, { source: 'DEPARTURE' })).toBeNull();
      expect(await reason(id, { referenceId: request })).toBeNull();
      expect(await reason(id, { referenceId: request })).toBe('23505');
      expect(await reason(id, { referenceId: randomUUID() })).toBeNull();
    });

    it('is never changed or deleted', async () => {
      const { id } = await revocation();
      await reason(id);

      expect(await sqlState(sql, `UPDATE provisioning_task_reasons SET note = 'đổi' WHERE task_id = $1`, [id])).toBe(
        '55000',
      );
      expect(await sqlState(sql, `DELETE FROM provisioning_task_reasons WHERE task_id = $1`, [id])).toBe('55000');
    });

    it('refuses a reason with no role, a blank note, a half reference, a task or a person that is not there', async () => {
      const { id } = await revocation();

      expect(await reason(id, { role: '  ' })).toBe('23514');
      expect(
        await sqlState(
          sql,
          `INSERT INTO provisioning_task_reasons (id, task_id, source, decided_role, note)
           VALUES (gen_random_uuid(), $1, 'RETURN', 'HR', ' ')`,
          [id],
        ),
      ).toBe('23514');
      expect(
        await sqlState(
          sql,
          `INSERT INTO provisioning_task_reasons (id, task_id, source, decided_role, reference_kind)
           VALUES (gen_random_uuid(), $1, 'RETURN', 'HR', 'REQUEST')`,
          [id],
        ),
      ).toBe('23514');
      expect(await reason(randomUUID())).toBe('23503');
      expect(
        await sqlState(
          sql,
          `INSERT INTO provisioning_task_reasons (id, task_id, source, decided_by_employee_id, decided_role)
           VALUES (gen_random_uuid(), $1, 'RETURN', $2, 'HR')`,
          [id, randomUUID()],
        ),
      ).toBe('23503');
    });
  });

  it('keeps no column for a password or any secret in the reasons or the evidence of access', async () => {
    const { rows } = await sql.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name IN ('provisioning_task_reasons', 'provisioning_tasks')`,
    );

    expect(
      rows.map((row) => row.column_name).filter((name) => /password|secret|credential|token|key/i.test(name)),
    ).toEqual([]);
  });
});
