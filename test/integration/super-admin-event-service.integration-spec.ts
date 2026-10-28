import { TransactionRunner } from '../../src/infrastructure/database/transaction-runner';
import { AuditService } from '../../src/modules/audit/audit.service';
import { IdentityAccessService } from '../../src/modules/identity-access/identity-access.service';
import { NotificationsService } from '../../src/modules/notifications/notifications.service';
import { OrganizationService } from '../../src/modules/organization/organization.service';
import { LeaveService } from '../../src/modules/personnel/leave/leave.service';
import { NoticeHandlingService } from '../../src/modules/personnel/notice/notice-handling.service';
import { OffboardingChangeService } from '../../src/modules/personnel/offboarding/offboarding-change.service';
import { OffboardingService } from '../../src/modules/personnel/offboarding/offboarding.service';
import { ProfileCorrectionService } from '../../src/modules/personnel/super-admin-event/profile-correction.service';
import { SuperAdminEventRefusedError } from '../../src/modules/personnel/super-admin-event/super-admin-event.errors';
import { SuperAdminEventRepo } from '../../src/modules/personnel/super-admin-event/super-admin-event.repo';
import { SuperAdminEventService } from '../../src/modules/personnel/super-admin-event/super-admin-event.service';
import type {
  ProfileCorrection,
  SuperAdminEventParameters,
  SuperAdminEventResult,
} from '../../src/modules/personnel/super-admin-event/super-admin-event.types';
import { TransferChangeService } from '../../src/modules/personnel/transfer/transfer-change.service';
import { TransferService } from '../../src/modules/personnel/transfer/transfer.service';
import { NoticeHarness } from '../support/notice-harness';
import type { Department } from '../support/request-harness';

const h = new NoticeHarness();
const SUBJECT_CODE = 'E-ADMIN';
const BASIS = { type: 'DECISION', reference: 'QD-31/2026', issuer: 'Board of Directors', issuedOn: '2026-10-20' };

/**
 * `g0-g6-final-business-baseline-remediation`, Task 5.5 (F19, F40, spec L.2): the controlled procedure that records an event whose
 * subject is the Super Admin, in the one transaction of the service the application uses, on a written approval ticket. All ten
 * modes, the repeat of a ticket, a ticket reused with other parameters, the refusals that write nothing, and what the command says.
 */
describe('the controlled procedure for an event about the Super Admin (integration, real PostgreSQL)', () => {
  let des: Department;
  let fin: Department;
  let ticketNumber = 0;

  beforeAll(async () => {
    await h.start();
    des = await h.departmentWithUnit('S-DES');
    fin = await h.departmentWithUnit('S-FIN');
  }, 300000);

  afterAll(async () => {
    await h.stop();
  });

  const service = () => {
    const app = h.ctx.app;

    return new SuperAdminEventService(
      app.get(TransactionRunner, { strict: false }),
      app.get(OrganizationService, { strict: false }),
      app.get(IdentityAccessService, { strict: false }),
      new SuperAdminEventRepo(),
      app.get(TransferService, { strict: false }),
      app.get(TransferChangeService, { strict: false }),
      app.get(LeaveService, { strict: false }),
      app.get(OffboardingService, { strict: false }),
      app.get(OffboardingChangeService, { strict: false }),
      app.get(NoticeHandlingService, { strict: false }),
      new ProfileCorrectionService(
        app.get(OrganizationService, { strict: false }),
        app.get(AuditService, { strict: false }),
        app.get(NotificationsService, { strict: false }),
      ),
    );
  };
  const context = (patch: Record<string, unknown> = {}) => ({
    ticketRef: `R-2026-${String((ticketNumber += 1)).padStart(3, '0')}`,
    approvedBy: 'cto-office',
    operator: 'ops-2',
    environment: 'SHARED' as const,
    subjectCode: SUBJECT_CODE,
    basis: BASIS,
    ...patch,
  });
  const run = (parameters: SuperAdminEventParameters, patch: Record<string, unknown> = {}) =>
    service().run({ context: context(patch), parameters });
  const problemOf = async (work: Promise<unknown>): Promise<string> => {
    try {
      await work;
    } catch (error) {
      if (error instanceof SuperAdminEventRefusedError) return error.problem;
      throw error;
    }

    return 'NOT REFUSED';
  };
  const counts = async () =>
    (
      await h.ctx.sql.query<{ n: string }>(
        `SELECT (SELECT count(*) FROM super_admin_event_tickets) || '/' || (SELECT count(*) FROM department_transfers) || '/'
              || (SELECT count(*) FROM employee_leaves) || '/' || (SELECT count(*) FROM offboarding_cases) || '/'
              || (SELECT count(*) FROM audit_events) AS n`,
      )
    ).rows[0].n;
  const ticketOf = async (ticketRef: string) =>
    (
      await h.ctx.sql.query<{
        id: string;
        mode: string;
        approver_ref: string;
        operator_ref: string;
        environment: string;
      }>(
        `SELECT id, mode::text AS mode, approver_ref, operator_ref, environment FROM super_admin_event_tickets WHERE ticket_ref = $1`,
        [ticketRef],
      )
    ).rows[0];
  const saEmployee = () => h.sa.employeeId;

  describe('a transfer of the Super Admin', () => {
    let first: SuperAdminEventResult;
    let ticketRef: string;
    const params = (): SuperAdminEventParameters => ({
      mode: 'transfer-record',
      toDepartmentId: fin.id,
      effectiveOn: h.day(20),
    });

    it('is recorded in one transaction: the ticket is the "who" of the record and of its Audit Trail event, and the account is not', async () => {
      const ctx = context();
      ticketRef = ctx.ticketRef;
      first = await service().run({ context: ctx, parameters: params() });

      expect(first).toEqual({ ticketRef, mode: 'transfer-record', outcome: 'RECORDED', recordId: first.recordId });
      expect(first.recordId).toMatch(/^[0-9a-f-]{36}$/);
      const ticket = await ticketOf(ticketRef);
      expect(ticket).toMatchObject({
        mode: 'TRANSFER_RECORD',
        approver_ref: 'cto-office',
        operator_ref: 'ops-2',
        environment: 'SHARED',
      });
      const { rows } = await h.ctx.sql.query<{ by_user: string | null; by_ticket: string | null; employee_id: string }>(
        `SELECT recorded_by_app_user_id AS by_user, recorded_by_ticket_id AS by_ticket, employee_id FROM department_transfers WHERE id = $1`,
        [first.recordId],
      );
      expect(rows[0]).toEqual({ by_user: null, by_ticket: ticket.id, employee_id: saEmployee() });
      const events = await h.auditEventsOf('DEPARTMENT_TRANSFER.RECORDED', first.recordId);
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({ actor_kind: 'OPERATOR', actor_app_user_id: null });
      expect(events[0].after).toMatchObject({
        ticket: ticketRef,
        approver: 'cto-office',
        operator: 'ops-2',
        environment: 'SHARED',
      });
      const stored = await h.ctx.sql.query<{ operator_reference: string; correlation_id: string }>(
        `SELECT operator_reference, correlation_id FROM audit_events WHERE action = 'DEPARTMENT_TRANSFER.RECORDED' AND resource_id = $1`,
        [first.recordId],
      );
      expect(stored.rows[0]).toEqual({ operator_reference: ticketRef, correlation_id: ticket.id });
    });

    it('answers only the ticket, the mode, the outcome and the id of the record: no name, email, code, reference or basis', () => {
      const answer = JSON.stringify(first);

      for (const secret of [
        'Admin Person',
        h.sa.email,
        SUBJECT_CODE,
        BASIS.reference,
        BASIS.issuer,
        'cto-office',
        'ops-2',
      ]) {
        expect(answer).not.toContain(secret);
      }
      expect(Object.keys(first).sort()).toEqual(['mode', 'outcome', 'recordId', 'ticketRef']);
    });

    it('run again under the same ticket and parameters writes nothing and answers the same record as a repeat (exit 2)', async () => {
      const before = await counts();

      const again = await service().run({ context: context({ ticketRef }), parameters: params() });

      expect(again).toEqual({ ...first, outcome: 'ALREADY_RECORDED' });
      expect(await counts()).toBe(before);
    });

    it('is refused with TICKET_PARAMETERS_DIFFER when the ticket is used for other parameters, a basis or a person, and writes nothing', async () => {
      const before = await counts();

      expect(
        await problemOf(run({ ...params(), effectiveOn: h.day(21) } as SuperAdminEventParameters, { ticketRef })),
      ).toBe('TICKET_PARAMETERS_DIFFER');
      expect(await problemOf(run(params(), { ticketRef, basis: { ...BASIS, reference: 'QD-32/2026' } }))).toBe(
        'TICKET_PARAMETERS_DIFFER',
      );
      expect(
        await problemOf(run({ mode: 'transfer-cancel', transferId: first.recordId, reason: 'x' }, { ticketRef })),
      ).toBe('TICKET_PARAMETERS_DIFFER');
      expect(await counts()).toBe(before);
    });

    it('is moved and then cancelled under their own tickets, each recorded as the ticket and never as an account', async () => {
      const moved = await run({
        mode: 'transfer-reschedule',
        transferId: first.recordId,
        newEffectiveOn: h.day(25),
        reason: 'The department asked for later',
      });
      const cancelled = await run({ mode: 'transfer-cancel', transferId: first.recordId, reason: 'No longer needed' });

      expect([moved.outcome, cancelled.outcome]).toEqual(['RECORDED', 'RECORDED']);
      const { rows } = await h.ctx.sql.query<{ kind: string; by_user: string | null; by_ticket: string | null }>(
        `SELECT kind::text AS kind, changed_by_app_user_id AS by_user, changed_by_ticket_id AS by_ticket
           FROM department_transfer_changes WHERE transfer_id = $1 ORDER BY changed_at, id`,
        [first.recordId],
      );
      expect(rows.map((row) => row.by_user)).toEqual(rows.map(() => null));
      expect(rows.every((row) => row.by_ticket !== null)).toBe(true);
      const state = await h.ctx.sql.query<{
        status: string;
        cancelled_by_user: string | null;
        cancelled_by_ticket: string | null;
      }>(
        `SELECT status::text AS status, cancelled_by_app_user_id AS cancelled_by_user, cancelled_by_ticket_id AS cancelled_by_ticket
           FROM department_transfers WHERE id = $1`,
        [first.recordId],
      );
      expect(state.rows[0].status).toBe('CANCELLED');
      expect(state.rows[0].cancelled_by_user).toBeNull();
      expect(state.rows[0].cancelled_by_ticket).not.toBeNull();
    });

    it('a transfer of another person cannot be changed under a ticket about the Super Admin (RECORD_NOT_ABOUT_SUBJECT)', async () => {
      const other = await h.veteran(des, 'S-OTHER');
      const theirs = await h.recorded({
        employeeId: other.employeeId,
        toDepartmentId: fin.id,
        effectiveOn: h.day(30),
        grounds: h.grounds,
      });
      const before = await counts();

      expect(await problemOf(run({ mode: 'transfer-cancel', transferId: theirs.id, reason: 'x' }))).toBe(
        'RECORD_NOT_ABOUT_SUBJECT',
      );
      expect(
        await problemOf(
          run({ mode: 'transfer-cancel', transferId: '0191a3b4-0000-7000-8000-000000000009', reason: 'x' }),
        ),
      ).toBe('RECORD_NOT_FOUND');
      expect(await counts()).toBe(before);
    });
  });

  describe('a long leave of the Super Admin', () => {
    it('starts and ends under tickets, the second as the ticket of the change', async () => {
      const started = await run({ mode: 'leave-start', startedOn: h.day(-1), approvedReturnOn: h.day(40) });
      const ended = await run({ mode: 'leave-return', leaveId: started.recordId, returnedOn: h.today() });

      expect([started.outcome, ended.outcome, ended.recordId]).toEqual(['RECORDED', 'RECORDED', started.recordId]);
      const { rows } = await h.ctx.sql.query<{
        started_by_user: string | null;
        started_by_ticket: string | null;
        status: string;
      }>(
        `SELECT started_by_app_user_id AS started_by_user, started_by_ticket_id AS started_by_ticket, status::text AS status
           FROM employee_leaves WHERE id = $1`,
        [started.recordId],
      );
      expect(rows[0]).toMatchObject({ started_by_user: null, status: 'ENDED' });
      expect(rows[0].started_by_ticket).not.toBeNull();
    });
  });

  describe('what is refused before anything is written', () => {
    const transfer = (): SuperAdminEventParameters => ({
      mode: 'transfer-record',
      toDepartmentId: fin.id,
      effectiveOn: h.day(20),
    });

    it.each<[string, Record<string, unknown>, string]>([
      ['the operator is the person the event is about', { operator: SUBJECT_CODE }, 'OPERATOR_IS_SUBJECT'],
      ['the approver is the person by employee code', { approvedBy: SUBJECT_CODE }, 'APPROVER_IS_SUBJECT'],
      ['the ticket is not a reference', { ticketRef: 'x' }, 'TICKET_REFERENCE_INVALID'],
      ['the basis lacks its issuer', { basis: { ...BASIS, issuer: '' } }, 'BASIS_INVALID'],
      ['one person approves and runs it in SHARED', { approvedBy: 'ops-2', operator: 'OPS-2' }, 'APPROVER_IS_OPERATOR'],
      ['the person does not exist', { subjectCode: 'NOBODY' }, 'SUBJECT_NOT_FOUND'],
    ])('%s', async (_name, patch, expected) => {
      const before = await counts();

      const problem = await problemOf(run(transfer(), patch));

      expect(problem).toBe(expected);
      expect(await counts()).toBe(before);
    });

    it('refuses the approver or the operator who is the person by login email, in either case', async () => {
      const before = await counts();

      expect(await problemOf(run(transfer(), { approvedBy: h.sa.email.toUpperCase() }))).toBe('APPROVER_IS_SUBJECT');
      expect(await problemOf(run(transfer(), { operator: ` ${h.sa.email} ` }))).toBe('OPERATOR_IS_SUBJECT');
      expect(await counts()).toBe(before);
    });

    it('refuses a person who does not hold the Super Admin role: the procedure is for the Super Admin alone', async () => {
      const worker = await h.veteran(des, 'S-WORKER');
      const code = (
        await h.ctx.sql.query<{ employee_code: string }>(`SELECT employee_code FROM employees WHERE id = $1`, [
          worker.employeeId,
        ])
      ).rows[0].employee_code;
      const before = await counts();

      expect(await problemOf(run(transfer(), { subjectCode: code }))).toBe('SUBJECT_NOT_SUPER_ADMIN');
      expect(await counts()).toBe(before);
    });

    it('refuses a notice about another person and an unknown notice (NOTICE_NOT_ABOUT_SUBJECT) before it writes; a notice of the wrong kind is in super-admin-event-from-notice', async () => {
      const head = await h.head(des, 'S-HEAD');
      const someone = await h.worker(des, 'S-SOMEONE');
      const notice = await h.sentNotice(
        { employeeId: someone.employeeId, kind: 'DEPARTURE', proposedOn: h.day(5) },
        head.account,
      );
      const before = await counts();
      const source = (noticeId: string) => ({ noticeId, verificationMethod: 'ATTACHED_DOCUMENT' as const });

      expect(
        await problemOf(run({ mode: 'departure-record', lastWorkingDay: h.day(12), fromNotice: source(notice.id) })),
      ).toBe('NOTICE_NOT_ABOUT_SUBJECT');
      expect(
        await problemOf(
          run({
            mode: 'departure-record',
            lastWorkingDay: h.day(12),
            fromNotice: source('0191a3b4-0000-7000-8000-000000000009'),
          }),
        ),
      ).toBe('NOTICE_NOT_ABOUT_SUBJECT');
      expect(await counts()).toBe(before);
      expect((await h.noticeRows(someone.employeeId))[0].status).toBe('PENDING');
    });

    it('a refusal of the event itself comes back with the code of the event and writes no ticket', async () => {
      const before = await counts();

      const problem = await problemOf(run({ mode: 'transfer-record', toDepartmentId: fin.id, effectiveOn: h.day(-3) }));

      expect(problem).toMatch(/^DEPARTMENT_TRANSFER\./);
      expect(await counts()).toBe(before);
    });
  });

  describe('the handover duties of a Super Admin who holds a personal seat (spec L.2, Audit Trail)', () => {
    it('audits every HANDOVER_DUTY event of the departure as OPERATOR with no account and the ticket as the reference; the stand-in account only fills the NOT NULL column', async () => {
      const subscription = await h.subscription(40, 'K2');
      const seat = await h.seatOf(
        { employeeId: saEmployee(), account: h.sa },
        { subscriptionId: subscription },
        SUBJECT_CODE,
      );
      const refs: string[] = [];
      const ticketed = async (parameters: SuperAdminEventParameters) => {
        const ctx = context();
        refs.push(ctx.ticketRef);

        return service().run({ context: ctx, parameters });
      };

      const recorded = await ticketed({ mode: 'departure-record', lastWorkingDay: h.day(12) });
      await ticketed({
        mode: 'departure-change',
        caseId: recorded.recordId,
        lastWorkingDay: h.day(18),
        reason: 'The handover takes longer',
      });
      await ticketed({ mode: 'departure-cancel', caseId: recorded.recordId, reason: 'The person stays' });

      const duties = await h.dutyRows(seat);
      expect(duties).toHaveLength(1);
      expect(duties[0].cancelled_at).not.toBeNull();
      const { rows } = await h.ctx.sql.query<{
        action: string;
        actor_kind: string;
        actor_app_user_id: string | null;
        actor_roles: string[];
        operator_reference: string | null;
        correlation_id: string;
        after: Record<string, unknown> | null;
      }>(
        `SELECT action, actor_kind::text AS actor_kind, actor_app_user_id, actor_roles, operator_reference, correlation_id, after
           FROM audit_events WHERE resource_type = 'HandoverDuty' AND resource_id = $1 ORDER BY occurred_at, id`,
        [duties[0].id],
      );
      expect(rows.map((row) => row.action)).toEqual([
        'HANDOVER_DUTY.OPENED',
        'HANDOVER_DUTY.DUE_CHANGED',
        'HANDOVER_DUTY.CANCELLED',
      ]);
      for (const [index, row] of rows.entries()) {
        expect(row).toMatchObject({ actor_kind: 'OPERATOR', actor_app_user_id: null, actor_roles: [] });
        expect(row.operator_reference).toBe(refs[index]);
        expect(row.after).toMatchObject({
          ticket: refs[index],
          mode: ['departure-record', 'departure-change', 'departure-cancel'][index],
        });
        expect((await ticketOf(refs[index])).id).toBe(row.correlation_id);
      }
      const events = await h.ctx.sql.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM audit_events
          WHERE action LIKE 'HANDOVER_DUTY.%' AND resource_id = $1 AND (actor_kind <> 'OPERATOR' OR actor_app_user_id IS NOT NULL)`,
        [duties[0].id],
      );
      expect(events.rows[0].n).toBe('0');
      // The column the database still demands is filled with the account of the Super Admin the procedure serves, and says nothing else.
      expect(
        (
          await h.ctx.sql.query<{ created_by_app_user_id: string }>(
            `SELECT created_by_app_user_id FROM handover_duties WHERE id = $1`,
            [duties[0].id],
          )
        ).rows[0].created_by_app_user_id,
      ).toBe(h.sa.appUserId);
    });
  });

  describe('a departure of the Super Admin', () => {
    it('is recorded, moved and cancelled under tickets; the account is never the "who"', async () => {
      const recorded = await run({ mode: 'departure-record', lastWorkingDay: h.day(12) });
      const moved = await run({
        mode: 'departure-change',
        caseId: recorded.recordId,
        lastWorkingDay: h.day(18),
        reason: 'The handover takes longer',
      });
      const cancelled = await run({ mode: 'departure-cancel', caseId: recorded.recordId, reason: 'The person stays' });

      expect([recorded.outcome, moved.outcome, cancelled.outcome]).toEqual(['RECORDED', 'RECORDED', 'RECORDED']);
      const { rows } = await h.ctx.sql.query<{
        by_user: string | null;
        by_ticket: string | null;
        cancelled_by_user: string | null;
        state: string;
      }>(
        `SELECT recorded_by_app_user_id AS by_user, recorded_by_ticket_id AS by_ticket,
                cancelled_by_app_user_id AS cancelled_by_user, state::text AS state
           FROM offboarding_cases WHERE id = $1`,
        [recorded.recordId],
      );
      expect(rows[0]).toMatchObject({ by_user: null, cancelled_by_user: null, state: 'CANCELLED' });
      expect(rows[0].by_ticket).not.toBeNull();
    });

    it('an abrupt departure already over is recorded the same way, as the last write about the person', async () => {
      const abrupt = await run({ mode: 'abrupt-departure-record', lastWorkingDay: h.day(-2) });

      expect(abrupt.outcome).toBe('RECORDED');
      const { rows } = await h.ctx.sql.query<{ by_user: string | null; by_ticket: string | null; abrupt: boolean }>(
        `SELECT recorded_by_app_user_id AS by_user, recorded_by_ticket_id AS by_ticket, abrupt FROM offboarding_cases WHERE id = $1`,
        [abrupt.recordId],
      );
      expect(rows[0]).toMatchObject({ by_user: null, abrupt: true });
      expect(rows[0].by_ticket).not.toBeNull();
    });
  });

  describe('the correction of the record of the Super Admin (profile-correct)', () => {
    const recordOf = async () =>
      (
        await h.ctx.sql.query<{
          full_name: string;
          work_email: string | null;
          job_title: string | null;
          employment_type: string;
          hire_date: string;
          department_id: string;
        }>(
          `SELECT e.full_name, e.work_email, e.job_title, e.employment_type::text AS employment_type,
                  to_char(e.hire_date, 'YYYY-MM-DD') AS hire_date,
                  (SELECT department_id FROM employee_placements p WHERE p.employee_id = e.id ORDER BY valid_from DESC LIMIT 1) AS department_id
             FROM employees e WHERE e.id = $1`,
          [saEmployee()],
        )
      ).rows[0];
    const writes = async () =>
      (
        await h.ctx.sql.query<{ n: string }>(
          `SELECT (SELECT count(*) FROM super_admin_event_tickets) || '/' || (SELECT count(*) FROM audit_events) || '/'
                || (SELECT count(*) FROM in_app_notifications) AS n`,
        )
      ).rows[0].n;
    const correct = (fields: Omit<ProfileCorrection, 'mode'>, patch: Record<string, unknown> = {}) =>
      run({ mode: 'profile-correct', ...fields }, patch);
    const NEW_NAME = 'Admin Person Corrected';
    const NEW_TITLE = 'Chief of administration';
    let ticketRef: string;
    let first: SuperAdminEventResult;

    it('corrects the official fields under a ticket: the record, the Audit Trail with actor OPERATOR and the ticket, the notice, in one run', async () => {
      const was = await recordOf();
      const ctx = context();
      ticketRef = ctx.ticketRef;

      first = await service().run({
        context: ctx,
        parameters: { mode: 'profile-correct', fullName: NEW_NAME, jobTitle: NEW_TITLE },
      });

      expect(first).toEqual({ ticketRef, mode: 'profile-correct', outcome: 'RECORDED', recordId: saEmployee() });
      expect(await recordOf()).toMatchObject({
        full_name: NEW_NAME,
        job_title: NEW_TITLE,
        work_email: was.work_email,
        employment_type: was.employment_type,
        hire_date: was.hire_date,
        department_id: was.department_id,
      });
      const ticket = await ticketOf(ticketRef);
      expect(ticket).toMatchObject({ mode: 'PROFILE_CORRECT', approver_ref: 'cto-office', operator_ref: 'ops-2' });
      const events = await h.auditEventsOf('EMPLOYEE.OFFICIAL_FIELDS_CHANGED', saEmployee());
      const mine = events[events.length - 1];
      expect(mine).toMatchObject({ actor_kind: 'OPERATOR', actor_app_user_id: null });
      expect(mine.before).toEqual({ employeeCode: SUBJECT_CODE, fullName: was.full_name, jobTitle: was.job_title });
      expect(mine.after).toMatchObject({
        fullName: NEW_NAME,
        jobTitle: NEW_TITLE,
        hrBasis: BASIS,
        ticket: ticketRef,
        approver: 'cto-office',
        operator: 'ops-2',
        environment: 'SHARED',
        mode: 'profile-correct',
      });
      const stored = await h.ctx.sql.query<{ operator_reference: string; correlation_id: string }>(
        `SELECT operator_reference, correlation_id FROM audit_events
          WHERE action = 'EMPLOYEE.OFFICIAL_FIELDS_CHANGED' AND resource_id = $1 ORDER BY occurred_at DESC, id DESC LIMIT 1`,
        [saEmployee()],
      );
      expect(stored.rows[0]).toEqual({ operator_reference: ticketRef, correlation_id: ticket.id });
    });

    it('tells the person and the head of their department EMPLOYEE_PROFILE_UPDATED in the same transaction, with ids only', async () => {
      const { rows } = await h.ctx.sql.query<{
        recipient_employee_id: string;
        subject_id: string;
        params: Record<string, unknown>;
      }>(
        `SELECT recipient_employee_id, subject_id, params FROM in_app_notifications
          WHERE code = 'EMPLOYEE_PROFILE_UPDATED' AND subject_id = $1`,
        [saEmployee()],
      );

      expect(rows.map((row) => row.recipient_employee_id)).toContain(saEmployee());
      for (const row of rows) {
        expect(Object.keys(row.params).sort()).toEqual(['departmentId', 'employeeId']);
        expect(JSON.stringify(row.params)).not.toContain(NEW_NAME);
      }
    });

    it('answers only the ticket, the mode, the outcome and the id: not the new name, the title or the work email', () => {
      const answer = JSON.stringify(first);

      for (const secret of [NEW_NAME, NEW_TITLE, h.sa.email, SUBJECT_CODE]) expect(answer).not.toContain(secret);
    });

    it('run again with the same ticket and parameters writes nothing and answers ALREADY_RECORDED with the same record', async () => {
      const before = await writes();

      const again = await service().run({
        context: context({ ticketRef }),
        parameters: { mode: 'profile-correct', fullName: NEW_NAME, jobTitle: NEW_TITLE },
      });

      expect(again).toEqual({ ...first, outcome: 'ALREADY_RECORDED' });
      expect(await writes()).toBe(before);
    });

    it('is refused with TICKET_PARAMETERS_DIFFER when the ticket is used for other fields, another mode or another basis', async () => {
      const before = await writes();

      expect(await problemOf(correct({ fullName: NEW_NAME, jobTitle: 'Another title' }, { ticketRef }))).toBe(
        'TICKET_PARAMETERS_DIFFER',
      );
      expect(
        await problemOf(
          correct(
            { fullName: NEW_NAME, jobTitle: NEW_TITLE },
            { ticketRef, basis: { ...BASIS, reference: 'QD-99/2026' } },
          ),
        ),
      ).toBe('TICKET_PARAMETERS_DIFFER');
      expect(
        await problemOf(run({ mode: 'leave-start', startedOn: h.day(-1), approvedReturnOn: h.day(40) }, { ticketRef })),
      ).toBe('TICKET_PARAMETERS_DIFFER');
      expect(await writes()).toBe(before);
    });

    it('clears the job title with null and corrects the work email, the Audit Trail keeping what it was', async () => {
      const wasEmail = (await recordOf()).work_email;

      const cleared = await correct({ jobTitle: null, workEmail: 'corrected.admin@acme.vn' });

      expect(cleared.outcome).toBe('RECORDED');
      expect(await recordOf()).toMatchObject({ job_title: null, work_email: 'corrected.admin@acme.vn' });
      const events = await h.auditEventsOf('EMPLOYEE.OFFICIAL_FIELDS_CHANGED', saEmployee());
      expect(events[events.length - 1].before).toMatchObject({ jobTitle: NEW_TITLE, workEmail: wasEmail });
    });

    it.each<[string, Omit<ProfileCorrection, 'mode'>, string]>([
      ['a hire date that has already come (locked)', { hireDate: h.day(5) }, 'PROFILE.HIRE_DATE_LOCKED'],
      ['a job title over 255 characters', { jobTitle: 'x'.repeat(256) }, 'PROFILE.JOB_TITLE_TOO_LONG'],
      ['nothing that differs from the record', { fullName: NEW_NAME }, 'PROFILE.NO_CHANGE'],
    ])(
      'refuses %s and writes nothing: no ticket, no Audit Trail event, no notice, no change of the record',
      async (_name, fields, expected) => {
        const before = await writes();
        const record = await recordOf();

        expect(await problemOf(correct(fields))).toBe(expected);

        expect(await writes()).toBe(before);
        expect(await recordOf()).toEqual(record);
      },
    );

    it('refuses a work email somebody else already has, however it is typed, and writes nothing', async () => {
      const other = await h.worker(des, 'S-TAKEN');
      await h.ctx.sql.query(`UPDATE employees SET work_email = 'taken@acme.vn' WHERE id = $1`, [other.employeeId]);
      const before = await writes();

      expect(await problemOf(correct({ workEmail: ' Taken@ACME.vn ' }))).toBe('PROFILE.WORK_EMAIL_TAKEN');

      expect(await writes()).toBe(before);
    });

    it('is for the Super Admin alone: the record of anybody else is refused with SUBJECT_NOT_SUPER_ADMIN and not touched', async () => {
      const worker = await h.veteran(des, 'S-NOTSA');
      const code = (
        await h.ctx.sql.query<{ employee_code: string }>(`SELECT employee_code FROM employees WHERE id = $1`, [
          worker.employeeId,
        ])
      ).rows[0].employee_code;
      const before = await writes();

      expect(await problemOf(correct({ fullName: 'Somebody Else' }, { subjectCode: code }))).toBe(
        'SUBJECT_NOT_SUPER_ADMIN',
      );

      expect(await writes()).toBe(before);
      expect(
        (
          await h.ctx.sql.query<{ full_name: string }>(`SELECT full_name FROM employees WHERE id = $1`, [
            worker.employeeId,
          ])
        ).rows[0].full_name,
      ).not.toBe('Somebody Else');
    });

    it('applies the split of persons to this mode too: the operator is never the person whose record is corrected', async () => {
      const before = await writes();

      expect(await problemOf(correct({ fullName: 'Admin Person Again' }, { operator: h.sa.email }))).toBe(
        'OPERATOR_IS_SUBJECT',
      );

      expect(await writes()).toBe(before);
    });
  });
});
