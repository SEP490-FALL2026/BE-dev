import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { TransactionRunner } from '../../../src/infrastructure/database/transaction-runner';
import { BudgetsApi } from '../../../src/modules/budgets/public/budgets.api';
import { LicensingApi } from '../../../src/modules/licensing/public/licensing.api';
import type { RevocationTaskFacts, SystemActor } from '../../../src/modules/licensing/public/licensing.types';
import { SeatReleaseService } from '../../../src/modules/requests/grant/seat-release.service';
import { RequestsApi } from '../../../src/modules/requests/public/requests.api';
import { SpendHarness, type Unit } from '../../support/spend-harness';

const h = new SpendHarness();
const M = 1_000_000;
const MONTHLY = BigInt(M);

/** What the days of the month of `day` before it cost at `monthly` a month, rounded half up: worked out here, apart from the code. */
const usedBefore = (monthly: bigint, day: string): bigint => {
  const [year, month, dayOfMonth] = day.split('-').map(Number);
  const days = BigInt(new Date(Date.UTC(year, month, 0)).getUTCDate());

  return (2n * monthly * BigInt(dayOfMonth - 1) + days) / (2n * days);
};
const monthOf = (day: string): number => Number(day.slice(5, 7));
/** What the right gives back from `day`: the months from the month of the day, less the days of that month used. */
const shareFrom = (day: string): bigint => MONTHLY * BigInt(12 - monthOf(day) + 1) - usedBefore(MONTHLY, day);

interface LedgerRow {
  year: number;
  reason: string;
  amount_minor: string;
  reason_text: string | null;
}

/**
 * `MF3-B-R1`/`R2` (review of MF3-B, D-86, D-87): a commitment goes back once for each transfer, decided by the ledger of that commitment and not by who
 * asked for the revocation. The commitment that gave back for the right the day a transfer took effect (reason `TRANSFER_EFFECTIVE`, reference
 * `transfer:<id>:assignment:<id>`) gives nothing back again when that right is taken away, whatever the source; every other commitment of the right
 * (a transfer from before the release that has no such release, the commitment of a year that begins in the grace) goes back when it is taken away.
 * On real PostgreSQL, through the facade of requests and the routes of the IT Admin.
 */
describe('a commitment goes back once for the transfer of its right, by its own ledger (integration, real PostgreSQL)', () => {
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
    const u = await h.departmentWithHead(`P-LR${counter}`);
    await h.budgetFor(u, { total: 500 * M });

    return u;
  };
  const setSeatMonthly = (requestId: string, minor: bigint | null) =>
    h.ctx.sql.query(`UPDATE budget_commitments SET seat_monthly_minor = $2 WHERE request_id = $1`, [
      requestId,
      minor === null ? null : minor.toString(),
    ]);
  /** A request for one person approved for the whole year at 1 000 000 a month, with no end, and the seat its grant made. */
  const seatOfNewRequest = async (): Promise<{ requestId: string; assignmentId: string }> => {
    const requestId = await h.waitingForApprover(await unit(), plan, { amount: 12 * M });
    await h.ctx.sql.query(
      `UPDATE access_requests SET amount_months = 12, price_kind = 'RECURRING', expected_end_date = NULL, budget_year = $2 WHERE id = $1`,
      [requestId, h.year],
    );
    await h.decideSpend(requestId, { decision: 'APPROVE' }, h.boss.account).expect(200);
    await setSeatMonthly(requestId, null);
    const task = h.dataOf<{ task: { id: string } }>(await h.grant({ requestId, subscriptionId }).expect(201)).task;
    await h.claim(task.id).expect(200);
    await h.complete(task.id, { evidence: 'Added to the workspace' }).expect(200);
    await setSeatMonthly(requestId, MONTHLY);

    return {
      requestId,
      assignmentId: (
        await h.ctx.sql.query<{ assignment_id: string }>('SELECT assignment_id FROM provisioning_tasks WHERE id = $1', [
          task.id,
        ])
      ).rows[0].assignment_id,
    };
  };
  const releasedForTransfer = (transferId: string, assignmentId: string) =>
    h.ctx.app.get(TransactionRunner).run((tx) =>
      h.ctx.app.get(RequestsApi, { strict: false }).releaseForTransfer(tx, {
        transferId,
        effectiveOn: h.today(),
        rights: [{ assignmentId, provisioningType: 'K2' }],
      }),
    );
  /** The revocation of the seat for `source`, opened by the system, taken and completed by the IT Admin through the routes; returns the task. */
  const revokedFor = async (assignmentId: string, source: string, referenceId: string): Promise<string> => {
    const actor: SystemActor = { kind: 'SYSTEM', correlationId: `ledger-rule:${referenceId}` };
    const opened = await h.ctx.app.get(TransactionRunner).run((tx) =>
      h.ctx.app.get(LicensingApi).openRevocation(tx, actor, {
        assignmentId,
        source,
        decision: { decidedRole: 'SYSTEM', referenceKind: 'TEST', referenceId },
      }),
    );
    await h.claim(opened.taskId).expect(200);
    await request(h.server())
      .post(`/api/v1/provisioning-tasks/${opened.taskId}/revocation-completion`)
      .set(h.as(h.it1))
      .send({ completion: 'ACCOUNT_REMOVED', evidence: 'Removed from the workspace' })
      .expect(200);

    return opened.taskId;
  };
  const ledger = async (requestId: string): Promise<LedgerRow[]> =>
    (
      await h.ctx.sql.query<LedgerRow>(
        `SELECT c.year, r.reason::text, r.amount_minor::text, r.reason_text FROM budget_commitment_releases r
           JOIN budget_commitments c ON c.id = r.commitment_id WHERE c.request_id = $1 ORDER BY c.year, r.released_at, r.id`,
        [requestId],
      )
    ).rows;
  const endedOn = async (assignmentId: string): Promise<string> =>
    (
      await h.ctx.sql.query<{ valid_until: string }>(
        `SELECT to_char(valid_until, 'YYYY-MM-DD') AS valid_until FROM license_assignments WHERE id = $1`,
        [assignmentId],
      )
    ).rows[0].valid_until;

  it.each(['DEPARTURE', 'ABRUPT_DEPARTURE', 'TIME_LIMITED_EXPIRY', 'TRANSFER'])(
    'R1: the right is taken away for %s in the grace: the total given back is what the transfer gave, from its day, and nothing more',
    async (source) => {
      const { requestId, assignmentId } = await seatOfNewRequest();
      const transferId = randomUUID();
      await releasedForTransfer(transferId, assignmentId);

      const taskId = await revokedFor(assignmentId, source, transferId);

      const rows = await ledger(requestId);
      expect(rows.map((row) => row.reason)).toEqual(['TRANSFER_EFFECTIVE']);
      expect(rows[0].reason_text).toBe(`transfer:${transferId}:assignment:${assignmentId}`);
      expect(rows.some((row) => row.reason_text === `revocationTask:${taskId}`)).toBe(false);
      const released = (
        await h.ctx.sql.query<{ released_minor: string }>(
          'SELECT released_minor::text FROM budget_commitments WHERE request_id = $1',
          [requestId],
        )
      ).rows[0].released_minor;
      expect(released).toBe(shareFrom(h.today()).toString());
    },
    240_000,
  );

  it('R2 (a): a transfer from before the release has no release of its own: the revocation by the transfer gives the commitment back, once', async () => {
    const { requestId, assignmentId } = await seatOfNewRequest();
    const transferId = randomUUID();

    const taskId = await revokedFor(assignmentId, 'TRANSFER', transferId);

    const rows = await ledger(requestId);
    const ended = await endedOn(assignmentId);
    expect(rows).toEqual([
      {
        year: h.year,
        reason: 'REVOKED',
        amount_minor: shareFrom(ended).toString(),
        reason_text: `revocationTask:${taskId}`,
      },
    ]);
    // Told again, the same task gives nothing back again.
    const facts: RevocationTaskFacts = {
      id: taskId,
      assignmentId,
      employeeId: randomUUID(),
      planId: plan,
      status: 'COMPLETED',
      completed: {
        grantRequestId: requestId,
        chainAssignmentIds: [assignmentId],
        provisioningType: 'K2',
        endedOn: ended,
        paidThroughOn: null,
        sources: ['TRANSFER'],
        k1Checklist: null,
      },
    };
    await h.ctx.app
      .get(TransactionRunner)
      .run((tx) => h.ctx.app.get(SeatReleaseService, { strict: false }).afterRevocation(tx, facts, new Date()));
    expect(await ledger(requestId)).toEqual(rows);
  }, 240_000);

  it('R2 (b): the commitment of the year that began in the grace goes back when the right is taken away; the year that gave back the day of the transfer does not again', async () => {
    const { requestId, assignmentId } = await seatOfNewRequest();
    const transferId = randomUUID();
    await releasedForTransfer(transferId, assignmentId);
    // The pass of 01/01 holds the commitment of the next year for the request of the right that is still there (`QĐ-109a`).
    const held = (
      await h.ctx.sql.query<{ organization_id: string; cost_center_id: string; currency: string }>(
        'SELECT organization_id, cost_center_id, currency FROM budget_commitments WHERE request_id = $1',
        [requestId],
      )
    ).rows[0];
    const next = h.year + 1;
    await h.ctx.app.get(TransactionRunner).run((tx) =>
      h.ctx.app.get(BudgetsApi, { strict: false }).holdYearStart(tx, {
        organizationId: held.organization_id,
        year: next,
        now: new Date(),
        items: [
          {
            requestId,
            costCenterId: held.cost_center_id,
            currency: held.currency,
            amountMinor: BigInt(12 * M),
            seatMonthlyMinor: MONTHLY,
          },
        ],
      }),
    );
    expect((await ledger(requestId)).map((row) => row.year)).toEqual([h.year]);

    const taskId = await revokedFor(assignmentId, 'TRANSFER', transferId);

    expect(await ledger(requestId)).toEqual([
      {
        year: h.year,
        reason: 'TRANSFER_EFFECTIVE',
        amount_minor: shareFrom(h.today()).toString(),
        reason_text: `transfer:${transferId}:assignment:${assignmentId}`,
      },
      { year: next, reason: 'REVOKED', amount_minor: String(12 * M), reason_text: `revocationTask:${taskId}` },
    ]);
  }, 240_000);
});
