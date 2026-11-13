import request from 'supertest';
import { addDays } from '../../../src/core/business-date';
import { graceOf } from '../../../src/modules/personnel/transfer-grace/transfer-grace.policy';
import { TransferRevocationService } from '../../../src/modules/personnel/transfer-grace/transfer-revocation.service';
import type { ApiAccount } from '../../support/api-accounts';
import { OffboardingHarness } from '../../support/offboarding-harness';
import { handOthersToSecondItAdmin } from '../../support/second-it-admin';
import type { Unit } from '../../support/spend-harness';

const h = new OffboardingHarness();
const M = 1_000_000;
const MONTHLY = BigInt(M);
const NONE: ReadonlySet<string> = new Set();

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
  reason: string;
  amount_minor: string;
  reason_text: string | null;
}

/**
 * `MF3-C.1` and the rule of the ledger (`MF3-B-R1`/`R2`, `QĐ-111bg`, D-86, D-87), end to end: the revocation the SWEEPER opens when the grace ends, taken
 * and completed by the IT Admin through the routes, gives the commitment of the old right back exactly once — nothing again when the day of the transfer
 * gave it back, and once, from the day the right ends, when it did not (a transfer from before the release). On real PostgreSQL.
 */
describe('the revocation the sweep opens and the commitment of the old right (integration, real PostgreSQL)', () => {
  let plan: string;
  let subscriptionId: string;
  let it2: ApiAccount;
  let counter = 0;

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    subscriptionId = await h.subscription(40, 'K2');
    plan = await h.planOf(subscriptionId);
    it2 = await handOthersToSecondItAdmin(h);
  }, 300000);

  afterAll(async () => {
    await h.stop();
  });

  const at = (day: string) => new Date(`${day}T12:00:00Z`);
  const afterGrace = (): string =>
    addDays(
      graceOf({
        effectiveOn: h.today(),
        notedOn: h.today(),
        workingDays: 5,
        reminderWorkingDays: 2,
        nonWorkingDates: NONE,
      }).endsOn,
      1,
    );
  const unit = async (): Promise<Unit> => {
    counter += 1;
    const u = await h.departmentWithHead(`P-GL${counter}`);
    await h.budgetFor(u, { total: 500 * M });
    await h.ctx.sql.query(`UPDATE employee_placements SET valid_from = '2026-01-05' WHERE employee_id = $1`, [
      u.member.employeeId,
    ]);

    return u;
  };
  const setSeatMonthly = (requestId: string, minor: bigint | null) =>
    h.ctx.sql.query(`UPDATE budget_commitments SET seat_monthly_minor = $2 WHERE request_id = $1`, [
      requestId,
      minor === null ? null : minor.toString(),
    ]);
  /** A request for the member approved for the whole year at 1 000 000 a month, with no end, and the seat its grant made. */
  const seatOfNewRequest = async (u: Unit): Promise<{ requestId: string; assignmentId: string }> => {
    const requestId = await h.waitingForApprover(u, plan, { amount: 12 * M });
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
  const ledger = async (requestId: string): Promise<LedgerRow[]> =>
    (
      await h.ctx.sql.query<LedgerRow>(
        `SELECT r.reason::text, r.amount_minor::text, r.reason_text FROM budget_commitment_releases r
           JOIN budget_commitments c ON c.id = r.commitment_id WHERE c.request_id = $1 ORDER BY r.released_at, r.id`,
        [requestId],
      )
    ).rows;
  const releasedOf = async (requestId: string): Promise<string> =>
    (
      await h.ctx.sql.query<{ released_minor: string }>(
        'SELECT released_minor::text FROM budget_commitments WHERE request_id = $1',
        [requestId],
      )
    ).rows[0].released_minor;
  /** The sweep opens the revocation of the grace; the IT Admin of the new department takes and completes it through the routes. */
  const swept = async (assignmentId: string): Promise<string> => {
    await h.ctx.app.get(TransferRevocationService, { strict: false }).sweep(at(afterGrace()));
    const task = (
      await h.ctx.sql.query<{ id: string }>(
        `SELECT id FROM provisioning_tasks WHERE assignment_id = $1 AND kind = 'REVOKE' AND revocation_source = 'TRANSFER'`,
        [assignmentId],
      )
    ).rows[0].id;
    await h.claim(task, it2).expect(200);
    await request(h.server())
      .post(`/api/v1/provisioning-tasks/${task}/revocation-completion`)
      .set(h.as(it2))
      .send({ completion: 'ACCOUNT_REMOVED', evidence: 'Removed from the workspace' })
      .expect(200);

    return task;
  };
  const endedOn = async (assignmentId: string): Promise<string> =>
    (
      await h.ctx.sql.query<{ valid_until: string }>(
        `SELECT to_char(valid_until, 'YYYY-MM-DD') AS valid_until FROM license_assignments WHERE id = $1`,
        [assignmentId],
      )
    ).rows[0].valid_until;

  it('QĐ-111bg, BLK-3 end to end: the sweep of the grace takes the right away and the commitment, given back the day of the transfer, is not given back again', async () => {
    const u = await unit();
    const dest = await h.departmentWithHead(`P-GL${counter}-DEST`);
    await h.setItAdminInCharge(dest.department, { employeeId: it2.employeeId, account: it2 });
    const { requestId, assignmentId } = await seatOfNewRequest(u);
    const wire = await h.moveToday(u.member, dest.department);
    const afterTransfer = await ledger(requestId);
    expect(afterTransfer.map((row) => row.reason)).toEqual(['TRANSFER_EFFECTIVE']);

    await swept(assignmentId);

    expect(await ledger(requestId)).toEqual(afterTransfer);
    expect(afterTransfer[0].reason_text).toBe(`transfer:${wire.id}:assignment:${assignmentId}`);
    expect(await releasedOf(requestId)).toBe(shareFrom(h.today()).toString());
  }, 240_000);

  it('D-87 end to end: a transfer from before the release (no release the day of the transfer) gives the commitment back once, from the day the sweep ends the right', async () => {
    const u = await unit();
    const dest = await h.departmentWithHead(`P-GL${counter}-DEST`);
    await h.setItAdminInCharge(dest.department, { employeeId: it2.employeeId, account: it2 });
    const { requestId, assignmentId } = await seatOfNewRequest(u);
    await h.moveToday(u.member, dest.department);
    // The migration of m-17 gave this transfer a grace and gave nothing back: take the release of the day away, as the ledger had it before.
    await h.ctx.sql.query('BEGIN');
    try {
      await h.ctx.sql.query('ALTER TABLE budget_commitment_releases DISABLE TRIGGER USER');
      await h.ctx.sql.query('ALTER TABLE budget_commitments DISABLE TRIGGER USER');
      await h.ctx.sql.query(
        `DELETE FROM budget_commitment_releases WHERE reason = 'TRANSFER_EFFECTIVE'
            AND commitment_id IN (SELECT id FROM budget_commitments WHERE request_id = $1)`,
        [requestId],
      );
      await h.ctx.sql.query('UPDATE budget_commitments SET released_minor = 0 WHERE request_id = $1', [requestId]);
      await h.ctx.sql.query('ALTER TABLE budget_commitment_releases ENABLE TRIGGER USER');
      await h.ctx.sql.query('ALTER TABLE budget_commitments ENABLE TRIGGER USER');
      await h.ctx.sql.query('COMMIT');
    } catch (error) {
      await h.ctx.sql.query('ROLLBACK');
      throw error;
    }
    expect(await ledger(requestId)).toEqual([]);

    const task = await swept(assignmentId);

    const rows = await ledger(requestId);
    expect(rows).toEqual([
      {
        reason: 'REVOKED',
        amount_minor: shareFrom(await endedOn(assignmentId)).toString(),
        reason_text: `revocationTask:${task}`,
      },
    ]);
  }, 240_000);
});
