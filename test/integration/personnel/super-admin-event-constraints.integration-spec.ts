import { randomUUID } from 'node:crypto';
import { NoticeHarness } from '../../support/notice-harness';
import type { Department } from '../../support/request-harness';

const h = new NoticeHarness();
const CHECK = '23514';
const UNIQUE = '23505';
const FOREIGN_KEY = '23503';
const RESTRICT = '23001';
const INVALID_ENUM = '22P02';
const NOT_IN_STATE = '55000';
const REFERENCED_BY_FOREIGN_KEY = '0A000';

/** The SQLSTATE a rejected statement carries: the constraint, not the application, said no. */
async function sqlState(text: string, values: unknown[] = []): Promise<string | null> {
  try {
    await h.ctx.sql.query(text, values);

    return null;
  } catch (error) {
    return (error as { code?: string }).code ?? 'unknown';
  }
}

/** The SQLSTATE and the name of the constraint a rejected statement carries, so a test proves which rule said no. */
async function violation(
  text: string,
  values: unknown[] = [],
): Promise<{ code: string | null; constraint: string | null }> {
  try {
    await h.ctx.sql.query(text, values);

    return { code: null, constraint: null };
  } catch (error) {
    const failure = error as { code?: string; constraint?: string };

    return { code: failure.code ?? 'unknown', constraint: failure.constraint ?? null };
  }
}

/**
 * `g0-g6-final-business-baseline-remediation`, Task 1.8, F19, spec L.2: the approval ticket of an event whose subject is the Super
 * Admin is added to and never changed, is unique by its reference, and is the "who" of a record in place of an application
 * account, exactly one of the two where the person was required.
 */
describe('the approval tickets of Super Admin events (integration, PostgreSQL)', () => {
  let employees: string[];
  let account: string;

  const ticket = async (overrides: { ref?: string; mode?: string; environment?: string; subject?: string } = {}) => {
    const id = randomUUID();
    const state = await sqlState(
      `INSERT INTO super_admin_event_tickets
         (id, organization_id, ticket_ref, mode, subject_employee_id, parameters_digest, approver_ref, operator_ref, environment)
       VALUES ($1, $2, $3, $4::"SuperAdminEventMode", $5, 'digest-1', 'cto-1', 'ops-1', $6)`,
      [
        id,
        h.seed.organizationId,
        overrides.ref ?? `TCK-${randomUUID()}`,
        overrides.mode ?? 'LEAVE_START',
        overrides.subject ?? employees[0],
        overrides.environment ?? 'LOCAL_TEST',
      ],
    );

    return { id, state };
  };

  /** A leave of one of the people, started by the account, by the ticket, by both or by neither. */
  const leave = (person: string, by: { account?: string; ticket?: string }) =>
    sqlState(
      `INSERT INTO employee_leaves
         (id, organization_id, employee_id, started_on, approved_return_on, grounds_type, grounds_reference, grounds_issuer,
          grounds_issued_on, started_by_app_user_id, started_by_ticket_id)
       VALUES (gen_random_uuid(), $1, $2, '2026-10-01', '2026-12-01', 'DECISION', 'QD-1', 'HR', '2026-09-30', $3, $4)`,
      [h.seed.organizationId, person, by.account ?? null, by.ticket ?? null],
    );

  beforeAll(async () => {
    await h.start();
    const department = await h.departmentWithUnit('P-TICKET');
    employees = [];
    for (let index = 0; index < 5; index += 1) {
      employees.push((await h.staff(department, `TCK-S${index}`)).employeeId);
    }
    account = (await h.ctx.sql.query<{ id: string }>(`SELECT id FROM app_users WHERE employee_id = $1`, [employees[0]]))
      .rows[0].id;
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  describe('the ticket row', () => {
    it('is written once per organization and reference (23505)', async () => {
      const ref = `TCK-${randomUUID()}`;

      expect((await ticket({ ref })).state).toBeNull();
      expect((await ticket({ ref })).state).toBe(UNIQUE);
    });

    it('takes only a known environment (23514) and a known mode (22P02)', async () => {
      expect((await ticket({ environment: 'PRODUCTION' })).state).toBe(CHECK);
      expect((await ticket({ environment: 'SHARED' })).state).toBeNull();
      expect((await ticket({ mode: 'ANYTHING_ELSE' })).state).toBe(INVALID_ENUM);
      for (const mode of ['TRANSFER_RECORD', 'DEPARTURE_CANCEL', 'ABRUPT_DEPARTURE_RECORD', 'PROFILE_CORRECT']) {
        expect((await ticket({ mode })).state).toBeNull();
      }
    });

    it('names a person who exists (23503)', async () => {
      expect((await ticket({ subject: randomUUID() })).state).toBe(FOREIGN_KEY);
    });

    it('is never changed, deleted or truncated (23001)', async () => {
      const kept = await ticket();

      expect(kept.state).toBeNull();
      expect(
        await sqlState(`UPDATE super_admin_event_tickets SET approver_ref = 'someone-else' WHERE id = $1`, [kept.id]),
      ).toBe(RESTRICT);
      expect(await sqlState(`DELETE FROM super_admin_event_tickets WHERE id = $1`, [kept.id])).toBe(RESTRICT);
      // PostgreSQL itself refuses a TRUNCATE of a table that foreign keys point to unless CASCADE is named, before any trigger
      // runs; with CASCADE the truncate trigger of the ticket table is the one that says no.
      expect(await sqlState(`TRUNCATE super_admin_event_tickets`)).toBe(REFERENCED_BY_FOREIGN_KEY);
      expect(await sqlState(`TRUNCATE super_admin_event_tickets CASCADE`)).toBe(RESTRICT);
    });
  });

  describe('who started a record', () => {
    it('is the application account or the ticket, never both and never neither (23514)', async () => {
      const approval = await ticket();

      expect(await leave(employees[1], {})).toBe(CHECK);
      expect(await leave(employees[1], { account, ticket: approval.id })).toBe(CHECK);
      expect(await leave(employees[1], { account })).toBeNull();
      expect(await leave(employees[2], { ticket: approval.id })).toBeNull();
    });

    it('names a ticket that exists (23503)', async () => {
      expect(await leave(employees[3], { ticket: randomUUID() })).toBe(FOREIGN_KEY);
    });

    it('is not handed from one ticket to another while the leave runs (55000)', async () => {
      const first = await ticket();
      const second = await ticket();
      expect(await leave(employees[4], { ticket: first.id })).toBeNull();

      expect(
        await sqlState(
          `UPDATE employee_leaves SET started_by_ticket_id = $1 WHERE employee_id = $2 AND status = 'ACTIVE'`,
          [second.id, employees[4]],
        ),
      ).toBe(NOT_IN_STATE);
    });
  });

  /**
   * The other nine columns of the ten, and the three rules that read "the account or the ticket" (spec L.2). Each statement copies a
   * row the application wrote, with the columns under test changed, so what refuses it is the constraint and not the shape of the row;
   * the test names the constraint. A check is judged before the unique index and the foreign key of the same statement.
   */
  describe('the other nine columns, the three rewritten rules and the guards on the ticket', () => {
    type Row = { table: string; id: string };
    let pendingTransfer: Row;
    let cancelledTransfer: Row;
    let transferChange: Row;
    let leaveChange: Row;
    let pendingCase: Row;
    let cancelledCase: Row;
    let caseChange: Row;
    let waitingNotice: Row;
    let recordedNotice: Row;
    let verification: Row;
    let sequence = 0;

    /** Inserts a copy of the row with a new id and `over` set (a column set to null is written as null). */
    const copy = (row: Row, over: Record<string, string | null>) =>
      violation(
        `INSERT INTO ${row.table}
         SELECT (jsonb_populate_record(NULL::${row.table}, to_jsonb(t) || $2::jsonb)).* FROM ${row.table} t WHERE t.id = $1`,
        [row.id, JSON.stringify({ id: randomUUID(), ...over })],
      );
    const idOf = async (table: string, where = 'true'): Promise<Row> => ({
      table,
      id: (await h.ctx.sql.query<{ id: string }>(`SELECT id FROM ${table} WHERE ${where} ORDER BY id LIMIT 1`)).rows[0]
        .id,
    });
    const code = () => `BM09-2026-9${String((sequence += 1)).padStart(5, '0')}`;

    beforeAll(async () => {
      const des: Department = await h.departmentWithUnit('P-TK-DES');
      const fin: Department = await h.departmentWithUnit('P-TK-FIN');
      const worker = (name: string) => h.worker(des, `TK-${name}`);
      const move = async (name: string) =>
        h.recorded({
          employeeId: (await worker(name)).employeeId,
          toDepartmentId: fin.id,
          effectiveOn: h.day(20),
          groundsNote: h.groundsNote,
        });
      pendingTransfer = { table: 'department_transfers', id: (await move('MV1')).id };
      const cancelled = await move('MV2');
      await h.cancelTransfer(cancelled.id, { reason: 'No longer needed', groundsNote: h.groundsNote }).expect(200);
      cancelledTransfer = { table: 'department_transfers', id: cancelled.id };
      transferChange = await idOf('department_transfer_changes', `transfer_id = '${cancelled.id}'`);

      const away = await worker('LV');
      await h
        .startLongLeave({
          employeeId: away.employeeId,
          startedOn: h.day(-1),
          approvedReturnOn: h.day(40),
          groundsNote: 'Đơn xin nghỉ dài hạn số DN-07/2026',
        })
        .expect(201);
      leaveChange = await idOf('employee_leave_changes', `recorded_by_app_user_id IS NOT NULL`);

      pendingCase = { table: 'offboarding_cases', id: (await h.recordedCase(await worker('OB1'))).id };
      const stays = await h.recordedCase(await worker('OB2'));
      await h.cancelCase(stays.id, { reason: 'The person stays' }).expect(200);
      cancelledCase = { table: 'offboarding_cases', id: stays.id };
      caseChange = await idOf(
        'offboarding_case_changes',
        `case_id = '${stays.id}' AND changed_by_app_user_id IS NOT NULL`,
      );

      const head = await h.head(des, 'TK-HEAD');
      const noticeOf = async (name: string) =>
        h.sentNotice(
          { employeeId: (await worker(name)).employeeId, kind: 'DEPARTURE', proposedOn: h.day(5) },
          head.account,
        );
      waitingNotice = { table: 'personnel_notices', id: (await noticeOf('N1')).id };
      const handled = await noticeOf('N2');
      await h
        .recordNotice(handled.id, h.recording({ lastWorkingDay: h.day(12), accessBlockMode: 'WITH_LAST_DAY' }))
        .expect(201);
      recordedNotice = { table: 'personnel_notices', id: handled.id };
      verification = await idOf('personnel_notice_verifications', `notice_id = '${handled.id}'`);
    }, 300000);

    const WHO = [
      [
        'department_transfers',
        'recorded_by_app_user_id',
        'recorded_by_ticket_id',
        'ONE',
        'department_transfers_recorded_by_one',
        () => pendingTransfer,
      ],
      [
        'department_transfers',
        'cancelled_by_app_user_id',
        'cancelled_by_ticket_id',
        'AT_MOST_ONE',
        'department_transfers_cancelled_by_at_most_one',
        () => cancelledTransfer,
      ],
      [
        'department_transfer_changes',
        'changed_by_app_user_id',
        'changed_by_ticket_id',
        'ONE',
        'department_transfer_changes_changed_by_one',
        () => transferChange,
      ],
      [
        'employee_leave_changes',
        'recorded_by_app_user_id',
        'recorded_by_ticket_id',
        'ONE',
        'employee_leave_changes_recorded_by_one',
        () => leaveChange,
      ],
      [
        'offboarding_cases',
        'recorded_by_app_user_id',
        'recorded_by_ticket_id',
        'ONE',
        'offboarding_cases_recorded_by_one',
        () => pendingCase,
      ],
      [
        'offboarding_cases',
        'cancelled_by_app_user_id',
        'cancelled_by_ticket_id',
        'AT_MOST_ONE',
        'offboarding_cases_cancelled_by_at_most_one',
        () => cancelledCase,
      ],
      [
        'offboarding_case_changes',
        'changed_by_app_user_id',
        'changed_by_ticket_id',
        'ONE',
        'offboarding_case_changes_changed_by_one',
        () => caseChange,
      ],
      [
        'personnel_notices',
        'handled_by_app_user_id',
        'handled_by_ticket_id',
        'AT_MOST_ONE',
        'personnel_notices_handled_by_at_most_one',
        () => recordedNotice,
      ],
      [
        'personnel_notice_verifications',
        'verified_by_app_user_id',
        'verified_by_ticket_id',
        'ONE',
        'personnel_notice_verifications_verified_by_one',
        () => verification,
      ],
    ] as const;

    it.each(WHO)(
      '%s.%s and %s: the account and the ticket are never both named (23514)',
      async (_table, _account, ticketColumn, _rule, constraint, row) => {
        const approval = await ticket();

        expect(await copy(row(), { [ticketColumn]: approval.id })).toEqual({ code: CHECK, constraint });
      },
    );

    it.each(WHO.filter((entry) => entry[3] === 'ONE'))(
      '%s.%s and %s: where the person is required, naming neither is refused (23514)',
      async (_table, accountColumn, ticketColumn, _rule, constraint, row) => {
        expect(await copy(row(), { [accountColumn]: null, [ticketColumn]: null })).toEqual({ code: CHECK, constraint });
      },
    );

    it('department_transfers_cancelled_consistent: a transfer cancelled by a ticket is whole, one cancelled by nobody or a waiting one stamped as cancelled is not', async () => {
      const approval = await ticket();

      expect(
        await copy(cancelledTransfer, { cancelled_by_app_user_id: null, cancelled_by_ticket_id: approval.id }),
      ).toEqual({
        code: null,
        constraint: null,
      });
      expect(await copy(cancelledTransfer, { cancelled_by_app_user_id: null })).toEqual({
        code: CHECK,
        constraint: 'department_transfers_cancelled_consistent',
      });
      expect(
        await copy(pendingTransfer, {
          employee_id: employees[1],
          cancelled_at: new Date().toISOString(),
          cancelled_by_ticket_id: approval.id,
          cancelled_reason: 'No longer needed',
        }),
      ).toEqual({ code: CHECK, constraint: 'department_transfers_cancelled_consistent' });
    });

    it('offboarding_cases_cancelled_consistent_check: a case cancelled by a ticket is whole, one cancelled by nobody or a live one stamped as cancelled is not', async () => {
      const approval = await ticket();

      expect(
        await copy(cancelledCase, { cancelled_by_app_user_id: null, cancelled_by_ticket_id: approval.id }),
      ).toEqual({
        code: null,
        constraint: null,
      });
      expect(await copy(cancelledCase, { cancelled_by_app_user_id: null })).toEqual({
        code: CHECK,
        constraint: 'offboarding_cases_cancelled_consistent_check',
      });
      expect(
        await copy(pendingCase, {
          employee_id: employees[2],
          cancelled_at: new Date().toISOString(),
          cancelled_by_ticket_id: approval.id,
          cancel_reason: 'The person stays',
        }),
      ).toEqual({ code: CHECK, constraint: 'offboarding_cases_cancelled_consistent_check' });
    });

    it('personnel_notices_status_check: a notice handled by a ticket is whole, a handled one with nobody or a waiting one with a handler is not', async () => {
      const approval = await ticket();

      expect(
        await copy(recordedNotice, { code: code(), handled_by_app_user_id: null, handled_by_ticket_id: approval.id }),
      ).toEqual({ code: null, constraint: null });
      expect(await copy(recordedNotice, { code: code(), handled_by_app_user_id: null })).toEqual({
        code: CHECK,
        constraint: 'personnel_notices_status_check',
      });
      expect(await copy(waitingNotice, { code: code(), handled_by_ticket_id: approval.id })).toEqual({
        code: CHECK,
        constraint: 'personnel_notices_status_check',
      });
    });

    it('a transfer is not handed from one ticket to another while it waits, and a departure is not while it is handed over (55000)', async () => {
      const first = await ticket();
      const second = await ticket();
      const byFirst = { recorded_by_app_user_id: null, recorded_by_ticket_id: first.id };
      // The copies are for other people (one waiting event of each kind for a person), written by the first ticket.
      const transfer = { table: 'department_transfers', id: randomUUID() };
      const departure = { table: 'offboarding_cases', id: randomUUID() };
      expect(await copy(pendingTransfer, { ...byFirst, id: transfer.id, employee_id: employees[1] })).toEqual({
        code: null,
        constraint: null,
      });
      expect(await copy(pendingCase, { ...byFirst, id: departure.id, employee_id: employees[2] })).toEqual({
        code: null,
        constraint: null,
      });

      // The guard of a transfer refuses with restrict_violation, the guard of a departure with object_not_in_prerequisite_state.
      for (const row of [
        { ...transfer, code: RESTRICT },
        { ...departure, code: NOT_IN_STATE },
      ]) {
        expect(
          await sqlState(`UPDATE ${row.table} SET recorded_by_ticket_id = $2 WHERE id = $1`, [row.id, second.id]),
        ).toBe(row.code);
      }
    });
  });
});
