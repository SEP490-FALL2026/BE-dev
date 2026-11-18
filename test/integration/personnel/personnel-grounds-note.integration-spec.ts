import { LeaveHarness } from '../../support/leave-harness';
import type { Department } from '../../support/request-harness';

const h = new LeaveHarness();

/**
 * QĐ-111bd, R-32: the basis of a personnel event is one box of words, kept in `grounds_reference`; the other three parts of the old basis
 * are all there or all absent. On real PostgreSQL, on the five tables that carry it.
 */
describe('the basis in one box in the database (integration, real PostgreSQL)', () => {
  let des: Department;
  let leaveId: string;
  let employeeId: string;
  const TABLES = [
    'offboarding_cases',
    'department_transfers',
    'department_transfer_changes',
    'employee_leaves',
    'employee_leave_changes',
  ];

  /** The code of what the statement was refused with, or null when it went through; always rolled back. */
  const sqlState = async (sql: string, params: unknown[] = []): Promise<string | null> => {
    await h.ctx.sql.query('BEGIN');
    try {
      await h.ctx.sql.query(sql, params);

      return null;
    } catch (error) {
      return (error as { code?: string }).code ?? 'unknown';
    } finally {
      await h.ctx.sql.query('ROLLBACK');
    }
  };

  const insertLeave = (ground: { type: string | null; reference: string; issuer: string | null; on: string | null }) =>
    sqlState(
      `INSERT INTO employee_leaves (id, organization_id, employee_id, started_on, approved_return_on, status, ended_on, end_kind,
                                    grounds_type, grounds_reference, grounds_issuer, grounds_issued_on, started_by_app_user_id)
       SELECT gen_random_uuid(), organization_id, employee_id, started_on - 40, started_on - 30, 'ENDED'::"EmployeeLeaveStatus",
              started_on - 35, 'RETURNED'::"EmployeeLeaveEndKind", $1, $2, $3, $4::date, started_by_app_user_id
         FROM employee_leaves WHERE id = $5`,
      [ground.type, ground.reference, ground.issuer, ground.on, leaveId],
    );

  const insertChange = (
    kind: string,
    ground: { type: string | null; reference: string | null; issuer: string | null; on: string | null },
  ) =>
    sqlState(
      `INSERT INTO employee_leave_changes (id, leave_id, kind, old_return_on, new_return_on, returned_on, on_schedule,
                                           grounds_type, grounds_reference, grounds_issuer, grounds_issued_on,
                                           recorded_by_app_user_id)
       SELECT gen_random_uuid(), id, $1::"EmployeeLeaveChangeKind",
              CASE WHEN $1 = 'RETURN_DATE_CHANGED' THEN approved_return_on END,
              CASE WHEN $1 = 'RETURN_DATE_CHANGED' THEN approved_return_on + 3 ELSE approved_return_on END,
              CASE WHEN $1 = 'RETURNED' THEN approved_return_on END,
              CASE WHEN $1 = 'RETURNED' THEN false END,
              $2, $3, $4, $5::date, started_by_app_user_id
         FROM employee_leaves WHERE id = $6`,
      [kind, ground.type, ground.reference, ground.issuer, ground.on, leaveId],
    );

  beforeAll(async () => {
    await h.start();
    des = await h.departmentWithUnit('NOTE');
    const person = await h.worker(des, 'E-NOTE-1');
    employeeId = person.employeeId;
    const leave = await h.started({
      employeeId,
      startedOn: h.day(-10),
      approvedReturnOn: h.day(10),
      groundsNote: h.approval,
    });
    leaveId = leave.id;
  }, 300000);

  afterAll(async () => {
    await h.stop();
  });

  it('lets type, issuer and day be empty on every table that carries a basis', async () => {
    const columns = await h.ctx.sql.query<{ table_name: string; column_name: string; is_nullable: string }>(
      `SELECT table_name, column_name, is_nullable FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = ANY($1)
          AND column_name IN ('grounds_type', 'grounds_issuer', 'grounds_issued_on', 'grounds_reference')`,
      [TABLES],
    );

    for (const table of TABLES) {
      const own = columns.rows.filter((row) => row.table_name === table);
      expect({ table, count: own.length }).toEqual({ table, count: 4 });
      for (const row of own) {
        expect({ table, column: row.column_name, nullable: row.is_nullable }).toEqual({
          table,
          column: row.column_name,
          // The reference stays required where the basis is: it is the box itself; only the leave changes may have none at all.
          nullable: row.column_name !== 'grounds_reference' || table === 'employee_leave_changes' ? 'YES' : 'NO',
        });
      }
    }
  });

  it('accepts a leave whose whole basis is the box, and one with the four parts as before', async () => {
    expect(
      await insertLeave({ type: null, reference: 'Đơn xin nghỉ dài hạn số 5/2026', issuer: null, on: null }),
    ).toBeNull();
    expect(
      await insertLeave({ type: 'APPROVED_APPLICATION', reference: 'DN-06/2026', issuer: 'HR', on: '2026-05-25' }),
    ).toBeNull();
  });

  it('refuses a leave with an empty box, and one with some of the other three parts but not all', async () => {
    const note = 'Đơn xin nghỉ dài hạn số 5/2026';

    expect(await insertLeave({ type: null, reference: '   ', issuer: null, on: null })).toBe('23514');
    expect(await insertLeave({ type: 'APPROVED_APPLICATION', reference: note, issuer: null, on: null })).toBe('23514');
    expect(await insertLeave({ type: null, reference: note, issuer: 'HR', on: '2026-05-25' })).toBe('23514');
    expect(await insertLeave({ type: 'APPROVED_APPLICATION', reference: note, issuer: 'HR', on: null })).toBe('23514');
    expect(await insertLeave({ type: ' ', reference: note, issuer: 'HR', on: '2026-05-25' })).toBe('23514');
  });

  it('writes a change of a leave that needs a basis with only the box, and refuses one with no basis at all', async () => {
    const only = { type: null, reference: 'Đơn gia hạn nghỉ số 9/2026', issuer: null, on: null };
    const none = { type: null, reference: null, issuer: null, on: null };

    expect(await insertChange('STARTED', only)).toBeNull();
    expect(await insertChange('RETURN_DATE_CHANGED', only)).toBeNull();
    expect(await insertChange('RETURNED', only)).toBeNull();
    expect(await insertChange('STARTED', none)).toBe('23514');
    expect(await insertChange('RETURN_DATE_CHANGED', none)).toBe('23514');
    expect(await insertChange('RETURNED', none)).toBe('23514');
    expect(await insertChange('STARTED', { ...only, issuer: 'HR' })).toBe('23514');
  });

  it('reads an event written with the four parts as one sentence, so the kind of document, who issued it and the day are not lost; one with the box as it was written', async () => {
    const read = async () => h.dataOf<{ groundsNote: string }>(await h.readLeave(leaveId).expect(200)).groundsNote;
    const changes = async () =>
      h.dataOf<{ items: { kind: string; groundsNote: string | null }[] }>(await h.leaveChanges(leaveId).expect(200))
        .items;
    expect(await read()).toBe(h.approval);

    await h.ctx.sql.query(
      `UPDATE employee_leaves SET grounds_type = 'APPROVED_APPLICATION', grounds_reference = 'DN-06/2026',
              grounds_issuer = 'HR', grounds_issued_on = DATE '2026-05-25' WHERE id = $1`,
      [leaveId],
    );
    // The history is append-only: the change written before the box is a row of its own.
    await h.ctx.sql.query(
      `INSERT INTO employee_leave_changes (id, leave_id, kind, old_return_on, new_return_on, grounds_type, grounds_reference,
                                           grounds_issuer, grounds_issued_on, recorded_by_app_user_id)
       SELECT gen_random_uuid(), id, 'RETURN_DATE_CHANGED'::"EmployeeLeaveChangeKind", approved_return_on, approved_return_on + 3,
              'APPROVED_APPLICATION', 'DN-06/2026', 'HR', DATE '2026-05-25', started_by_app_user_id
         FROM employee_leaves WHERE id = $1`,
      [leaveId],
    );

    expect(await read()).toBe('APPROVED_APPLICATION DN-06/2026 — HR, 2026-05-25');
    const kept = await changes();
    expect(kept.find((change) => change.kind === 'STARTED')?.groundsNote).toBe(h.approval);
    expect(kept.find((change) => change.kind === 'RETURN_DATE_CHANGED')?.groundsNote).toBe(
      'APPROVED_APPLICATION DN-06/2026 — HR, 2026-05-25',
    );
  });
});
