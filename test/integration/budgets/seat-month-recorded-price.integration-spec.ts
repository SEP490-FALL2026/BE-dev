import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { AuthenticatedPrincipal } from '../../../src/infrastructure/security/tokens/access-token-verifier.port';
import { PrismaService } from '../../../src/infrastructure/database/prisma.service';
import { TransactionRunner } from '../../../src/infrastructure/database/transaction-runner';
import { CommitmentMonthSettlementService } from '../../../src/modules/budgets/commitment/month/commitment-month-settlement.service';
import { BudgetsApi } from '../../../src/modules/budgets/public/budgets.api';
import { SeatMonthService } from '../../../src/modules/budgets/seat-month/seat-month.service';
import { InvoiceHarness } from '../../support/invoice-harness';
import type { Unit } from '../../support/spend-harness';

const h = new InvoiceHarness();
const M = 1_000_000;

/**
 * A month that was charged and is charged again (the creation of a review of the month recharges it) keeps the days and the commitments up to date, but a seat
 * that already has its row keeps the price that row recorded; a seat with no row yet takes the price of today (`Q-1`, the case D2 of the settlement of a month).
 * The price falls through `PATCH /subscription-lines/{id}`, the way an IT Admin changes it, and the commitment of the old seat settles the month with nothing
 * released (`MONTH_END` 0): the price that was applied is the price that was recorded.
 */
describe('a month charged again keeps the recorded price of the seats that have a row (integration; Q-1, case D2)', () => {
  const month = () => `${h.year}-10-01`;
  const service = () => h.ctx.app.get(SeatMonthService, { strict: false });
  let unit: Unit;
  let subscriptionId: string;
  let planId: string;

  /** The price of the line changes the way an IT Admin changes it: through the route of the line. */
  const setPrice = async (priceMinor: number): Promise<void> => {
    const line = (
      await h.ctx.sql.query<{ id: string; updated_at: Date }>(
        `SELECT id, updated_at FROM subscription_lines WHERE subscription_id = $1`,
        [subscriptionId],
      )
    ).rows[0];
    await request(h.server())
      .patch(`/api/v1/subscription-lines/${line.id}`)
      .set(h.as(h.it1))
      .send({
        monthlyUnitPrice: { amount: String(priceMinor), currency: 'VND' },
        expectedUpdatedAt: line.updated_at.toISOString(),
      })
      .expect(200);
  };
  const prisma = () => h.ctx.app.get(PrismaService, { strict: false });
  const actor = (): AuthenticatedPrincipal => ({
    subject: h.it1.appUserId,
    appUserId: h.it1.appUserId,
    sessionId: randomUUID(),
    employeeId: h.it1.employeeId,
    directRoles: ['FINANCE'],
    roles: ['FINANCE'],
  });
  /** The commitment of a request for one seat of the month at 500.000, with a seat of the pool granted for that request. */
  const commitmentForSeat = async (seatId: string): Promise<string> => {
    const requestId = await h.paidRequest(unit, planId);
    const check = await prisma().requestBudgetCheck.create({
      data: {
        organizationId: h.seed.organizationId,
        requestId,
        number: 1,
        trigger: 'SPEND_DECISION',
        route: 'SPEND_APPROVAL',
        staleCostEvidence: false,
        planLineOverdue: false,
        periodClosed: false,
        offPlan: false,
        outcome: 'WITHIN_BASE',
        blockReasons: [],
        costCenterId: unit.department.unitId,
        currency: 'VND',
        bindingTotalMinor: 500_000n,
      },
      select: { id: true },
    });
    const [held] = await h.ctx.app.get(TransactionRunner).run((tx) =>
      h.ctx.app.get(BudgetsApi).holdForRequest(tx, actor(), {
        organizationId: h.seed.organizationId,
        requestId,
        costCenterId: unit.department.unitId,
        snapshotCheckId: check.id,
        currency: 'VND',
        now: new Date(`${h.year}-10-15T01:00:00.000Z`),
        items: [{ year: h.year, amountMinor: 500_000n }],
        seatMonthlyMinor: 500_000n,
        months: [{ month: month(), seatCount: 1 }],
      }),
    );
    await prisma().provisioningTask.create({
      data: {
        organizationId: h.seed.organizationId,
        assignmentId: seatId,
        kind: 'GRANT',
        channel: 'MANUAL',
        status: 'COMPLETED',
        requestId,
        createdByAppUserId: h.it1.appUserId,
        claimedByAppUserId: h.it1.appUserId,
        claimedAt: new Date(),
        completedByAppUserId: h.it1.appUserId,
        completedAt: new Date(),
        evidence: 'done',
        maxAttempts: 3,
      },
    });

    return held.id;
  };
  const holder = async (code: string): Promise<string> => {
    const employeeId = await h.person(code);
    const open = `${h.year}-01-01`;
    await h.ctx.sql.query(
      `UPDATE employee_placements SET valid_from = '2020-01-01', valid_to = '${open}' WHERE employee_id = $1`,
      [employeeId],
    );
    await h.ctx.sql.query(
      `INSERT INTO employee_placements (id, organization_id, employee_id, department_id, valid_from, valid_to)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, NULL)`,
      [h.seed.organizationId, employeeId, unit.department.id, open],
    );

    return employeeId;
  };
  const seat = async (employeeId: string): Promise<string> => {
    const id = randomUUID();
    const validFrom = `${h.year}-03-01`;
    await h.ctx.sql.query(
      `INSERT INTO license_assignments (id, organization_id, kind, source, plan_id, subscription_id, employee_id,
         account_identifier, normalized_account_identifier, valid_from, valid_until, valid_from_basis, created_by_app_user_id, granted_on)
       VALUES ($1, $2, 'PERSONAL', 'REQUEST'::"AssignmentSource", $3, $4, $5, $6, $6, $7, NULL, 'ACTUAL', $8, $7)`,
      [
        id,
        h.seed.organizationId,
        planId,
        subscriptionId,
        employeeId,
        `${id.slice(0, 8)}@acme.vn`,
        validFrom,
        randomUUID(),
      ],
    );

    return id;
  };
  const rowsOf = async () =>
    (
      await h.ctx.sql.query<{ assignment_id: string; days: number; monthly_price_minor: string; amount_minor: string }>(
        `SELECT assignment_id, days, monthly_price_minor::text, amount_minor::text
           FROM seat_month_charges WHERE subscription_id = $1 AND month = $2 ORDER BY assignment_id`,
        [subscriptionId, month()],
      )
    ).rows;

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    unit = await h.departmentWithHead('P-RP1');
    await h.budgetFor(unit, { total: 100 * M });
    subscriptionId = await h.subscription(10, 'K2');
    planId = await h.planOf(subscriptionId);
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  it('keeps 500.000 for the seat that has its row after the price fell to 450.000 and the review recharges the month, and gives the seat with no row 450.000', async () => {
    await setPrice(500_000);
    const oldSeat = await seat(await holder('E-RP-OLD'));
    const commitmentId = await commitmentForSeat(oldSeat);
    await service().chargeMonth(month());
    expect(await rowsOf()).toEqual([
      { assignment_id: oldSeat, days: 31, monthly_price_minor: '500000', amount_minor: '500000' },
    ]);

    await setPrice(450_000);
    const newSeat = await seat(await holder('E-RP-NEW'));
    await request(h.server())
      .post('/api/v1/budget-review-periods')
      .set(h.as(h.finance))
      .send({ year: h.year, month: 10 })
      .expect(201);

    const rows = await rowsOf();
    expect(rows.find((row) => row.assignment_id === oldSeat)).toEqual({
      assignment_id: oldSeat,
      days: 31,
      monthly_price_minor: '500000',
      amount_minor: '500000',
    });
    expect(rows.find((row) => row.assignment_id === newSeat)).toEqual({
      assignment_id: newSeat,
      days: 31,
      monthly_price_minor: '450000',
      amount_minor: '450000',
    });
    expect(rows).toHaveLength(2);

    // The month was charged at 500.000 and is settled at what was applied: the fall of the price releases nothing (`MONTH_END` 0).
    const settled = await h.ctx.app
      .get(CommitmentMonthSettlementService, { strict: false })
      .settleMonth(h.seed.organizationId, month(), new Date(`${h.year}-11-15T01:00:00.000Z`));
    const commitment = await prisma().budgetCommitment.findUniqueOrThrow({
      where: { id: commitmentId },
      select: { appliedMinor: true, releasedMinor: true },
    });
    expect(settled.releasedMinor).toBe(0n);
    expect(commitment).toEqual({ appliedMinor: 500_000n, releasedMinor: 0n });
    expect(await prisma().budgetCommitmentRelease.count({ where: { commitmentId, reason: 'MONTH_END' } })).toBe(0);
  });
});
