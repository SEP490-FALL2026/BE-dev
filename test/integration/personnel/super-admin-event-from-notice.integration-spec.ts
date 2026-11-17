import { SuperAdminEventRefusedError } from '../../../src/modules/personnel/public/super-admin-event.errors';
import type {
  SuperAdminEventParameters,
  SuperAdminEventResult,
} from '../../../src/modules/personnel/public/super-admin-event.types';
import { NoticeHarness, type NoticeWire } from '../../support/notice-harness';
import type { Department, Person } from '../../support/request-harness';

import { superAdminEventService } from '../../support/super-admin-event-runner';
const h = new NoticeHarness();
const SUBJECT_CODE = 'E-ADMIN';
const BASIS = { type: 'DECISION', reference: 'QD-41/2026', issuer: 'Board of Directors', issuedOn: '2026-10-20' };
const CHECK = { verificationMethod: 'ATTACHED_DOCUMENT' as const };

/**
 * `g0-g6-final-business-baseline-remediation`, Task 5.5 (F19, T-7, spec L.2): the four recording modes of the controlled procedure that
 * accept `--from-notice`. A notice of a head about the Super Admin is recorded as the event it announces, on the ticket: the notice
 * becomes `RECORDED`, handled by the ticket and not by an account; the record of how it was checked (T-7) is written, verified by the
 * ticket, and only for a notice; an event written without one writes no such record. The world is its own because the last mode leaves
 * the Super Admin `LEFT`.
 */
describe('the controlled procedure records the event a notice of a head announces about the Super Admin (integration, real PostgreSQL)', () => {
  let fin: Department;
  let head: Person;
  let ticketNumber = 0;
  let notices: Record<'transfer' | 'leave' | 'departure' | 'abrupt', NoticeWire>;

  beforeAll(async () => {
    await h.start();
    fin = await h.departmentWithUnit('FN-FIN');
    const home = (
      await h.ctx.sql.query<{ code: string }>(`SELECT code FROM departments WHERE id = $1`, [h.seed.departmentId])
    ).rows[0];
    head = await h.head({ id: h.seed.departmentId, code: home.code, unitId: '' }, 'FN-HEAD');
    const send = (kind: string, extra: object = {}) =>
      h.sentNotice({ employeeId: h.sa.employeeId, kind, proposedOn: h.day(5), ...extra }, head.account);
    notices = {
      transfer: await send('DEPARTMENT_TRANSFER_OUT', { targetDepartmentId: fin.id }),
      leave: await send('LONG_LEAVE'),
      departure: await send('DEPARTURE'),
      abrupt: await send('ABRUPT_DEPARTURE'),
    };
  }, 300000);

  afterAll(async () => {
    await h.stop();
  });

  const service = () => superAdminEventService(h.ctx.app);
  const ticket = () => `F-2026-${String((ticketNumber += 1)).padStart(3, '0')}`;
  const run = (parameters: SuperAdminEventParameters, ticketRef = ticket()) =>
    service().run({
      context: {
        ticketRef,
        approvedBy: 'cto-office',
        operator: 'ops-2',
        environment: 'SHARED' as const,
        subjectCode: SUBJECT_CODE,
        basis: BASIS,
      },
      parameters,
    });
  const problemOf = async (work: Promise<unknown>): Promise<string> => {
    try {
      await work;
    } catch (error) {
      if (error instanceof SuperAdminEventRefusedError) return error.problem;
      throw error;
    }

    return 'NOT REFUSED';
  };
  const noticeRow = async (id: string) =>
    (
      await h.ctx.sql.query<{
        status: string;
        handled_by_app_user_id: string | null;
        handled_by_ticket_id: string | null;
        recorded_event_kind: string | null;
        recorded_event_id: string | null;
      }>(
        `SELECT status::text AS status, handled_by_app_user_id, handled_by_ticket_id, recorded_event_kind::text AS recorded_event_kind,
                recorded_event_id
           FROM personnel_notices WHERE id = $1`,
        [id],
      )
    ).rows[0];
  const verificationsOf = async (id: string) =>
    (
      await h.ctx.sql.query<{
        method: string;
        reference: string;
        verified_by_app_user_id: string | null;
        verified_by_ticket_id: string | null;
      }>(
        `SELECT method::text AS method, reference, verified_by_app_user_id, verified_by_ticket_id
           FROM personnel_notice_verifications WHERE notice_id = $1`,
        [id],
      )
    ).rows;
  const verificationCount = async () =>
    Number(
      (await h.ctx.sql.query<{ n: string }>(`SELECT count(*)::text AS n FROM personnel_notice_verifications`)).rows[0]
        .n,
    );
  const ticketId = async (ticketRef: string) =>
    (
      await h.ctx.sql.query<{ id: string }>(`SELECT id FROM super_admin_event_tickets WHERE ticket_ref = $1`, [
        ticketRef,
      ])
    ).rows[0].id;

  /** What every recording from a notice leaves: the notice recorded by the ticket, how it was checked by the ticket, and the event of the notice. */
  const expectRecordedFromNotice = async (
    notice: NoticeWire,
    result: SuperAdminEventResult,
    event: { kind: 'DEPARTMENT_TRANSFER' | 'LONG_LEAVE' | 'OFFBOARDING_CASE'; origin: string },
  ) => {
    const ticketRef = result.ticketRef;
    const ticketRow = await ticketId(ticketRef);

    expect(result.outcome).toBe('RECORDED');
    expect(await noticeRow(notice.id)).toEqual({
      status: 'RECORDED',
      handled_by_app_user_id: null,
      handled_by_ticket_id: ticketRow,
      recorded_event_kind: event.kind,
      recorded_event_id: result.recordId,
    });
    expect(await verificationsOf(notice.id)).toEqual([
      {
        method: 'ATTACHED_DOCUMENT',
        reference: BASIS.reference,
        verified_by_app_user_id: null,
        verified_by_ticket_id: ticketRow,
      },
    ]);
    expect(await h.eventsOfNotice(notice.id)).toEqual([`${event.origin}:${result.recordId}`]);
    const audit = await h.ctx.sql.query<{
      actor_kind: string;
      actor_app_user_id: string | null;
      operator_reference: string;
    }>(
      `SELECT actor_kind::text AS actor_kind, actor_app_user_id, operator_reference FROM audit_events
        WHERE action = 'PERSONNEL_NOTICE.RECORDED' AND resource_id = $1`,
      [notice.id],
    );
    expect(audit.rows).toEqual([{ actor_kind: 'OPERATOR', actor_app_user_id: null, operator_reference: ticketRef }]);
  };

  it('refuses a notice of a kind the mode does not record (NOTICE_KIND_MISMATCH) and writes nothing: no ticket, no event, the notice keeps waiting', async () => {
    const before = await verificationCount();
    const attempts: Array<[SuperAdminEventParameters, NoticeWire]> = [
      [
        {
          mode: 'abrupt-departure-record',
          lastWorkingDay: h.day(-1),
          fromNotice: { noticeId: notices.departure.id, ...CHECK },
        },
        notices.departure,
      ],
      [
        { mode: 'departure-record', lastWorkingDay: h.day(12), fromNotice: { noticeId: notices.abrupt.id, ...CHECK } },
        notices.abrupt,
      ],
      [
        {
          mode: 'leave-start',
          startedOn: h.day(-1),
          approvedReturnOn: h.day(40),
          fromNotice: { noticeId: notices.transfer.id, ...CHECK },
        },
        notices.transfer,
      ],
      [
        {
          mode: 'transfer-record',
          toDepartmentId: fin.id,
          effectiveOn: h.day(20),
          fromNotice: { noticeId: notices.leave.id, ...CHECK },
        },
        notices.leave,
      ],
    ];

    for (const [parameters, notice] of attempts) {
      expect(await problemOf(run(parameters))).toBe('NOTICE_KIND_MISMATCH');
      expect((await noticeRow(notice.id)).status).toBe('PENDING_VERIFICATION');
    }

    expect(await verificationCount()).toBe(before);
    expect(
      Number(
        (await h.ctx.sql.query<{ n: string }>(`SELECT count(*)::text AS n FROM super_admin_event_tickets`)).rows[0].n,
      ),
    ).toBe(0);
    expect(await h.eventCounts(h.sa.employeeId)).toEqual({ transfers: 0, leaves: 0, cases: 0 });
  });

  it('transfer-record from a transfer notice: the notice is recorded by the ticket, how it was checked is written by the ticket, and the transfer carries the notice', async () => {
    const result = await run({
      mode: 'transfer-record',
      toDepartmentId: fin.id,
      effectiveOn: h.day(20),
      fromNotice: { noticeId: notices.transfer.id, ...CHECK },
    });

    await expectRecordedFromNotice(notices.transfer, result, { kind: 'DEPARTMENT_TRANSFER', origin: 'transfer' });
    // The same event written without a notice writes no record of a check: it exists only for what comes from a notice (T-7).
    const verifications = await verificationCount();
    await run({ mode: 'transfer-cancel', transferId: result.recordId, reason: 'No longer needed' });
    expect(await verificationCount()).toBe(verifications);
  });

  it('leave-start from a long leave notice, the same way; the leave carries the notice', async () => {
    const result = await run({
      mode: 'leave-start',
      startedOn: h.day(-1),
      approvedReturnOn: h.day(40),
      fromNotice: { noticeId: notices.leave.id, ...CHECK },
    });

    await expectRecordedFromNotice(notices.leave, result, { kind: 'LONG_LEAVE', origin: 'leave' });
    const verifications = await verificationCount();
    await run({ mode: 'leave-return', leaveId: result.recordId, returnedOn: h.today() });
    expect(await verificationCount()).toBe(verifications);
  });

  it('departure-record from a departure notice, the same way; the case carries the notice', async () => {
    const result = await run({
      mode: 'departure-record',
      lastWorkingDay: h.day(12),
      fromNotice: { noticeId: notices.departure.id, ...CHECK },
    });

    await expectRecordedFromNotice(notices.departure, result, { kind: 'OFFBOARDING_CASE', origin: 'case' });
    const verifications = await verificationCount();
    await run({ mode: 'departure-cancel', caseId: result.recordId, reason: 'The person stays' });
    expect(await verificationCount()).toBe(verifications);
  });

  it('abrupt-departure-record from a sudden departure notice, the same way; the person is LEFT at once and the case carries the notice', async () => {
    const result = await run({
      mode: 'abrupt-departure-record',
      lastWorkingDay: h.today(),
      fromNotice: { noticeId: notices.abrupt.id, ...CHECK },
    });

    await expectRecordedFromNotice(notices.abrupt, result, { kind: 'OFFBOARDING_CASE', origin: 'case' });
    expect(await h.workState(h.sa.employeeId)).toBe('TERMINATED/LEFT');
  });
});
