import { randomUUID } from 'node:crypto';
import { TransactionRunner } from '../../../src/infrastructure/database/transaction-runner';
import { BudgetsApi } from '../../../src/modules/budgets/public/budgets.api';
import type { RevocationTaskFacts } from '../../../src/modules/licensing/public/licensing.types';
import { SeatReleaseService } from '../../../src/modules/requests/grant/seat-release.service';
import { InvoiceHarness } from '../../support/invoice-harness';

const h = new InvoiceHarness();
const M = 1_000_000;
const MONTH = 500_000n;

interface ReleaseRow {
  amount_minor: string;
  reason: string;
}

/**
 * A right that ends early after the invoices of its periods (`PI-2`, `QĐ-111x`, `FR-5.8`(3); US-12-17 AC-13), on real PostgreSQL: `R31` is a `K1`
 * right of 3 months from 01/09, 500 000 a month, so its commitment is 1 500 000. Finance signed the invoices of the periods 1/3 and 2/3, so 500 000
 * is still held for the period 3/3; the right of `E1` is taken back on 20/10. What it holds for the period that will not be paid goes back, and
 * what the signed invoices spent does not.
 */
describe('the commitment of a K1 right that ends early goes back for the period that is not paid (US-12-17 AC-13)', () => {
  let plan: string;
  let vendorId: string;
  let counter = 0;

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    plan = await h.planOf(await h.subscription(10, 'K1'));
    vendorId = (await h.vendorOf(plan)).id;
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  /** The request approved for 3 months at 500 000, whose commitment keeps the price of one seat a month, and the department that holds it. */
  const approved = async () => {
    const unit = await h.departmentWithHead(`P-AC13-${(counter += 1)}`);
    await h.budgetFor(unit, { total: 100 * M });
    const requestId = await h.waitingForApprover(unit, plan, { amount: 3 * Number(MONTH) });
    await h.ctx.sql.query(
      `UPDATE access_requests SET amount_months = 3, price_kind = 'RECURRING', term_months = 3, expected_end_date = NULL, budget_year = $2 WHERE id = $1`,
      [requestId, h.year],
    );
    await h.decideSpend(requestId, { decision: 'APPROVE' }, h.boss.account).expect(200);
    await h.ctx.sql.query(`UPDATE budget_commitments SET seat_monthly_minor = $2 WHERE request_id = $1`, [
      requestId,
      MONTH.toString(),
    ]);

    return { unit, requestId };
  };
  const facts = async (costCenterId: string) =>
    (await h.ctx.app.get(BudgetsApi, { strict: false }).yearFacts(costCenterId, [h.year])).get(h.year);
  const commitmentOf = async (requestId: string) =>
    (
      await h.ctx.sql.query<{ id: string; released_minor: string; applied_minor: string }>(
        `SELECT id, released_minor::text, applied_minor::text FROM budget_commitments WHERE request_id = $1`,
        [requestId],
      )
    ).rows[0];
  const ledger = async (commitmentId: string) =>
    (
      await h.ctx.sql.query<ReleaseRow>(
        `SELECT amount_minor::text, reason::text FROM budget_commitment_releases WHERE commitment_id = $1 ORDER BY released_at, id`,
        [commitmentId],
      )
    ).rows;
  /** The revocation of the `K1` right completed on 20/10, the period of October paid through the 31st. */
  const revokedOn20October = (requestId: string): RevocationTaskFacts => ({
    id: randomUUID(),
    assignmentId: randomUUID(),
    employeeId: randomUUID(),
    planId: plan,
    status: 'COMPLETED',
    completed: {
      grantRequestId: requestId,
      chainAssignmentIds: [],
      grantedStartDate: `${h.year}-09-01`,
      grantedEndDate: `${h.year}-11-30`,
      provisioningType: 'K1',
      endedOn: `${h.year}-10-20`,
      paidThroughOn: `${h.year}-10-31`,
      sources: ['MANAGER_NOT_NEEDED'],
      k1Checklist: null,
    },
  });
  const afterRevocation = (task: RevocationTaskFacts) =>
    h.ctx.app
      .get(TransactionRunner)
      .run((tx) => h.ctx.app.get(SeatReleaseService, { strict: false }).afterRevocation(tx, task, new Date()));

  it('gives back the 500 000 held for the period 3/3, and the Cost Center has that much more left', async () => {
    const { unit, requestId } = await approved();
    for (const month of ['09', '10']) {
      await h.recordPurchase(vendorId, {
        requestId,
        chargedCostCenterId: unit.department.unitId,
        issuedOn: `${h.year}-${month}-03`,
        serviceMonth: `${h.year}-${month}-01`,
        netMinor: MONTH,
      });
    }
    expect(await facts(unit.department.unitId)).toMatchObject({ heldMinor: MONTH, spentMinor: 2n * MONTH });

    await afterRevocation(revokedOn20October(requestId));

    const commitment = await commitmentOf(requestId);
    expect(commitment).toMatchObject({ released_minor: MONTH.toString(), applied_minor: (2n * MONTH).toString() });
    expect(await ledger(commitment.id)).toEqual([{ amount_minor: MONTH.toString(), reason: 'REVOKED' }]);
    expect(await facts(unit.department.unitId)).toMatchObject({ heldMinor: 0n, spentMinor: 2n * MONTH });
  });

  it('gives back nothing a second time when the same revocation is told again', async () => {
    const { unit, requestId } = await approved();
    for (const month of ['09', '10']) {
      await h.recordPurchase(vendorId, {
        requestId,
        chargedCostCenterId: unit.department.unitId,
        issuedOn: `${h.year}-${month}-03`,
        serviceMonth: `${h.year}-${month}-01`,
        netMinor: MONTH,
      });
    }
    const task = revokedOn20October(requestId);

    await afterRevocation(task);
    await afterRevocation(task);

    expect((await commitmentOf(requestId)).released_minor).toBe(MONTH.toString());
    expect(await ledger((await commitmentOf(requestId)).id)).toHaveLength(1);
  });
});
