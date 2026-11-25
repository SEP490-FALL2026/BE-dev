import { randomUUID } from 'node:crypto';
import type { BusinessDate } from '../../../src/core/business-date';
import { monthCostBefore, releaseOnLateGrant, releaseOnRevocation } from '../../../src/core/seat-month-cost';
import type { AuthenticatedPrincipal } from '../../../src/infrastructure/security/tokens/access-token-verifier.port';
import { PrismaService } from '../../../src/infrastructure/database/prisma.service';
import { TransactionRunner } from '../../../src/infrastructure/database/transaction-runner';
import { CommitmentService } from '../../../src/modules/budgets/commitment/commitment.service';
import { CommitmentMonthRepo } from '../../../src/modules/budgets/commitment/month/commitment-month.repo';
import { CommitmentMonthSettlementService } from '../../../src/modules/budgets/commitment/month/commitment-month-settlement.service';
import { BudgetsApi } from '../../../src/modules/budgets/public/budgets.api';
import type { MonthSliceInput } from '../../../src/modules/budgets/public/budgets.types';
import { BudgetReviewFiguresService } from '../../../src/modules/budgets/review/budget-review-figures.service';
import { SeatMonthRepo } from '../../../src/modules/budgets/seat-month/seat-month.repo';
import { SeatMonthService } from '../../../src/modules/budgets/seat-month/seat-month.service';
import { Barrier } from '../../support/concurrency-harness';
import { InvoiceHarness } from '../../support/invoice-harness';
import type { Unit } from '../../support/spend-harness';

const h = new InvoiceHarness();
const STD = 500_000n;
const NOW = new Date('2026-12-15T01:00:00.000Z');

describe('K2 monthly commitment settlement & year-end sweep (integration; W3-07 cases A..L)', () => {
  let seq = 0;
  const budgets = () => h.ctx.app.get(BudgetsApi, { strict: false });
  const settlements = () => h.ctx.app.get(CommitmentMonthSettlementService, { strict: false });
  const slices = () => h.ctx.app.get(CommitmentMonthRepo, { strict: false });
  const seatMonths = () => h.ctx.app.get(SeatMonthService, { strict: false });
  const seatMonthRepo = () => h.ctx.app.get(SeatMonthRepo, { strict: false });
  const commitments = () => h.ctx.app.get(CommitmentService, { strict: false });
  const reviewFigures = () => h.ctx.app.get(BudgetReviewFiguresService, { strict: false });
  const runner = () => h.ctx.app.get(TransactionRunner, { strict: false });
  const prisma = () => h.ctx.app.get(PrismaService, { strict: false });

  const actor = (): AuthenticatedPrincipal => ({
    subject: h.it1.appUserId,
    appUserId: h.it1.appUserId,
    sessionId: randomUUID(),
    employeeId: h.it1.employeeId,
    directRoles: ['FINANCE'],
    roles: ['FINANCE'],
  });

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  async function newUnitWithBudget(year: number = h.year): Promise<Unit> {
    seq += 1;
    const unit = await h.departmentWithHead(`CM-${seq}`);
    await h.budgetFor(unit, { total: 100_000_000, year });
    await h.setItAdminInCharge(unit.department, { employeeId: h.it1.employeeId, account: h.it1 });
    return unit;
  }

  async function newK2Pool(priceMinor = STD): Promise<{ subscriptionId: string; planId: string }> {
    const subscriptionId = await h.subscription(20, 'K2');
    const planId = await h.planOf(subscriptionId);
    await h.ctx.sql.query(
      `UPDATE subscriptions
          SET unit_price_minor = $2,
              monthly_unit_price_minor = $2,
              price_reporting_minor = $2,
              start_date = $3::date,
              end_date = $4::date
        WHERE id = $1`,
      [subscriptionId, priceMinor.toString(), `${h.year}-01-01`, `${h.year}-12-31`],
    );
    return { subscriptionId, planId };
  }

  async function staffSinceYearStart(unit: Unit, code: string): Promise<string> {
    const employeeId = await h.person(code);
    const open = `${h.year}-01-01`;
    await h.ctx.sql.query(
      `BEGIN;
       UPDATE employee_placements SET valid_from = '2020-01-01', valid_to = '${open}' WHERE employee_id = '${employeeId}';
       INSERT INTO employee_placements (id, organization_id, employee_id, department_id, valid_from, valid_to)
       VALUES (gen_random_uuid(), '${h.seed.organizationId}', '${employeeId}', '${unit.department.id}', '${open}', NULL);
       COMMIT;`,
    );
    return employeeId;
  }

  async function setPoolPrice(subscriptionId: string, priceMinor: bigint): Promise<void> {
    await h.ctx.sql.query(
      `UPDATE subscriptions
          SET unit_price_minor = $2, monthly_unit_price_minor = $2, price_reporting_minor = $2
        WHERE id = $1`,
      [subscriptionId, priceMinor.toString()],
    );
  }

  async function createSnapshotCheck(requestId: string, costCenterId: string, amountMinor: bigint): Promise<string> {
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
        costCenterId,
        currency: 'VND',
        bindingTotalMinor: amountMinor,
      },
      select: { id: true },
    });
    return check.id;
  }

  async function createHeldK2(input: {
    unit: Unit;
    planId: string;
    year: number;
    amountMinor: bigint;
    months: readonly MonthSliceInput[];
    origin?: 'APPROVAL' | 'YEAR_START';
    now?: Date;
  }): Promise<{ requestId: string; commitmentId: string }> {
    const at = input.now ?? NOW;
    const requestId = await h.paidRequest(input.unit, input.planId);
    if (input.origin === 'YEAR_START') {
      const res = await runner().run((tx) =>
        budgets().holdYearStart(tx, {
          organizationId: h.seed.organizationId,
          year: input.year,
          now: at,
          items: [
            {
              requestId,
              costCenterId: input.unit.department.unitId,
              currency: 'VND',
              amountMinor: input.amountMinor,
              seatMonthlyMinor: STD,
              months: input.months,
            },
          ],
        }),
      );
      return { requestId, commitmentId: res.created[0].commitmentId };
    }
    const snapshotCheckId = await createSnapshotCheck(requestId, input.unit.department.unitId, input.amountMinor);
    const [held] = await runner().run((tx) =>
      budgets().holdForRequest(tx, actor(), {
        organizationId: h.seed.organizationId,
        requestId,
        costCenterId: input.unit.department.unitId,
        snapshotCheckId,
        currency: 'VND',
        now: at,
        items: [{ year: input.year, amountMinor: input.amountMinor }],
        seatMonthlyMinor: STD,
        months: input.months,
      }),
    );
    return { requestId, commitmentId: held.id };
  }

  async function addPoolSeat(input: {
    subscriptionId: string;
    planId: string;
    employeeId: string;
    requestId: string;
    validFrom: BusinessDate;
    grantedOn?: BusinessDate;
    validUntil?: BusinessDate | null;
  }): Promise<string> {
    const assignment = await prisma().licenseAssignment.create({
      data: {
        organizationId: h.seed.organizationId,
        kind: 'PERSONAL',
        source: 'REQUEST',
        planId: input.planId,
        subscriptionId: input.subscriptionId,
        employeeId: input.employeeId,
        accountIdentifier: `${randomUUID().slice(0, 8)}@acme.vn`,
        normalizedAccountIdentifier: `${randomUUID().slice(0, 8)}@acme.vn`,
        validFrom: new Date(`${input.validFrom}T00:00:00.000Z`),
        validFromBasis: 'ACTUAL',
        validUntil: input.validUntil ? new Date(`${input.validUntil}T00:00:00.000Z`) : null,
        grantedOn: new Date(`${input.grantedOn ?? input.validFrom}T00:00:00.000Z`),
        createdByAppUserId: h.it1.appUserId,
      },
      select: { id: true },
    });
    await prisma().provisioningTask.create({
      data: {
        organizationId: h.seed.organizationId,
        assignmentId: assignment.id,
        kind: 'GRANT',
        channel: 'MANUAL',
        status: 'COMPLETED',
        requestId: input.requestId,
        createdByAppUserId: h.it1.appUserId,
        claimedByAppUserId: h.it1.appUserId,
        claimedAt: NOW,
        completedByAppUserId: h.it1.appUserId,
        completedAt: NOW,
        evidence: 'done',
        maxAttempts: 3,
      },
    });
    return assignment.id;
  }

  async function commitmentSnapshot(commitmentId: string) {
    const row = await prisma().budgetCommitment.findUniqueOrThrow({
      where: { id: commitmentId },
      select: { amountMinor: true, releasedMinor: true, appliedMinor: true, state: true },
    });
    const releases = await prisma().budgetCommitmentRelease.findMany({
      where: { commitmentId },
      select: { reason: true, reasonText: true, amountMinor: true },
      orderBy: { releasedAt: 'asc' },
    });
    const monthRows = await slices().ofCommitment(commitmentId);
    return { row, releases, monthRows };
  }

  const monthsRange = (year: number, from: number, to: number): MonthSliceInput[] =>
    Array.from({ length: to - from + 1 }, (_, i) => ({
      month: `${year}-${String(from + i).padStart(2, '0')}-01`,
      seatCount: 1,
    }));

  it('Ca A & Ca J: LATE_GRANT + seat-month application + MONTH_END settlement keep Σ(applied+released) = amount', async () => {
    const unit = await newUnitWithBudget(h.year);
    const { subscriptionId, planId } = await newK2Pool(STD);
    const personId = await staffSinceYearStart(unit, 'STAFF-A');
    const nov = `${h.year}-11-01`;
    const dec = `${h.year}-12-01`;
    const { requestId, commitmentId } = await createHeldK2({
      unit,
      planId,
      year: h.year,
      amountMinor: 1_000_000n,
      months: monthsRange(h.year, 11, 12),
    });

    const lateNov = monthCostBefore(STD, `${h.year}-11-21`);
    await runner().run((tx) =>
      budgets().releaseForRequest(tx, {
        requestId,
        reason: 'LATE_GRANT',
        reference: 'grant-a',
        amounts: [{ year: h.year, amountMinor: lateNov, months: [{ month: nov, amountMinor: lateNov }] }],
        now: NOW,
      }),
    );
    await addPoolSeat({
      subscriptionId,
      planId,
      employeeId: personId,
      requestId,
      validFrom: `${h.year}-11-21`,
    });
    await seatMonths().chargeMonth(nov, NOW);

    const s11 = await settlements().settleMonth(h.seed.organizationId, nov, NOW);
    expect(s11.releasedMinor).toBe(0n);
    let snap = await commitmentSnapshot(commitmentId);
    expect(snap.row).toMatchObject({ appliedMinor: 166_667n, releasedMinor: 333_333n, state: 'HELD' });
    expect(snap.releases).toHaveLength(1);

    await settlements().settleMonth(h.seed.organizationId, dec, NOW);
    snap = await commitmentSnapshot(commitmentId);
    expect(snap.row.appliedMinor + snap.row.releasedMinor).toBe(1_000_000n);
    expect(snap.row.state).toBe('EXPENSED');
  });

  it('Ca B & Ca G: YEAR_START revocation (15/01) and mid-month transfer (26/03) leave exact applied and settle 0đ', async () => {
    const unit = await newUnitWithBudget(h.year);
    const { subscriptionId, planId } = await newK2Pool(STD);
    const pBId = await staffSinceYearStart(unit, 'STAFF-B');
    const cB = await createHeldK2({
      unit,
      planId,
      year: h.year,
      amountMinor: 6_000_000n,
      months: monthsRange(h.year, 1, 12),
      origin: 'YEAR_START',
    });

    const jan = `${h.year}-01-01`;
    const revokedMonths = [
      { month: jan, amountMinor: STD - monthCostBefore(STD, `${h.year}-01-15`) },
      ...monthsRange(h.year, 2, 12).map((m) => ({ month: m.month, amountMinor: STD })),
    ];
    await runner().run((tx) =>
      budgets().releaseForRequest(tx, {
        requestId: cB.requestId,
        reason: 'REVOKED',
        reference: 'rev-b',
        amounts: [
          {
            year: h.year,
            amountMinor: releaseOnRevocation({ monthlyMinor: STD, endsOn: `${h.year}-01-15`, lastMonth: 12 }),
            months: revokedMonths,
          },
        ],
        now: NOW,
      }),
    );
    await addPoolSeat({
      subscriptionId,
      planId,
      employeeId: pBId,
      requestId: cB.requestId,
      validFrom: `${h.year}-01-01`,
      validUntil: `${h.year}-01-15`,
    });
    await seatMonths().chargeMonth(jan, NOW);
    await settlements().settleMonth(h.seed.organizationId, jan, NOW);

    const snapB = await commitmentSnapshot(cB.commitmentId);
    expect(snapB.row).toMatchObject({ appliedMinor: 225_806n, releasedMinor: 5_774_194n, state: 'EXPENSED' });
    expect(snapB.row.appliedMinor + snapB.row.releasedMinor).toBe(6_000_000n);

    const cG = await createHeldK2({
      unit,
      planId,
      year: h.year,
      amountMinor: 6_000_000n,
      months: monthsRange(h.year, 1, 12),
      origin: 'YEAR_START',
    });
    const mar = `${h.year}-03-01`;
    await runner().run((tx) =>
      budgets().releaseForRequest(tx, {
        requestId: cG.requestId,
        reason: 'TRANSFER_EFFECTIVE',
        reference: 'tr-g',
        amounts: [
          {
            year: h.year,
            amountMinor: releaseOnRevocation({ monthlyMinor: STD, endsOn: `${h.year}-03-26`, lastMonth: 12 }),
            months: [
              { month: mar, amountMinor: STD - monthCostBefore(STD, `${h.year}-03-26`) },
              ...monthsRange(h.year, 4, 12).map((m) => ({ month: m.month, amountMinor: STD })),
            ],
          },
        ],
        now: NOW,
      }),
    );
    const snapG = await commitmentSnapshot(cG.commitmentId);
    expect(snapG.monthRows[2].releasedMinor).toBe(96_774n);
    await settlements().settleMonth(h.seed.organizationId, mar, NOW);
  });

  it("Ca C, C', F, F6 & Q-G: December MONTH_END + legacy K2 YEAR_END_SEAT_MONTHS feed January priorYearReleasedMinor", async () => {
    const priorYear = h.year - 1;
    const priorNow = new Date(`${priorYear}-12-01T01:00:00.000Z`);
    const unit = await newUnitWithBudget(h.year);
    await h.ctx.sql.query(
      `INSERT INTO budget_versions (id, organization_id, cost_center_id, year, number, kind, state, origin, base_minor, reserve_minor, total_minor,
          currency, created_by_employee_id, sent_by_employee_id, sent_at)
       VALUES (gen_random_uuid(), $1, $2, $3, 1, 'INITIAL', 'APPROVED', 'ADJUSTMENT'::"BudgetVersionOrigin", 100000000, 0, 100000000, 'VND', $4, $4, now())`,
      [h.seed.organizationId, unit.department.unitId, priorYear, h.finance.employeeId],
    );
    const k2 = await newK2Pool(STD);
    const k1Plan = await h.planOf(await h.subscription(10, 'K1'));
    const k4Plan = await h.planOf(await h.subscription(10, 'K4'));

    const cC = await createHeldK2({
      unit,
      planId: k2.planId,
      year: priorYear,
      amountMinor: 500_000n,
      months: [{ month: `${priorYear}-12-01`, seatCount: 1 }],
      now: priorNow,
    });
    const reqLegacyK2 = await h.paidRequest(unit, k2.planId);
    const legacyCheckId = await createSnapshotCheck(reqLegacyK2, unit.department.unitId, 1_000_000n);
    const [legacyK2] = await runner().run((tx) =>
      budgets().holdForRequest(tx, actor(), {
        organizationId: h.seed.organizationId,
        requestId: reqLegacyK2,
        costCenterId: unit.department.unitId,
        snapshotCheckId: legacyCheckId,
        currency: 'VND',
        now: priorNow,
        items: [{ year: priorYear, amountMinor: 1_000_000n }],
        seatMonthlyMinor: STD,
      }),
    );
    await prisma().budgetCommitment.update({
      where: { id: legacyK2.id },
      data: { appliedMinor: 700_000n },
    });
    const reqK1 = await h.paidRequest(unit, k1Plan);
    const k1CheckId = await createSnapshotCheck(reqK1, unit.department.unitId, 500_000n);
    const [k1Row] = await runner().run((tx) =>
      budgets().holdForRequest(tx, actor(), {
        organizationId: h.seed.organizationId,
        requestId: reqK1,
        costCenterId: unit.department.unitId,
        snapshotCheckId: k1CheckId,
        currency: 'VND',
        now: priorNow,
        items: [{ year: priorYear, amountMinor: 500_000n }],
      }),
    );
    const reqK4 = await h.paidRequest(unit, k4Plan);
    const k4CheckId = await createSnapshotCheck(reqK4, unit.department.unitId, 500_000n);
    const [k4Row] = await runner().run((tx) =>
      budgets().holdForRequest(tx, actor(), {
        organizationId: h.seed.organizationId,
        requestId: reqK4,
        costCenterId: unit.department.unitId,
        snapshotCheckId: k4CheckId,
        currency: 'VND',
        now: priorNow,
        items: [{ year: priorYear, amountMinor: 500_000n }],
      }),
    );

    await settlements().runPass({
      organizationId: h.seed.organizationId,
      today: `${h.year}-01-10`,
      now: NOW,
      readyMonths: [`${priorYear}-12-01`],
      priorDecemberReady: true,
    });
    expect((await commitmentSnapshot(cC.commitmentId)).row.state).toBe('RELEASED');
    expect((await commitmentSnapshot(legacyK2.id)).row).toMatchObject({
      releasedMinor: 300_000n,
      state: 'EXPENSED',
    });
    expect((await commitmentSnapshot(k1Row.id)).row.state).toBe('HELD');
    expect((await commitmentSnapshot(k4Row.id)).row.state).toBe('HELD');

    const lines = await runner().run((tx) => reviewFigures().linesOf(tx, h.year, 1, 'VND'));
    const line = lines.find((l) => l.costCenterId === unit.department.unitId);
    expect(line?.priorYearReleasedMinor).toBe(800_000n);
  });

  it('Ca D, D2, E, K, F3, L & I: price drop/rise, reversal re-settle, remainder reverse spread, and draft gate', async () => {
    const unit = await newUnitWithBudget(h.year);
    const { subscriptionId, planId } = await newK2Pool(STD);
    const personId = await staffSinceYearStart(unit, 'STAFF-D');
    const cD = await createHeldK2({
      unit,
      planId,
      year: h.year,
      amountMinor: 1_500_000n,
      months: monthsRange(h.year, 2, 4),
    });
    await addPoolSeat({
      subscriptionId,
      planId,
      employeeId: personId,
      requestId: cD.requestId,
      validFrom: `${h.year}-02-01`,
      validUntil: `${h.year}-04-30`,
    });
    await seatMonths().chargeMonth(`${h.year}-02-01`, NOW);
    await setPoolPrice(subscriptionId, 450_000n);
    await seatMonths().chargeMonth(`${h.year}-03-01`, NOW);
    const s3 = await settlements().settleMonth(h.seed.organizationId, `${h.year}-03-01`, NOW);
    expect(s3.releasedMinor).toBe(50_000n);

    // Ca K & F3: re-charge month 3 at 350k -> real SeatMonthSubscriptionService.giveBack reverses 100k on slice 3 -> next settle releases 100k, third pass = 0
    await setPoolPrice(subscriptionId, 350_000n);
    await seatMonths().chargeMonth(`${h.year}-03-01`, NOW);
    expect((await settlements().settleMonth(h.seed.organizationId, `${h.year}-03-01`, NOW)).releasedMinor).toBe(
      100_000n,
    );
    expect((await settlements().settleMonth(h.seed.organizationId, `${h.year}-03-01`, NOW)).releasedMinor).toBe(0n);

    // Ca E: price rise 500k -> 550k on month 4 still caps applied at 500k share
    await setPoolPrice(subscriptionId, 550_000n);
    await seatMonths().chargeMonth(`${h.year}-04-01`, NOW);
    expect((await commitmentSnapshot(cD.commitmentId)).monthRows[2].appliedMinor).toBe(500_000n);

    // Ca L: releaseRemainder spreads from month 12 backwards
    const cL = await createHeldK2({
      unit,
      planId,
      year: h.year,
      amountMinor: 1_000_000n,
      months: monthsRange(h.year, 11, 12),
    });
    await prisma().accessRequest.update({ where: { id: cL.requestId }, data: { state: 'COMPLETED' } });
    await commitments().releaseRemainder(actor(), cL.commitmentId, 'Ended early');
    const snapL = await commitmentSnapshot(cL.commitmentId);
    expect(snapL.row.state).toBe('RELEASED');
    expect(snapL.monthRows.map((m) => m.releasedMinor)).toEqual([500_000n, 500_000n]);

    // Ca I: DRAFT K2 and ACTIVE K2 without seats in 05 do not block; ACTIVE K2 with seat in 05 lacking run blocks until charged
    await h.draftSubscription('K2');
    await newK2Pool(STD);
    const activeNoRun = await newK2Pool(STD);
    const reqI = await h.paidRequest(unit, activeNoRun.planId);
    expect(await seatMonths().isMonthSettlingReady(h.seed.organizationId, `${h.year}-05-01`)).toBe(true);

    await addPoolSeat({
      subscriptionId: activeNoRun.subscriptionId,
      planId: activeNoRun.planId,
      employeeId: await staffSinceYearStart(unit, 'STAFF-I'),
      requestId: reqI,
      validFrom: `${h.year}-05-01`,
    });
    expect(await seatMonths().isMonthSettlingReady(h.seed.organizationId, `${h.year}-05-01`)).toBe(false);
    await seatMonths().chargeMonth(`${h.year}-05-01`, NOW);
    expect(await seatMonths().isMonthSettlingReady(h.seed.organizationId, `${h.year}-05-01`)).toBe(true);
    expect(releaseOnLateGrant({ monthlyMinor: STD, grantedOn: `${h.year}-01-10`, firstMonth: 1 })).toBe(145_161n);
  });

  it('Ca H: concurrent settleMonth vs chargeMonth with 2 connections + Barrier x20 completes with 0 40P01 deadlocks', async () => {
    const unit = await newUnitWithBudget(h.year);
    const { subscriptionId, planId } = await newK2Pool(STD);
    const month: BusinessDate = `${h.year}-06-01`;

    const lockOrgMonth = slices().lockOrganizationMonth.bind(slices());
    const lockSubMonth = seatMonthRepo().lockMonthOf.bind(seatMonthRepo());
    for (let round = 0; round < 20; round += 1) {
      const personId = await staffSinceYearStart(unit, `STAFF-H-${round}`);
      const { requestId, commitmentId } = await createHeldK2({
        unit,
        planId,
        year: h.year,
        amountMinor: STD,
        months: [{ month, seatCount: 1 }],
      });
      await addPoolSeat({
        subscriptionId,
        planId,
        employeeId: personId,
        requestId,
        validFrom: month,
      });

      const barrier = new Barrier(2);
      const s1 = jest.spyOn(slices(), 'lockOrganizationMonth').mockImplementation(async (tx, org, m) => {
        await lockOrgMonth(tx, org, m);
        await barrier.wait();
      });
      const s2 = jest.spyOn(seatMonthRepo(), 'lockMonthOf').mockImplementation(async (tx, sub, m) => {
        await lockSubMonth(tx, sub, m);
        if (sub === subscriptionId) await barrier.wait();
      });
      try {
        await Promise.all([
          settlements().settleMonth(h.seed.organizationId, month, NOW),
          seatMonths().chargeMonth(month, NOW),
        ]);
      } finally {
        s1.mockRestore();
        s2.mockRestore();
      }
      const snap = await commitmentSnapshot(commitmentId);
      expect(snap.row.appliedMinor + snap.row.releasedMinor).toBeLessThanOrEqual(STD);
    }
  });
});
