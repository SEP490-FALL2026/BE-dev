import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { TransactionRunner } from '../../../src/infrastructure/database/transaction-runner';
import { LicensingApi } from '../../../src/modules/licensing/public/licensing.api';
import type { ProvisioningKind, SystemActor } from '../../../src/modules/licensing/public/licensing.types';
import { RequestsApi } from '../../../src/modules/requests/public/requests.api';
import { SpendHarness, type Unit } from '../../support/spend-harness';

const h = new SpendHarness();
const M = 1_000_000;
const MONTHLY = BigInt(M);

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

/**
 * `MF3-B.3` (`QĐ-111bg`, BLK-3, SPEC §8): the commitment of the old right of a person who moved goes back to the budget of the old department
 * the day the transfer takes effect, once, and the revocation that follows the grace (source `TRANSFER`) does not give it back again.
 * On real PostgreSQL, through the requests facade and the routes of the IT Admin.
 */
describe('the money held for the old rights of a transfer goes back once, the day it takes effect (integration, real PostgreSQL)', () => {
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
    const u = await h.departmentWithHead(`P-TR${counter}`);
    await h.budgetFor(u, { total: 500 * M });

    return u;
  };
  /** A request for one person approved for the whole year at 1 000 000 a month, with no end. */
  const approved = async (u: Unit) => {
    const id = await h.waitingForApprover(u, plan, { amount: 12 * M });
    await h.ctx.sql.query(
      `UPDATE access_requests SET amount_months = 12, price_kind = 'RECURRING', expected_end_date = NULL, budget_year = $2 WHERE id = $1`,
      [id, h.year],
    );
    await h.decideSpend(id, { decision: 'APPROVE' }, h.boss.account).expect(200);

    return id;
  };
  const setSeatMonthly = (requestId: string, minor: bigint | null) =>
    h.ctx.sql.query(`UPDATE budget_commitments SET seat_monthly_minor = $2 WHERE request_id = $1`, [
      requestId,
      minor === null ? null : minor.toString(),
    ]);
  const commitmentOf = async (requestId: string) =>
    (
      await h.ctx.sql.query<{ id: string; state: string; released_minor: string }>(
        `SELECT id, state::text, released_minor::text FROM budget_commitments WHERE request_id = $1`,
        [requestId],
      )
    ).rows[0];
  const ledger = async (commitmentId: string) =>
    (
      await h.ctx.sql.query<ReleaseRow>(
        `SELECT amount_minor::text, reason::text, reason_text FROM budget_commitment_releases
          WHERE commitment_id = $1 ORDER BY released_at, id`,
        [commitmentId],
      )
    ).rows;
  /** The grant of the request completed through the routes; the seat it made. No release by day at the grant (the price a month is not kept yet). */
  const grantedSeat = async (requestId: string): Promise<string> => {
    await setSeatMonthly(requestId, null);
    const task = h.dataOf<{ task: { id: string } }>(await h.grant({ requestId, subscriptionId }).expect(201)).task;
    await h.claim(task.id).expect(200);
    await h.complete(task.id, { evidence: 'Added to the workspace' }).expect(200);
    await setSeatMonthly(requestId, MONTHLY);

    return (
      await h.ctx.sql.query<{ assignment_id: string }>('SELECT assignment_id FROM provisioning_tasks WHERE id = $1', [
        task.id,
      ])
    ).rows[0].assignment_id;
  };
  const releaseForTransfer = (
    transferId: string,
    rights: { assignmentId: string; provisioningType: ProvisioningKind }[],
    effectiveOn = h.today(),
  ) =>
    h.ctx.app
      .get(TransactionRunner)
      .run((tx) =>
        h.ctx.app.get(RequestsApi, { strict: false }).releaseForTransfer(tx, { transferId, effectiveOn, rights }),
      );
  /** What the share of the right is on `day`: the months from the month of the day, less the days of that month used. */
  const shareFrom = (day: string): bigint => MONTHLY * BigInt(12 - monthOf(day) + 1) - usedBefore(MONTHLY, day);
  /** The revocation the grace ends in, opened by the system for the transfer, taken and completed by the IT Admin through the routes. */
  const revokedForTransfer = async (assignmentId: string, transferId: string): Promise<string> => {
    const actor: SystemActor = { kind: 'SYSTEM', correlationId: `transfer-grace:${transferId}` };
    const opened = await h.ctx.app.get(TransactionRunner).run((tx) =>
      h.ctx.app.get(LicensingApi).openRevocation(tx, actor, {
        assignmentId,
        source: 'TRANSFER',
        decision: { decidedRole: 'SYSTEM', referenceKind: 'DEPARTMENT_TRANSFER', referenceId: transferId },
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

  it('QĐ-111bg: gives back the months from the day the transfer takes effect, less the days used, with the reason and the reference of the transfer and the right', async () => {
    const id = await approved(await unit());
    const assignmentId = await grantedSeat(id);
    const transferId = randomUUID();

    const result = await releaseForTransfer(transferId, [{ assignmentId, provisioningType: 'K2' }]);

    const expected = shareFrom(h.today());
    const commitment = await commitmentOf(id);
    expect(commitment.released_minor).toBe(expected.toString());
    expect(await ledger(commitment.id)).toEqual([
      {
        amount_minor: expected.toString(),
        reason: 'TRANSFER_EFFECTIVE',
        reason_text: `transfer:${transferId}:assignment:${assignmentId}`,
      },
    ]);
    expect(result.released.map((item) => item.amountMinor)).toEqual([expected]);
    expect(result.released[0].currency).toMatch(/^[A-Z]{3}$/);
    const audit = await h.ctx.sql.query(
      `SELECT 1 FROM audit_events WHERE action = 'BUDGET_COMMITMENT.RELEASED' AND resource_id = $1 AND actor_kind = 'SYSTEM'`,
      [commitment.id],
    );
    expect(audit.rowCount).toBe(1);
  });

  it('gives back nothing the second time the same transfer is told, and creates no commitment for the new department', async () => {
    const id = await approved(await unit());
    const assignmentId = await grantedSeat(id);
    const transferId = randomUUID();
    await releaseForTransfer(transferId, [{ assignmentId, provisioningType: 'K2' }]);
    const before = await h.ctx.sql.query<{ n: string }>('SELECT count(*)::text AS n FROM budget_commitments');

    const again = await releaseForTransfer(transferId, [{ assignmentId, provisioningType: 'K2' }]);

    expect(again.released).toEqual([]);
    const commitment = await commitmentOf(id);
    expect(commitment.released_minor).toBe(shareFrom(h.today()).toString());
    expect(await ledger(commitment.id)).toHaveLength(1);
    expect((await h.ctx.sql.query<{ n: string }>('SELECT count(*)::text AS n FROM budget_commitments')).rows[0].n).toBe(
      before.rows[0].n,
    );
  });

  it('BLK-3: the revocation that follows the grace gives nothing back again, so the whole release is the part from the day the transfer took effect', async () => {
    const id = await approved(await unit());
    const assignmentId = await grantedSeat(id);
    const transferId = randomUUID();
    await releaseForTransfer(transferId, [{ assignmentId, provisioningType: 'K2' }]);

    const taskId = await revokedForTransfer(assignmentId, transferId);

    const commitment = await commitmentOf(id);
    expect(commitment.released_minor).toBe(shareFrom(h.today()).toString());
    const rows = await ledger(commitment.id);
    expect(rows.map((row) => row.reason)).toEqual(['TRANSFER_EFFECTIVE']);
    expect(rows.some((row) => row.reason_text === `revocationTask:${taskId}`)).toBe(false);
  });

  it('a revocation that no transfer asked for still gives back by the day, as before', async () => {
    const id = await approved(await unit());
    const assignmentId = await grantedSeat(id);
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

    const commitment = await commitmentOf(id);
    expect((await ledger(commitment.id)).map((row) => row.reason)).toEqual(['REVOKED']);
  });

  it('gives nothing back for a right whose price is not by the month (K4, K5), a right no request made, or a right of no commitment', async () => {
    const id = await approved(await unit());
    const assignmentId = await grantedSeat(id);
    const stranger = randomUUID();

    const noMonthly = await releaseForTransfer(randomUUID(), [{ assignmentId, provisioningType: 'K4' }]);
    const noRequest = await releaseForTransfer(randomUUID(), [{ assignmentId: stranger, provisioningType: 'K2' }]);
    const nothing = await releaseForTransfer(randomUUID(), []);

    expect([noMonthly.released, noRequest.released, nothing.released]).toEqual([[], [], []]);
    const commitment = await commitmentOf(id);
    expect(commitment).toMatchObject({ state: 'HELD', released_minor: '0' });
    expect(await ledger(commitment.id)).toEqual([]);
  });

  it('gives back nothing of a commitment whose price a month was never kept', async () => {
    const id = await approved(await unit());
    const assignmentId = await grantedSeat(id);
    await setSeatMonthly(id, null);

    const result = await releaseForTransfer(randomUUID(), [{ assignmentId, provisioningType: 'K2' }]);

    expect(result.released).toEqual([]);
    expect((await commitmentOf(id)).released_minor).toBe('0');
  });
});
