import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { TransactionRunner } from '../../../src/infrastructure/database/transaction-runner';
import { LicensingApi } from '../../../src/modules/licensing/public/licensing.api';
import type { RevocationTaskFacts } from '../../../src/modules/licensing/public/licensing.types';
import { SeatReleaseService } from '../../../src/modules/requests/grant/seat-release.service';
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

  const unit = async (): Promise<Unit> => {
    counter += 1;
    const u = await h.departmentWithHead(`P-DAY${counter}`);
    await h.budgetFor(u, { total: 500 * M });

    return u;
  };
  /** A request for one person approved for the whole year at 1 000 000 a month, with no end. */
  const approved = async (u: Unit, months = 12) => {
    const id = await h.waitingForApprover(u, plan, { amount: months * M });
    await h.ctx.sql.query(
      `UPDATE access_requests SET amount_months = $2, price_kind = 'RECURRING', expected_end_date = NULL, budget_year = $3 WHERE id = $1`,
      [id, months, h.year],
    );
    await h.decideSpend(id, { decision: 'APPROVE' }, h.boss.account).expect(200);

    return id;
  };
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
