import { RenewalHoldHook } from '../../../src/modules/licensing/public/licensing.extension-points';
import { monthsBetween } from '../../../src/modules/requests/renewal-request/renewal-request.policy';
import { ExpiryHarness } from '../../support/expiry-harness';
import { pretendBusinessToday } from '../../support/pretend-today';
import type { Unit } from '../../support/spend-harness';

const h = new ExpiryHarness();
const M = 1_000_000;
const REASON = 'The work goes on';

/**
 * T-RQ3, whole: a `K1` plan of 1.000.000 d a month granted on 05/08/2026 for 3 months ends on 04/11/2026 (`QĐ-111l`, R-13, R-27). Reminded on
 * 28/10; a renewal sent on 04/10 is refused (the window opens on 05/10), on 05/10 it is taken; approved on 01/11 for 3 months more the right
 * ends on 04/02/2027, is reminded from 28/01/2027 and no revocation is opened; not approved, the system opens exactly one task made by the
 * system on 05/11. The days are the days of the organization, said to the application by `pretendBusinessToday`, so the numbers are the numbers
 * of the spec whatever day the suite runs.
 */
describe('the end of the time of use and the renewal of the right (T-RQ3, integration, real PostgreSQL)', () => {
  let k1: { subscriptionId: string; planId: string };
  let k2: { subscriptionId: string; planId: string };
  let seq = 0;

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    const subscriptionOf = async (kind: 'K1' | 'K2') => {
      const subscriptionId = await h.subscription(60, kind);

      return { subscriptionId, planId: await h.planOf(subscriptionId) };
    };
    k1 = await subscriptionOf('K1');
    k2 = await subscriptionOf('K2');
  }, 300000);

  afterAll(async () => {
    await h.stop();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  /** Says what day it is for the organization: every read of the day, the passes and the routes included, sees it. */
  const on = (day: string) => pretendBusinessToday(h.ctx.app, day);

  /**
   * A department with a head and an IT Admin in charge, a budget of 2026 and a member who was granted the plan on 05/08/2026 for 3 months. The
   * people joined, and the head took the department, long before these days: the department of a person is read as of the day the case says.
   */
  const holder = async (target: { subscriptionId: string; planId: string }, end = '2026-11-04') => {
    seq += 1;
    // The department and its budget are written on the real day; the days of the case are said to the application after that.
    jest.restoreAllMocks();
    const unit = await h.departmentWithHead(`P-TR${seq}`);
    await h.setItAdminInCharge(unit.department, { employeeId: h.it1.employeeId, account: h.it1 });
    const people = [unit.member.employeeId, unit.head.employeeId];
    await h.ctx.sql.query(`UPDATE employees SET hire_date = '2020-01-01' WHERE id = ANY($1::uuid[])`, [people]);
    await h.ctx.sql.query(
      `UPDATE employee_placements SET valid_from = '2020-01-01' WHERE employee_id = ANY($1::uuid[])`,
      [people],
    );
    await h.ctx.sql.query(`UPDATE department_head_periods SET valid_from = '2020-01-01' WHERE department_id = $1`, [
      unit.department.id,
    ]);
    await h.budgetFor(unit, { total: 100 * M, year: 2026 });
    on('2026-08-10');
    const assignmentId = await h.seatOf(unit.member, target, { grantedOn: '2026-08-05', expectedEndDate: end });

    return { unit, assignmentId };
  };
  const months = (assignmentId: string, extensionMonths: number) => ({
    assignmentId,
    extensionMonths,
    businessReason: REASON,
  });
  const tasksOf = async (assignmentId: string) =>
    (
      await h.ctx.sql.query<{ id: string; status: string; source: string; created_by_system: boolean }>(
        `SELECT id, status::text, revocation_source::text AS source, created_by_system
           FROM provisioning_tasks WHERE assignment_id = $1 AND kind = 'REVOKE' ORDER BY created_at, id`,
        [assignmentId],
      )
    ).rows;
  const extensionTaskOf = async (requestId: string) =>
    (
      await h.ctx.sql.query<{ id: string }>(
        `SELECT id FROM provisioning_tasks WHERE request_id = $1 AND kind = 'EXTEND' AND status = 'QUEUED'`,
        [requestId],
      )
    ).rows[0];
  const approvedAndPaid = async (requestId: string, unit: Unit) => {
    await h.decide(requestId, { decision: 'APPROVE' }, unit.head.account).expect(200);
    await h.sendOn([requestId], unit.head.account).expect(201);
    await h.decideSpend(requestId, { decision: 'APPROVE' }, h.boss.account).expect(200);
  };
  const requestRow = async (requestId: string) =>
    (
      await h.ctx.sql.query<{
        amount_minor: string | null;
        next_year_amount_minor: string | null;
        term_months: number | null;
        expected_end_date: string | null;
        budget_year: number | null;
      }>(
        `SELECT amount_minor::text, next_year_amount_minor::text, term_months,
                to_char(expected_end_date, 'YYYY-MM-DD') AS expected_end_date, budget_year
           FROM access_requests WHERE id = $1`,
        [requestId],
      )
    ).rows[0];

  it('ends on 04/11, is reminded on 28/10, takes a renewal from 05/10 and not on 04/10, and after the approval of 01/11 ends on 04/02/2027 with no revocation', async () => {
    const { unit, assignmentId } = await holder(k1);
    expect(await h.seatRow(assignmentId)).toMatchObject({ valid_from: '2026-08-05', expected_end_date: '2026-11-04' });

    on('2026-10-28');
    await h.noticeDue();
    expect((await h.reminderRows(assignmentId)).map((row) => [row.audience, row.expected_end_date])).toEqual([
      ['EMPLOYEE', '2026-11-04'],
      ['HEAD', '2026-11-04'],
      ['IT_ADMIN', '2026-11-04'],
    ]);

    // The window opens 30 days before the end: 05/10. A day earlier the renewal is refused with the day it opens, and nothing is written.
    const before = await h.requestRows();
    on('2026-10-04');
    const refused = await h.renew(months(assignmentId, 3), unit.member.account).expect(422);
    expect(h.codeOf(refused)).toBe('RENEWAL_REQUEST.WINDOW_NOT_OPEN');
    expect(h.detailsOf(refused)).toEqual({ opensOn: '2026-10-05', windowDays: 30 });
    expect(await h.requestRows()).toBe(before);

    on('2026-10-05');
    const { outcome, request } = await h.renewed(unit.member.account, months(assignmentId, 3));
    expect(outcome).toBe('RENEWAL_REQUESTED');
    expect(request).toMatchObject({
      type: 'RENEWAL',
      termMonths: 3,
      // 3 months from the day after the end: 05/11/2026 to 04/02/2027.
      expectedEndDate: '2027-02-04',
      renewal: {
        assignmentId,
        previousExpectedEndDate: '2026-11-04',
        newExpectedEndDate: '2027-02-04',
        consecutiveMonths: monthsBetween('2026-08-05', '2027-02-04'),
        applied: null,
      },
    });
    // 05/11 and 05/12 begin in 2026, 05/01 in 2027 (R-39).
    expect(request.pricing).toMatchObject({ months: 2, nextYearAmount: { amount: String(M) } });

    // Approved on 01/11, three days before the end: the spend is held for the months of 2026 and the part of 2027 is kept (R-46).
    on('2026-11-01');
    await approvedAndPaid(request.id, unit);
    expect(await h.state(request.id)).toBe('AWAITING_EXECUTION');
    expect(await requestRow(request.id)).toMatchObject({
      amount_minor: String(2 * M),
      next_year_amount_minor: String(M),
      term_months: 3,
      expected_end_date: '2027-02-04',
      budget_year: 2026,
    });
    // Approved and not extended yet: the right is held, and the reminder of the old end is not owed.
    expect(await h.seatRow(assignmentId)).toMatchObject({ valid_until: null, expected_end_date: '2026-11-04' });

    const task = await extensionTaskOf(request.id);
    const claimed = await h.claim(task.id).expect(200);
    // The extension of a K1 seat has no checklist: the one of K1 belongs to the grant and the revocation of a seat (QĐ-111az, K1-GR).
    expect(h.dataOf<{ task: { kind: string; k1Checklist: unknown } }>(claimed).task).toMatchObject({
      kind: 'EXTEND',
      k1Checklist: null,
    });
    await h.complete(task.id, { evidence: 'Extended with the vendor until 04/02/2027' }).expect(200);

    expect(await h.state(request.id)).toBe('COMPLETED');
    expect(await h.seatRow(assignmentId)).toMatchObject({ valid_until: '2026-11-04', expected_end_date: '2026-11-04' });
    const [next] = await h.successorsOf(assignmentId);
    expect(next).toMatchObject({
      predecessor_id: assignmentId,
      valid_from: '2026-11-04',
      valid_until: null,
      expected_end_date: '2027-02-04',
    });

    // On 05/11 the system finds nothing to revoke: the old record ended in the renewal and the new one runs to 04/02/2027.
    on('2026-11-05');
    await h.openDue();
    expect(await tasksOf(assignmentId)).toEqual([]);
    expect(await tasksOf(next.id)).toEqual([]);

    // The reminders follow the new end: nothing on 27/01/2027, the three of them on 28/01/2027, none for the old record.
    on('2027-01-27');
    await h.noticeDue();
    expect(await h.reminderRows(next.id)).toEqual([]);
    on('2027-01-28');
    await h.noticeDue();
    expect((await h.reminderRows(next.id)).map((row) => [row.audience, row.expected_end_date])).toEqual([
      ['EMPLOYEE', '2027-02-04'],
      ['HEAD', '2027-02-04'],
      ['IT_ADMIN', '2027-02-04'],
    ]);
    expect((await h.reminderRows(assignmentId)).map((row) => row.expected_end_date)).toEqual([
      '2026-11-04',
      '2026-11-04',
      '2026-11-04',
    ]);
  });

  it('opens exactly one task made by the system on 05/11 when the renewal is not approved: refused by the head, or never sent', async () => {
    const refusedOne = await holder(k1);
    const neverSent = await holder(k1);

    on('2026-10-05');
    const { request } = await h.renewed(refusedOne.unit.member.account, months(refusedOne.assignmentId, 3));
    on('2026-11-01');
    await h
      .decide(request.id, { decision: 'REJECT', reason: 'No longer needed' }, refusedOne.unit.head.account)
      .expect(200);

    // The end day itself: the right is in force, the system opens nothing.
    on('2026-11-04');
    await h.openDue();
    expect(await tasksOf(refusedOne.assignmentId)).toEqual([]);
    expect(await tasksOf(neverSent.assignmentId)).toEqual([]);

    on('2026-11-05');
    await h.openDue();
    await h.openDue();

    for (const { assignmentId } of [refusedOne, neverSent]) {
      expect(await tasksOf(assignmentId)).toEqual([
        { id: expect.any(String) as string, status: 'QUEUED', source: 'TIME_LIMITED_EXPIRY', created_by_system: true },
      ]);
      // Nothing is taken away by the system (SoD-6): the right is as it was until the IT Admin completes the task.
      expect(await h.seatRow(assignmentId)).toMatchObject({ valid_until: null, expected_end_date: '2026-11-04' });
    }
  });

  it('does not open the task while the renewal waits for the head or the spending approver, and opens it when the renewal is refused after the end', async () => {
    const { unit, assignmentId } = await holder(k1);
    on('2026-10-20');
    const { request } = await h.renewed(unit.member.account, months(assignmentId, 3));

    on('2026-11-05');
    await h.openDue();
    expect(await tasksOf(assignmentId)).toEqual([]);

    await h.decide(request.id, { decision: 'REJECT', reason: 'No longer needed' }, unit.head.account).expect(200);
    on('2026-11-06');
    await h.openDue();

    expect(await tasksOf(assignmentId)).toHaveLength(1);
  });

  it('refuses the months a plan bought by the month does not take and a right with no end for it; 9 months go (K1, QĐ-111i)', async () => {
    const { unit, assignmentId } = await holder(k1);
    on('2026-10-05');
    const before = [await h.requestRows(), await h.count('access_request_renewals')];

    const tooLong = await h.renew(months(assignmentId, 10), unit.member.account).expect(422);
    const noEnd = await h
      .renew({ assignmentId, longTerm: true, businessReason: REASON }, unit.member.account)
      .expect(422);

    expect(h.codeOf(tooLong)).toBe('ACCESS_REQUEST.TERM_MONTHS_OUT_OF_RANGE');
    expect(h.codeOf(noEnd)).toBe('ACCESS_REQUEST.TERM_REQUIRED');
    expect([await h.requestRows(), await h.count('access_request_renewals')]).toEqual(before);
    const { request } = await h.renewed(unit.member.account, months(assignmentId, 9));
    // 9 months from 05/11/2026 end on 04/08/2027; they begin on the 5th of 11, 12, 1, 2, 3, 4, 5, 6, 7: 2 in 2026 and 7 in 2027.
    expect(request).toMatchObject({ termMonths: 9, expectedEndDate: '2027-08-04' });
    expect(request.pricing).toMatchObject({ months: 2, nextYearAmount: { amount: String(7 * M) } });
  });

  it('a right with no end (K2, Dùng lâu dài): no end on the request or on the record that follows, 2 months of 2026 held and twelve of 2027 kept (R-46)', async () => {
    const { unit, assignmentId } = await holder(k2);
    on('2026-10-05');

    const { request } = await h.renewed(unit.member.account, { assignmentId, longTerm: true, businessReason: REASON });

    expect(request).toMatchObject({ termMonths: null, expectedEndDate: null });
    expect(request.renewal).toMatchObject({
      previousExpectedEndDate: '2026-11-04',
      newExpectedEndDate: null,
      consecutiveMonths: monthsBetween('2026-08-05', '2026-11-04'),
    });
    on('2026-11-01');
    await approvedAndPaid(request.id, unit);
    expect(await requestRow(request.id)).toMatchObject({
      amount_minor: String(2 * M),
      next_year_amount_minor: String(12 * M),
      term_months: null,
      expected_end_date: null,
    });
    const task = await extensionTaskOf(request.id);
    await h.claim(task.id).expect(200);
    await h.complete(task.id, { evidence: 'Extended with the vendor, with no end' }).expect(200);

    const [next] = await h.successorsOf(assignmentId);
    expect(next).toMatchObject({ valid_from: '2026-11-04', valid_until: null, expected_end_date: null });
    // A right with no end is neither reminded nor revoked by the calendar.
    on('2026-11-05');
    await h.openDue();
    expect(await tasksOf(assignmentId)).toEqual([]);
    expect(await tasksOf(next.id)).toEqual([]);
  });

  it('a person with a term is cut at the end of the contract and never given a right with no end (R-38, INV-07)', async () => {
    const { unit, assignmentId } = await holder(k1);
    await h.ctx.sql.query(
      `UPDATE employees SET employment_type = 'INTERN', contract_end_date = '2026-12-31' WHERE id = $1`,
      [unit.member.employeeId],
    );
    on('2026-10-05');

    const noEnd = await h
      .renew({ assignmentId, longTerm: true, businessReason: REASON }, unit.member.account)
      .expect(422);
    const { request } = await h.renewed(unit.member.account, months(assignmentId, 3));

    // A person with a term has no right with no end, whatever the plan.
    expect(h.codeOf(noEnd)).toBe('ACCESS_REQUEST.TERM_LONG_TERM_NOT_ALLOWED');
    // 3 months from 05/11 would end on 04/02/2027; the contract ends on 31/12/2026, so the period is cut there and 2 months have begun.
    expect(request).toMatchObject({ termMonths: 3, expectedEndDate: '2026-12-31' });
    expect(request.renewal).toMatchObject({ newExpectedEndDate: '2026-12-31' });
    expect(request.pricing).toMatchObject({ months: 2, nextYearAmount: null });
  });

  it('B-R1 (INV-07, R-38): a person with a term whose contract ends before the new period begins is refused, and nothing is written; one whose contract ends the day it begins is cut there', async () => {
    const ended = await holder(k1, '2026-12-31');
    const lastDay = await holder(k1, '2026-12-31');
    await h.ctx.sql.query(
      `UPDATE employees SET employment_type = 'INTERN', contract_end_date = '2026-12-31' WHERE id = $1`,
      [ended.unit.member.employeeId],
    );
    await h.ctx.sql.query(
      `UPDATE employees SET employment_type = 'INTERN', contract_end_date = '2027-01-01' WHERE id = $1`,
      [lastDay.unit.member.employeeId],
    );
    // The window opens 30 days before 31/12: on 01/12 the period that follows would begin on 01/01/2027, after the contract of the first.
    on('2026-12-01');
    const before = await h.requestRows();

    const refused = await h.renew(months(ended.assignmentId, 3), ended.unit.member.account).expect(422);
    const { request } = await h.renewed(lastDay.unit.member.account, months(lastDay.assignmentId, 3));

    expect(h.codeOf(refused)).toBe('ACCESS_REQUEST.TERM_CONTRACT_ENDED');
    expect(h.detailsOf(refused)).toEqual({ contractEndDate: '2026-12-31' });
    expect(await h.requestRows()).toBe(before + 1);
    // The contract ends on the day the period begins: that day is the whole of it, and the one month that begins on it is of 2027.
    expect(request).toMatchObject({ termMonths: 3, expectedEndDate: '2027-01-01' });
    expect(request.pricing).toMatchObject({ months: 0 });
    expect(request.pricing.nextYearAmount).not.toBeNull();
  });

  describe('R-27, by the real reader of the renewals (no stand-in): the reminder follows the end the right has', () => {
    /** What the module of requests tells licensing of the renewal that waits for a seat, as the real reader answers it. */
    const waitingOf = async (assignmentId: string) =>
      (await h.ctx.app.get(RenewalHoldHook).get().pendingRenewalsOf([assignmentId])).get(assignmentId);

    it('holds the reminder of 28/10 back once the renewal is approved in full, and the record that follows is reminded from 28/01/2027', async () => {
      const { unit, assignmentId } = await holder(k1);
      on('2026-10-05');
      const { request } = await h.renewed(unit.member.account, months(assignmentId, 3));
      // Sent and not decided: waiting, not approved.
      expect(await waitingOf(assignmentId)).toEqual({ requestId: request.id, state: 'PENDING', approved: false });

      // Approved in full on 20/10 (the head, then the spending approver): the request waits for the IT Admin to extend the right.
      on('2026-10-20');
      await approvedAndPaid(request.id, unit);
      expect(await h.state(request.id)).toBe('AWAITING_EXECUTION');
      expect(await waitingOf(assignmentId)).toEqual({
        requestId: request.id,
        state: 'AWAITING_EXECUTION',
        approved: true,
      });

      // 28/10: the end the right has is about to move, so the reminder of 04/11 is not owed.
      on('2026-10-28');
      await h.noticeDue();
      expect(await h.reminderRows(assignmentId)).toEqual([]);

      on('2026-10-29');
      const task = await extensionTaskOf(request.id);
      await h.claim(task.id).expect(200);
      await h.complete(task.id, { evidence: 'Extended with the vendor until 04/02/2027' }).expect(200);
      const [next] = await h.successorsOf(assignmentId);
      expect(next).toMatchObject({ valid_until: null, expected_end_date: '2027-02-04' });

      // Nothing is waiting any more, the record that follows is reminded from 28/01/2027, and the old one never was.
      expect(await waitingOf(assignmentId)).toBeUndefined();
      on('2027-01-27');
      await h.noticeDue();
      expect(await h.reminderRows(next.id)).toEqual([]);
      on('2027-01-28');
      await h.noticeDue();
      expect((await h.reminderRows(next.id)).map((row) => [row.audience, row.expected_end_date])).toEqual([
        ['EMPLOYEE', '2027-02-04'],
        ['HEAD', '2027-02-04'],
        ['IT_ADMIN', '2027-02-04'],
      ]);
      expect(await h.reminderRows(assignmentId)).toEqual([]);
    });

    it('still reminds a right whose renewal waits for its decision: the holder and the head choose to renew or let the right end (US-03-05 AC-1)', async () => {
      const { unit, assignmentId } = await holder(k1);
      on('2026-10-05');
      const { request } = await h.renewed(unit.member.account, months(assignmentId, 3));
      // The head approved the need and the spending approver has not decided: still not approved in full.
      on('2026-10-20');
      await h.decide(request.id, { decision: 'APPROVE' }, unit.head.account).expect(200);
      expect(await waitingOf(assignmentId)).toMatchObject({ requestId: request.id, approved: false });
      expect(await waitingOf(assignmentId)).not.toMatchObject({ state: 'AWAITING_EXECUTION' });

      on('2026-10-28');
      await h.noticeDue();

      expect((await h.reminderRows(assignmentId)).map((row) => [row.audience, row.expected_end_date])).toEqual([
        ['EMPLOYEE', '2026-11-04'],
        ['HEAD', '2026-11-04'],
        ['IT_ADMIN', '2026-11-04'],
      ]);
    });
  });
});
