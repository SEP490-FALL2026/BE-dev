import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import {
  DisposableDatabase,
  dropDisposableDatabase,
  migrateDisposableDatabase,
  provisionDisposableDatabase,
} from '../../support/disposable-database';

/** What a rejected statement carried: the SQLSTATE and the constraint that said no, or null when it went through. */
async function refusal(
  sql: Client,
  text: string,
  values: unknown[] = [],
): Promise<{ code: string; constraint: string } | null> {
  try {
    await sql.query(text, values);

    return null;
  } catch (error) {
    const failure = error as { code?: string; constraint?: string };

    return { code: failure.code ?? 'unknown', constraint: failure.constraint ?? '' };
  }
}

/**
 * Redesign wave 2, W2-01 (h) (QĐ-118): the IT Admin the Super Admin names to stand in for a department, and the one named for a piece
 * of work of a person who was never placed. PostgreSQL keeps one appointment in force, never deletes one, and lets it end once.
 */
describe('the appointments of IT Admins in place of a department (integration, PostgreSQL constraints)', () => {
  let database: DisposableDatabase;
  let sql: Client;
  let org: string;
  let employee: string;
  let designee: string;
  const user = randomUUID();

  const department = async (): Promise<string> => {
    const id = randomUUID();
    await sql.query(
      `INSERT INTO departments (id, organization_id, code, name, updated_at) VALUES ($1, $2, $3, $3, now())`,
      [id, org, `D-${id.slice(0, 8)}`],
    );

    return id;
  };
  const appoint = async (
    departmentId: string,
    reason = 'On leave',
  ): Promise<{ id: string; failure: Awaited<ReturnType<typeof refusal>> }> => {
    const id = randomUUID();
    const failure = await refusal(
      sql,
      `INSERT INTO department_it_substitutes (id, organization_id, department_id, substitute_employee_id, reason, appointed_at,
         appointed_by_app_user_id) VALUES ($1, $2, $3, $4, $5, now(), $6)`,
      [id, org, departmentId, designee, reason, user],
    );

    return { id, failure };
  };
  const end = (id: string, cause = 'REMOVED') =>
    refusal(
      sql,
      `UPDATE department_it_substitutes SET ended_at = now(), ended_by_app_user_id = $3, end_cause = $2::"DepartmentItSubstituteEndCause" WHERE id = $1`,
      [id, cause, user],
    );
  const designate = async (workId: string): Promise<{ id: string; failure: Awaited<ReturnType<typeof refusal>> }> => {
    const id = randomUUID();
    const failure = await refusal(
      sql,
      `INSERT INTO unplaced_work_it_designations (id, organization_id, work_kind, work_id, employee_id, designee_employee_id, reason,
         appointed_at, appointed_by_app_user_id) VALUES ($1, $2, 'DEVICE_RETURN_TASK', $3, $4, $5, 'No department', now(), $6)`,
      [id, org, workId, employee, designee, user],
    );

    return { id, failure };
  };

  beforeAll(async () => {
    database = await provisionDisposableDatabase();
    await migrateDisposableDatabase(database);
    sql = new Client({ connectionString: database.url });
    await sql.connect();
    org = randomUUID();
    employee = randomUUID();
    designee = randomUUID();
    await sql.query(
      `INSERT INTO organizations (id, name, time_zone, reporting_currency) VALUES ($1, 'Acme', 'UTC', 'VND')`,
      [org],
    );
    await sql.query(
      `INSERT INTO employees (id, organization_id, employee_code, full_name, employment_type, hire_date, updated_at) VALUES
         ($1, $3, 'E-ONE', 'One', 'STAFF', '2026-01-01', now()), ($2, $3, 'E-IT', 'IT', 'STAFF', '2026-01-01', now())`,
      [employee, designee, org],
    );
  }, 90000);

  afterAll(async () => {
    await sql?.end();
    if (database) await dropDisposableDatabase(database);
  });

  describe('a department', () => {
    it('has one appointment in force, and takes another when the first has ended', async () => {
      const dept = await department();
      const first = await appoint(dept);
      expect(first.failure).toBeNull();

      expect((await appoint(dept)).failure).toMatchObject({
        code: '23505',
        constraint: 'department_it_substitutes_one_active',
      });
      expect(await end(first.id)).toBeNull();
      expect((await appoint(dept)).failure).toBeNull();
      expect((await appoint(await department())).failure).toBeNull();
    });

    it('never deletes an appointment', async () => {
      const { id } = await appoint(await department());

      expect((await refusal(sql, `DELETE FROM department_it_substitutes WHERE id = $1`, [id]))?.constraint).toBe(
        'department_it_substitutes_kept',
      );
    });

    it('keeps what the appointment said when it was made', async () => {
      const { id } = await appoint(await department());

      for (const [column, value] of [
        ['reason', 'Other reason'],
        ['substitute_employee_id', employee],
        ['replaced_employee_id', employee],
        ['department_id', await department()],
        ['appointed_by_app_user_id', randomUUID()],
      ] as const) {
        expect(
          (await refusal(sql, `UPDATE department_it_substitutes SET ${column} = $2 WHERE id = $1`, [id, value]))
            ?.constraint,
        ).toBe('department_it_substitutes_fixed');
      }
    });

    it('ends once, with the cause, the time and who ended it told together', async () => {
      const { id } = await appoint(await department());

      expect(
        (await refusal(sql, `UPDATE department_it_substitutes SET ended_at = now() WHERE id = $1`, [id]))?.constraint,
      ).toBe('department_it_substitutes_end_complete');
      expect(
        (await refusal(sql, `UPDATE department_it_substitutes SET ended_by_app_user_id = $2 WHERE id = $1`, [id, user]))
          ?.constraint,
      ).toBe('department_it_substitutes_end_complete');
      expect(await end(id, 'IN_CHARGE_NAMED')).toBeNull();
      expect((await end(id, 'REMOVED'))?.constraint).toBe('department_it_substitutes_ended_once');
    });

    it('tells the reason in one to five hundred characters', async () => {
      const dept = await department();

      expect((await appoint(dept, '   ')).failure?.constraint).toBe('department_it_substitutes_reason_length');
      expect((await appoint(dept, 'x'.repeat(501))).failure?.constraint).toBe(
        'department_it_substitutes_reason_length',
      );
      expect((await appoint(dept, 'x'.repeat(500))).failure).toBeNull();
    });
  });

  describe('a piece of work of a person who was never placed', () => {
    it('has one designation in force, and takes another when the first has ended', async () => {
      const work = randomUUID();
      const first = await designate(work);
      expect(first.failure).toBeNull();

      expect((await designate(work)).failure).toMatchObject({
        code: '23505',
        constraint: 'unplaced_work_it_designations_one_active',
      });
      expect((await designate(randomUUID())).failure).toBeNull();
      expect(
        await refusal(
          sql,
          `UPDATE unplaced_work_it_designations SET ended_at = now(), ended_by_app_user_id = NULL, end_cause = 'WORK_CLOSED' WHERE id = $1`,
          [first.id],
        ),
      ).toBeNull();
      expect((await designate(work)).failure).toBeNull();
    });

    it('is never deleted, keeps what it said, and ends once', async () => {
      const { id } = await designate(randomUUID());

      expect((await refusal(sql, `DELETE FROM unplaced_work_it_designations WHERE id = $1`, [id]))?.constraint).toBe(
        'unplaced_work_it_designations_kept',
      );
      expect(
        (
          await refusal(sql, `UPDATE unplaced_work_it_designations SET designee_employee_id = $2 WHERE id = $1`, [
            id,
            employee,
          ])
        )?.constraint,
      ).toBe('unplaced_work_it_designations_fixed');
      expect(
        (await refusal(sql, `UPDATE unplaced_work_it_designations SET ended_at = now() WHERE id = $1`, [id]))
          ?.constraint,
      ).toBe('unplaced_work_it_designations_end_complete');
      expect(
        await refusal(
          sql,
          `UPDATE unplaced_work_it_designations SET ended_at = now(), end_cause = 'REMOVED', ended_by_app_user_id = $2 WHERE id = $1`,
          [id, user],
        ),
      ).toBeNull();
      expect(
        (await refusal(sql, `UPDATE unplaced_work_it_designations SET end_cause = 'WORK_CLOSED' WHERE id = $1`, [id]))
          ?.constraint,
      ).toBe('unplaced_work_it_designations_ended_once');
    });

    it('tells the reason in one to five hundred characters', async () => {
      const refused = await refusal(
        sql,
        `INSERT INTO unplaced_work_it_designations (id, organization_id, work_kind, work_id, employee_id, designee_employee_id, reason,
           appointed_at, appointed_by_app_user_id) VALUES (gen_random_uuid(), $1, 'DEVICE', $2, $3, $4, '', now(), $5)`,
        [org, randomUUID(), employee, designee, user],
      );

      expect(refused?.constraint).toBe('unplaced_work_it_designations_reason_length');
    });
  });
});
