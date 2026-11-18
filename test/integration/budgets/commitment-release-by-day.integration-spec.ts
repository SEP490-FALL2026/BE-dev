import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { addMonths } from '../../../src/core/fiscal-year';
import { TransactionRunner } from '../../../src/infrastructure/database/transaction-runner';
import { LicensingApi } from '../../../src/modules/licensing/public/licensing.api';
import type { RevocationTaskFacts } from '../../../src/modules/licensing/public/licensing.types';
import { RequestsApi } from '../../../src/modules/requests/public/requests.api';
import { SeatReleaseService } from '../../../src/modules/requests/grant/seat-release.service';
import { pretendBusinessToday } from '../../support/pretend-today';
import { SpendHarness, type Unit } from '../../support/spend-harness';

const h = new SpendHarness();
const M = 1_000_000;
const MONTHLY = BigInt(M);

interface CommitmentRow {
  id: string;
  state: string;
  amount_minor: string;
  released_minor: string;
  seat_monthly_minor: string | null;
}
interface ReleaseRow {
  amount_minor: string;
  reason: string;
  reason_text: string | null;
}

/** What the days of the month of `day` before it cost at `monthly` a month, rounded half up: worked out here, apart from the code. */
const usedBefore = (monthly: bigint, day: string): bigint => {
  const [year, month, dayOfMonth] = day.split('-').map(Number);
  const days = BigInt(new Date(Date.UTC(year, month, 0)).getUTCDate());

  return (2n * monthly * BigInt(dayOfMonth - 1) + days) / (2n * days);
};
const monthOf = (day: string): number => Number(day.slice(5, 7));

describe('the money held for a seat goes back by the day (RV-07, M-06, M-10; integration, real PostgreSQL)', () => {
  let plan: string;
  let subscriptionId: string;
  let counter = 0;

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    subscriptionId = await h.subscription(20, 'K2');
    plan = await h.planOf(subscriptionId);
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  afterEach(() => jest.restoreAllMocks());

  const unit = async (): Promise<Unit> => {
    counter += 1;
    const u = await h.departmentWithHead(`P-DAY${counter}`);
    await h.budgetFor(u, { total: 500 * M });

    return u;
  };
  /** A request for one person approved for the whole year at 1 000 000 a month, with no end and no months of use (a long-term right). */
  const approved = async (u: Unit, months = 12) => {
    const id = await h.waitingForApprover(u, plan, { amount: months * M });
    await h.ctx.sql.query(
      `UPDATE access_requests SET amount_months = $2, price_kind = 'RECURRING', term_months = NULL, expected_end_date = NULL, budget_year = $3 WHERE id = $1`,
      [id, months, h.year],
    );
    await h.decideSpend(id, { decision: 'APPROVE' }, h.boss.account).expect(200);

    return id;
  };
  /**
   * A request of the version with months of use (RQ-2) approved for `months`: it records the months and no end date (`term_months` set,
   * `expected_end_date` NULL); the end of its seat is worked out at the grant.
   */
  const approvedWithTerm = async (u: Unit, months: number) => {
    const id = await approved(u, months);
    await h.ctx.sql.query(`UPDATE access_requests SET term_months = $2 WHERE id = $1`, [id, months]);

    return id;
  };
  /** The facts of a completed revocation of a right the request made, the way licensing tells them. */
  const revocationOf = (
    requestId: string,
    completed: Partial<NonNullable<RevocationTaskFacts['completed']>>,
  ): RevocationTaskFacts => ({
    id: randomUUID(),
    assignmentId: randomUUID(),
    employeeId: randomUUID(),
    planId: plan,
    status: 'COMPLETED',
    completed: {
      grantRequestId: requestId,
      chainAssignmentIds: [],
      grantedStartDate: null,
      grantedEndDate: null,
      provisioningType: 'K2',
      endedOn: `${h.year}-06-15`,
      paidThroughOn: null,
      sources: ['MANAGER_NOT_NEEDED'],
      k1Checklist: null,
      ...completed,
    },
  });
  const commitmentOf = async (requestId: string) =>
    (
      await h.ctx.sql.query<CommitmentRow>(
        `SELECT id, state, amount_minor::text, released_minor::text, seat_monthly_minor::text
           FROM budget_commitments WHERE request_id = $1`,
        [requestId],
      )
    ).rows[0];
  const setSeatMonthly = (requestId: string, minor: bigint | null) =>
    h.ctx.sql.query(`UPDATE budget_commitments SET seat_monthly_minor = $2 WHERE request_id = $1`, [
      requestId,
      minor === null ? null : minor.toString(),
    ]);
  const ledger = async (commitmentId: string) =>
    (
      await h.ctx.sql.query<ReleaseRow>(
        `SELECT amount_minor::text, reason::text, reason_text FROM budget_commitment_releases
          WHERE commitment_id = $1 ORDER BY released_at, id`,
        [commitmentId],
      )
    ).rows;
  /** The grant of the request completed through the routes; returns the task and the assignment it made, with the day it began. */
  const grantedSeat = async (requestId: string) => {
    const task = h.dataOf<{ task: { id: string } }>(await h.grant({ requestId, subscriptionId }).expect(201)).task;
    await h.claim(task.id).expect(200);
    await h.complete(task.id, { evidence: 'Added to the workspace' }).expect(200);
    const row = (
      await h.ctx.sql.query<{ assignment_id: string; effective_from: string }>(
        `SELECT t.assignment_id, to_char(coalesce(a.granted_on, a.valid_from), 'YYYY-MM-DD') AS effective_from
           FROM provisioning_tasks t JOIN license_assignments a ON a.id = t.assignment_id WHERE t.id = $1`,
        [task.id],
      )
    ).rows[0];

    return { taskId: task.id, assignmentId: row.assignment_id, grantedOn: row.effective_from };
  };
  /** The revocation of the seat opened by a manager, taken and completed by the IT Admin through the route; returns the task and the end. */
  const revoked = async (assignmentId: string) => {
    const actor = {
      subject: h.it1.appUserId,
      appUserId: h.it1.appUserId,
      sessionId: randomUUID(),
      employeeId: h.it1.employeeId,
      directRoles: ['IT_ADMIN'],
      roles: ['IT_ADMIN'],
    };
    const opened = await h.ctx.app.get(TransactionRunner).run((tx) =>
      h.ctx.app.get(LicensingApi).openRevocation(tx, actor, {
        assignmentId,
        source: 'MANAGER_NOT_NEEDED',
        decision: { decidedRole: 'MANAGER' },
      }),
    );
    await h.claim(opened.taskId).expect(200);
    await request(h.server())
      .post(`/api/v1/provisioning-tasks/${opened.taskId}/revocation-completion`)
      .set(h.as(h.it1))
      .send({ completion: 'ACCOUNT_REMOVED', evidence: 'Removed from the workspace' })
      .expect(200);
    const endsOn = (
      await h.ctx.sql.query<{ valid_until: string }>(
        `SELECT to_char(valid_until, 'YYYY-MM-DD') AS valid_until FROM license_assignments WHERE id = $1`,
        [assignmentId],
      )
    ).rows[0].valid_until;

    return { taskId: opened.taskId, endsOn };
  };
  const runAfterRevocation = (task: RevocationTaskFacts) =>
    h.ctx.app
      .get(TransactionRunner)
      .run((tx) => h.ctx.app.get(SeatReleaseService, { strict: false }).afterRevocation(tx, task, new Date()));

  it('the approval keeps what one seat costs a month on the commitment', async () => {
    const id = await approved(await unit());

    expect(await commitmentOf(id)).toMatchObject({ state: 'HELD', seat_monthly_minor: String(M) });
  });

  it('M-10: a K2 seat granted after its commitment began gives back the months and the days before the grant', async () => {
    const id = await approved(await unit());
    await setSeatMonthly(id, MONTHLY);

    const { assignmentId, grantedOn } = await grantedSeat(id);

    // Counted from January: the months before the month of the grant and the days of that month before it.
    const expected = MONTHLY * BigInt(monthOf(grantedOn) - 1) + usedBefore(MONTHLY, grantedOn);
    const commitment = await commitmentOf(id);
    expect(commitment.released_minor).toBe(expected.toString());
    expect(await ledger(commitment.id)).toEqual(
      expected === 0n
        ? []
        : [{ amount_minor: expected.toString(), reason: 'LATE_GRANT', reason_text: `grantAssignment:${assignmentId}` }],
    );
    if (expected > 0n) {
      const audit = await h.ctx.sql.query(
        `SELECT 1 FROM audit_events WHERE action = 'BUDGET_COMMITMENT.RELEASED' AND resource_id = $1 AND actor_kind = 'SYSTEM'`,
        [commitment.id],
      );
      expect(audit.rowCount).toBe(1);
    }
  });

  it('RV-07: a K2 seat whose revocation is completed in the middle of a month gives back the rest of the year less the days used', async () => {
    const id = await approved(await unit());
    // Nothing is kept at the grant, so only the revocation gives back.
    await setSeatMonthly(id, null);
    const { assignmentId } = await grantedSeat(id);
    await setSeatMonthly(id, MONTHLY);
    const before = await commitmentOf(id);
    expect(before.released_minor).toBe('0');

    const { taskId, endsOn } = await revoked(assignmentId);

    const expected =
      Number(endsOn.slice(0, 4)) > h.year
        ? 0n
        : MONTHLY * BigInt(12 - monthOf(endsOn) + 1) - usedBefore(MONTHLY, endsOn);
    const after = await commitmentOf(id);
    expect(after.released_minor).toBe(expected.toString());
    expect(after.state).toBe(expected === BigInt(12 * M) ? 'RELEASED' : 'HELD');
    expect(await ledger(after.id)).toEqual(
      expected === 0n
        ? []
        : [{ amount_minor: expected.toString(), reason: 'REVOKED', reason_text: `revocationTask:${taskId}` }],
    );
  });

  it('a request to go on using with months of use counts its months from the day after the end it renews: 15/06, 15/07 and 15/08 are June, July and August', async () => {
    const u = await unit();
    const first = await approved(u, 3);
    const next = await approvedWithTerm(await unit(), 3);
    const { assignmentId } = await grantedSeat(first);
    // It renews the right that ended on 14/06 for three months, to 14/09; its months begin on 15/06, 15/07 and 15/08.
    await h.ctx.sql.query(
      `BEGIN;
       UPDATE access_requests SET type = 'RENEWAL', expected_end_date = '${h.year}-09-14' WHERE id = '${next}';
       INSERT INTO access_request_renewals (request_id, assignment_id, previous_expected_end_date, new_expected_end_date, consecutive_months)
       VALUES ('${next}', '${assignmentId}', '${h.year}-06-14', '${h.year}-09-14', 6);
       COMMIT;`,
    );
    await setSeatMonthly(next, MONTHLY);

    await runAfterRevocation(
      revocationOf(first, {
        chainAssignmentIds: [assignmentId],
        grantRequestId: null,
        endedOn: `${h.year}-07-20`,
      }),
    );

    // August and the 12 days of July not used (19 of 31 were): not September.
    const expected = MONTHLY * 2n - usedBefore(MONTHLY, `${h.year}-07-20`);
    expect((await commitmentOf(next)).released_minor).toBe(expected.toString());
  });

  it('a request to go on using of the chain gives back its own months; the request before it only what is left of its own', async () => {
    const u = await unit();
    const first = await approved(u, 4);
    // Another department, so the two requests are not one person asking twice for the same plan.
    const next = await approved(await unit(), 6);
    const { assignmentId } = await grantedSeat(first);
    // R6 covers March to June, R7 (going on using the same right) July to December, 1 000 000 a month each.
    await h.ctx.sql.query(`UPDATE access_requests SET expected_end_date = $2 WHERE id = $1`, [
      first,
      `${h.year}-06-30`,
    ]);
    await h.ctx.sql.query(
      `BEGIN;
       UPDATE access_requests SET type = 'RENEWAL' WHERE id = '${next}';
       INSERT INTO access_request_renewals (request_id, assignment_id, previous_expected_end_date, new_expected_end_date, consecutive_months)
       VALUES ('${next}', '${assignmentId}', '${h.year}-06-30', '${h.year}-12-31', 10);
       COMMIT;`,
    );
    await setSeatMonthly(first, MONTHLY);
    await setSeatMonthly(next, MONTHLY);
    const firstBefore = BigInt((await commitmentOf(first)).released_minor);
    const task: RevocationTaskFacts = {
      id: randomUUID(),
      assignmentId,
      employeeId: u.member.employeeId,
      planId: plan,
      status: 'COMPLETED',
      completed: {
        grantRequestId: first,
        chainAssignmentIds: [assignmentId],
        grantedStartDate: null,
        grantedEndDate: null,
        provisioningType: 'K2',
        endedOn: `${h.year}-05-01`,
        paidThroughOn: null,
        sources: ['MANAGER_NOT_NEEDED'],
        k1Checklist: null,
      },
    };

    await runAfterRevocation(task);
    // The same task told again gives nothing back again.
    await runAfterRevocation(task);

    const r6 = await commitmentOf(first);
    const r7 = await commitmentOf(next);
    // R6: May and June, ended on day 1 so nothing of May was used (capped by what it still holds).
    const r6Share = 2n * MONTHLY < BigInt(4 * M) - firstBefore ? 2n * MONTHLY : BigInt(4 * M) - firstBefore;
    expect(BigInt(r6.released_minor) - firstBefore).toBe(r6Share);
    expect(r7).toMatchObject({ released_minor: String(6 * M), state: 'RELEASED' });
    expect((await ledger(r7.id)).filter((row) => row.reason === 'REVOKED')).toEqual([
      { amount_minor: String(6 * M), reason: 'REVOKED', reason_text: `revocationTask:${task.id}` },
    ]);
    expect((await ledger(r6.id)).filter((row) => row.reason === 'REVOKED')).toHaveLength(r6Share === 0n ? 0 : 1);
  });

  it('B-C1: a K1 right of a request with months of use is used to its last day: the revocation that comes on time gives nothing back', async () => {
    // Three months from 15/03: the request records no end, the seat its grant made ends on 14/06 and the revocation is completed on 15/06.
    const id = await approvedWithTerm(await unit(), 3);
    await setSeatMonthly(id, MONTHLY);

    await runAfterRevocation(
      revocationOf(id, {
        provisioningType: 'K1',
        grantedStartDate: `${h.year}-03-15`,
        grantedEndDate: `${h.year}-06-14`,
        endedOn: `${h.year}-06-15`,
        paidThroughOn: `${h.year}-06-14`,
      }),
    );

    const commitment = await commitmentOf(id);
    expect(commitment).toMatchObject({ state: 'HELD', released_minor: '0' });
    expect(await ledger(commitment.id)).toEqual([]);
  });

  it('the same right taken back in the middle of its term gives back the months that had not begun and the days of the month it is taken back in, not the whole commitment', async () => {
    const id = await approvedWithTerm(await unit(), 3);
    await setSeatMonthly(id, MONTHLY);
    const task = revocationOf(id, {
      grantedStartDate: `${h.year}-03-15`,
      grantedEndDate: `${h.year}-06-14`,
      endedOn: `${h.year}-04-20`,
    });

    await runAfterRevocation(task);

    // The three months are the ones that began on 15/03, 15/04 and 15/05: March, April and May. Taken back on 20/04 it gives back May and the
    // 11 days of April not used (the 19 before 20/04 were).
    const expected = MONTHLY * 2n - usedBefore(MONTHLY, `${h.year}-04-20`);
    const after = await commitmentOf(id);
    expect(after).toMatchObject({ state: 'HELD', released_minor: expected.toString() });
    expect(await ledger(after.id)).toEqual([
      { amount_minor: expected.toString(), reason: 'REVOKED', reason_text: `revocationTask:${task.id}` },
    ]);
  });

  it('the same right taken back on the last day paid, or after it, gives back nothing: the share has no step where the term ends', async () => {
    const id = await approvedWithTerm(await unit(), 3);
    await setSeatMonthly(id, MONTHLY);
    const term = { grantedStartDate: `${h.year}-03-15`, grantedEndDate: `${h.year}-06-14` };

    await runAfterRevocation(revocationOf(id, { ...term, endedOn: `${h.year}-06-14` }));
    await runAfterRevocation(revocationOf(id, { ...term, endedOn: `${h.year}-06-15` }));

    expect(await commitmentOf(id)).toMatchObject({ state: 'HELD', released_minor: '0' });
  });

  it('B-C1: a long-term request (no months of use) keeps counting to December, whatever end its seat has', async () => {
    const id = await approved(await unit(), 12);
    await setSeatMonthly(id, MONTHLY);

    await runAfterRevocation(revocationOf(id, { grantedEndDate: `${h.year}-06-14`, endedOn: `${h.year}-04-20` }));

    const expected = MONTHLY * 9n - usedBefore(MONTHLY, `${h.year}-04-20`);
    expect((await commitmentOf(id)).released_minor).toBe(expected.toString());
  });

  /** The end the seat of an assignment has, read from the table. */
  const seatEndOf = async (assignmentId: string): Promise<string> =>
    (
      await h.ctx.sql.query<{ end: string }>(
        `SELECT to_char(expected_end_date, 'YYYY-MM-DD') AS "end" FROM license_assignments WHERE id = $1`,
        [assignmentId],
      )
    ).rows[0].end;
  /**
   * The last of the months a request with months of use covers in `h.year`: the month of the last day a month of its seat began on (the days
   * `start` plus a whole number of months, up to the end), December when that day is in a later year, none before the year.
   */
  const lastMonthOfSeat = (start: string, end: string): number => {
    let lastBegan = start;
    for (let k = 1; addMonths(start, k) <= end; k += 1) lastBegan = addMonths(start, k);
    const year = Number(lastBegan.slice(0, 4));

    return year < h.year ? 0 : year === h.year ? monthOf(lastBegan) : 12;
  };
  /** The day the seat of an assignment began, read from the table. */
  const seatStartOf = async (assignmentId: string): Promise<string> =>
    (
      await h.ctx.sql.query<{ start: string }>(
        `SELECT to_char(valid_from, 'YYYY-MM-DD') AS "start" FROM license_assignments WHERE id = $1`,
        [assignmentId],
      )
    ).rows[0].start;

  it('B-C1: licensing tells the end of the seat the request made, in the chain and in the revocation', async () => {
    const id = await approvedWithTerm(await unit(), 3);
    // Nothing is kept at the grant, so the release that follows is the one of the revocation only.
    await setSeatMonthly(id, null);
    const { assignmentId } = await grantedSeat(id);
    await setSeatMonthly(id, MONTHLY);
    const seatEnd = await seatEndOf(assignmentId);
    const seatStart = await seatStartOf(assignmentId);

    const [chain] = await h.ctx.app
      .get(TransactionRunner)
      .run((tx) => h.ctx.app.get(LicensingApi).listRightChainsOf(tx, [assignmentId]));
    expect(chain).toMatchObject({
      assignmentId,
      grantRequestId: id,
      grantedStartDate: seatStart,
      grantedEndDate: seatEnd,
    });

    const { taskId, endsOn } = await revoked(assignmentId);
    // What the revocation gave back is the share of the months counted back from the month the seat ends in, worked out here apart from the code.
    const last = lastMonthOfSeat(seatStart, seatEnd);
    const first = Math.max(1, last - 3 + 1);
    const expected =
      Number(endsOn.slice(0, 4)) > h.year || endsOn > seatEnd || last < first
        ? 0n
        : monthOf(endsOn) < first
          ? MONTHLY * BigInt(last - first + 1)
          : MONTHLY * BigInt(last - monthOf(endsOn) + 1) - usedBefore(MONTHLY, endsOn);
    const capped = expected > MONTHLY * 3n ? MONTHLY * 3n : expected;
    const after = await commitmentOf(id);
    expect(after.released_minor).toBe(capped.toString());
    expect((await ledger(after.id)).filter((row) => row.reason === 'REVOKED')).toEqual(
      capped === 0n
        ? []
        : [{ amount_minor: capped.toString(), reason: 'REVOKED', reason_text: `revocationTask:${taskId}` }],
    );
  });

  it('B-C1: a K2 seat of a request with months of use granted late gives back nothing before the months its end counts back to', async () => {
    const id = await approvedWithTerm(await unit(), 3);
    await setSeatMonthly(id, MONTHLY);

    const { assignmentId, grantedOn } = await grantedSeat(id);

    // The three months are the last three before the month the seat ends in: a grant before them used none of them.
    const first = Math.max(1, lastMonthOfSeat(await seatStartOf(assignmentId), await seatEndOf(assignmentId)) - 3 + 1);
    const expected =
      monthOf(grantedOn) < first ? 0n : MONTHLY * BigInt(monthOf(grantedOn) - first) + usedBefore(MONTHLY, grantedOn);
    const commitment = await commitmentOf(id);
    expect(commitment.released_minor).toBe((expected > MONTHLY * 3n ? MONTHLY * 3n : expected).toString());
  });

  /**
   * A seat of a request for 3 months of use, granted through the routes on `day` of `h.year` (the day the organization is on is said to the
   * application, so the numbers are the same whatever day the suite runs): the people of the department live in it since 01/01, and the person
   * has a contract that ends on `contractEnd` when it is given. With `keepSeatMonthly` false nothing is kept on the commitment at the grant, so
   * only what follows gives back.
   */
  const seatGrantedOn = async (day: string, input: { contractEnd?: string; keepSeatMonthly: boolean }) => {
    const u = await unit();
    const since = `${h.year}-01-01`;
    await h.ctx.sql.query(
      `UPDATE employees SET hire_date = $2 WHERE id IN (SELECT employee_id FROM employee_placements WHERE department_id = $1)`,
      [u.department.id, since],
    );
    await h.ctx.sql.query(`UPDATE employee_placements SET valid_from = $2 WHERE department_id = $1`, [
      u.department.id,
      since,
    ]);
    await h.ctx.sql.query(`UPDATE department_head_periods SET valid_from = $2 WHERE department_id = $1`, [
      u.department.id,
      since,
    ]);
    const id = await approvedWithTerm(u, 3);
    // The contract is written after the request is sent: on the day it is sent the person still has it.
    if (input.contractEnd !== undefined) {
      await h.ctx.sql.query(`UPDATE employees SET employment_type = 'INTERN', contract_end_date = $2 WHERE id = $1`, [
        u.member.employeeId,
        input.contractEnd,
      ]);
    }
    if (!input.keepSeatMonthly) await setSeatMonthly(id, null);
    pretendBusinessToday(h.ctx.app, day);
    const seat = await grantedSeat(id);
    if (!input.keepSeatMonthly) await setSeatMonthly(id, MONTHLY);

    return { id, ...seat };
  };

  it('a K2 seat granted late whose term the contract cut gives back the month of the three held that comes before the ones the seat covers (approved 15/03, granted 01/04, the contract ends 20/05)', async () => {
    const { id, assignmentId } = await seatGrantedOn(`${h.year}-04-01`, {
      contractEnd: `${h.year}-05-20`,
      keepSeatMonthly: true,
    });

    // The seat runs 01/04 to 20/05: months begin on 01/04 and 01/05, so it covers April and May, and March of the three months held is given back.
    expect(await seatEndOf(assignmentId)).toBe(`${h.year}-05-20`);
    const commitment = await commitmentOf(id);
    expect(commitment.released_minor).toBe(MONTHLY.toString());
    expect(await ledger(commitment.id)).toEqual([
      { amount_minor: MONTHLY.toString(), reason: 'LATE_GRANT', reason_text: `grantAssignment:${assignmentId}` },
    ]);
  });

  it('a K2 seat granted late on the 25th gives back the days of that month before the grant, since the months it covers begin on the 25th', async () => {
    const { id } = await seatGrantedOn(`${h.year}-03-25`, { keepSeatMonthly: true });

    // 25/03 to 24/06: months begin on 25/03, 25/04 and 25/05, so the first of the three months held is March and 24 of the 31 days of it were not held.
    expect((await commitmentOf(id)).released_minor).toBe(usedBefore(MONTHLY, `${h.year}-03-25`).toString());
  });

  it('the money held for a seat whose person is transferred goes back from the day of the transfer by the same months: the three that began on 15/03, 15/04 and 15/05', async () => {
    const { id, assignmentId } = await seatGrantedOn(`${h.year}-03-15`, { keepSeatMonthly: false });
    const transferId = randomUUID();

    const result = await h.ctx.app.get(TransactionRunner).run((tx) =>
      h.ctx.app.get(RequestsApi, { strict: false }).releaseForTransfer(tx, {
        transferId,
        effectiveOn: `${h.year}-04-20`,
        rights: [{ assignmentId, provisioningType: 'K2' }],
      }),
    );

    // May and the 11 days of April not used (19 of 30 were), not May, June and the rest of April.
    const expected = MONTHLY * 2n - usedBefore(MONTHLY, `${h.year}-04-20`);
    expect(result.released).toEqual([{ currency: 'VND', amountMinor: expected }]);
    const commitment = await commitmentOf(id);
    expect(commitment.released_minor).toBe(expected.toString());
    expect(await ledger(commitment.id)).toEqual([
      {
        amount_minor: expected.toString(),
        reason: 'TRANSFER_EFFECTIVE',
        reason_text: `transfer:${transferId}:assignment:${assignmentId}`,
      },
    ]);
  });

  it('gives nothing back for a one-time price (K4), a task not completed, or a right no request made', async () => {
    const id = await approved(await unit());
    await setSeatMonthly(id, MONTHLY);
    const base: RevocationTaskFacts = {
      id: randomUUID(),
      assignmentId: randomUUID(),
      employeeId: randomUUID(),
      planId: plan,
      status: 'COMPLETED',
      completed: {
        grantRequestId: id,
        chainAssignmentIds: [],
        grantedStartDate: null,
        grantedEndDate: null,
        provisioningType: 'K4',
        endedOn: `${h.year}-05-01`,
        paidThroughOn: null,
        sources: ['MANAGER_NOT_NEEDED'],
        k1Checklist: null,
      },
    };

    await runAfterRevocation(base);
    await runAfterRevocation({ ...base, status: 'IN_PROGRESS', completed: undefined });
    await runAfterRevocation({
      ...base,
      completed: {
        ...(base.completed as NonNullable<RevocationTaskFacts['completed']>),
        provisioningType: 'K2',
        grantRequestId: null,
      },
    });

    const commitment = await commitmentOf(id);
    expect(commitment).toMatchObject({ state: 'HELD', released_minor: '0' });
    expect(await ledger(commitment.id)).toEqual([]);
  });
});
