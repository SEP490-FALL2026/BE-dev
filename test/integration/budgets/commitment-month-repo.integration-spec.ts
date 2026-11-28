import { randomUUID } from 'node:crypto';
import { TransactionRunner } from '../../../src/infrastructure/database/transaction-runner';
import { InvoiceRepo } from '../../../src/modules/budgets/budget/invoice.repo';
import { CommitmentMonthRepo } from '../../../src/modules/budgets/commitment/month/commitment-month.repo';
import {
  BudgetReviewRepo,
  type NewReviewLine,
  type NewReviewPeriod,
} from '../../../src/modules/budgets/review/budget-review.repo';
import { SpendHarness } from '../../support/spend-harness';

const h = new SpendHarness();
const M = 1_000_000;

describe('budget_commitment_months, invoices_pool_figures, and M2/M3 schema guards over PostgreSQL', () => {
  let organizationId: string;
  let vendorId: string;
  let subscriptionId: string;
  let commitmentId: string;
  let months: CommitmentMonthRepo;
  let invoices: InvoiceRepo;
  let reviews: BudgetReviewRepo;
  let runner: TransactionRunner;

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    organizationId = (await h.ctx.sql.query<{ id: string }>(`SELECT id FROM organizations LIMIT 1`)).rows[0].id;
    subscriptionId = await h.subscription(10);
    const planId = await h.planOf(subscriptionId);
    vendorId = (await h.vendorOf(planId)).id;

    const unit = await h.departmentWithHead('CM-INT-1');
    await h.budgetFor(unit, { total: 100 * M });
    const requestId = await h.waitingForApprover(unit, planId, { amount: 12 * M });
    await h.decideSpend(requestId, { decision: 'APPROVE' }, h.boss.account).expect(200);
    commitmentId = (
      await h.ctx.sql.query<{ id: string }>(`SELECT id FROM budget_commitments WHERE request_id = $1 LIMIT 1`, [
        requestId,
      ])
    ).rows[0].id;

    months = h.ctx.app.get(CommitmentMonthRepo, { strict: false });
    invoices = h.ctx.app.get(InvoiceRepo, { strict: false });
    reviews = h.ctx.app.get(BudgetReviewRepo, { strict: false });
    runner = h.ctx.app.get(TransactionRunner, { strict: false });
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  describe('budget_commitment_months constraints and immutability trigger', () => {
    let m1: string;
    let m2: string;
    let m3: string;

    it('writes slices, locks ordered keys, updates applied/released/settled_at, and counts held months', async () => {
      const existing = new Set((await months.ofCommitment(commitmentId)).map((row) => row.month));
      const available = Array.from(
        { length: 12 },
        (_, idx) => `${h.year}-${String(idx + 1).padStart(2, '0')}-01`,
      ).filter((month) => !existing.has(month));
      [m1, m2, m3] = available;
      const settledAt = new Date(`${m2.slice(0, 8)}05T00:00:00.000Z`);
      const beforeCount = await months.countHeldByYear(organizationId, h.year);

      await runner.run(async (tx) => {
        await months.lockOrganizationMonth(tx, organizationId, m1);
        await months.insertMany(tx, [
          { commitmentId, month: m1, seatCount: 2, shareMinor: 1_000_000n },
          { commitmentId, month: m2, seatCount: 2, shareMinor: 1_000_000n },
        ]);
        const locked = await months.lockByCommitmentAndMonths(tx, [
          { commitmentId, month: m2 },
          { commitmentId, month: m1 },
        ]);
        expect(locked.map((row) => row.month)).toEqual([m1, m2]);

        await months.addApplied(tx, commitmentId, m1, 700_000n);
        await months.addReleased(tx, commitmentId, m1, 300_000n, settledAt);
        await months.reverseApplied(tx, commitmentId, m1, 200_000n);
      });

      const rows = (await months.ofCommitment(commitmentId)).filter((row) => row.month === m1 || row.month === m2);
      expect(rows[0]).toMatchObject({
        commitmentId,
        month: m1,
        seatCount: 2,
        shareMinor: 1_000_000n,
        appliedMinor: 500_000n,
        releasedMinor: 300_000n,
        settledAt: null,
      });

      expect(await months.countHeldByYear(organizationId, h.year)).toEqual({
        commitments: beforeCount.commitments,
        months: beforeCount.months + 2,
        unsettledMonths: beforeCount.unsettledMonths + 2,
      });

      await runner.run((tx) => months.markSettled(tx, commitmentId, m1, settledAt));
      expect((await months.listUnsettledForMonth(organizationId, m2)).map((c) => c.commitmentId)).toEqual([
        commitmentId,
      ]);
    });

    it('rejects applied_minor + released_minor > share_minor, non-first day, and non-positive seat_count', async () => {
      await runner.run((tx) =>
        months.insertMany(tx, [{ commitmentId, month: m3, seatCount: 1, shareMinor: 500_000n }]),
      );

      await expect(
        runner.run(async (tx) => {
          await months.addApplied(tx, commitmentId, m3, 400_000n);
          await months.addReleased(tx, commitmentId, m3, 200_000n);
        }),
      ).rejects.toThrow(/budget_commitment_months_within_share/);

      await expect(
        h.ctx.sql.query(
          `INSERT INTO budget_commitment_months (commitment_id, month, seat_count, share_minor)
           VALUES ($1, $2::date, 1, 100)`,
          [commitmentId, `${h.year}-04-15`],
        ),
      ).rejects.toThrow(/budget_commitment_months_month_first/);

      await expect(
        h.ctx.sql.query(
          `INSERT INTO budget_commitment_months (commitment_id, month, seat_count, share_minor)
           VALUES ($1, $2::date, 0, 100)`,
          [commitmentId, `${m3.slice(0, 8)}01`],
        ),
      ).rejects.toThrow(/budget_commitment_months_seat_count_positive/);
    });

    it('refuses changes to commitment_id, month, seat_count, share_minor and refuses DELETE', async () => {
      await expect(
        h.ctx.sql.query(
          `UPDATE budget_commitment_months SET share_minor = share_minor + 1 WHERE commitment_id = $1 AND month = $2::date`,
          [commitmentId, m1],
        ),
      ).rejects.toThrow(/budget_commitment_months keeps its commitment, month, seat count and share/);

      await expect(
        h.ctx.sql.query(
          `UPDATE budget_commitment_months SET seat_count = seat_count + 1 WHERE commitment_id = $1 AND month = $2::date`,
          [commitmentId, m1],
        ),
      ).rejects.toThrow(/budget_commitment_months keeps its commitment, month, seat count and share/);

      await expect(
        h.ctx.sql.query(`DELETE FROM budget_commitment_months WHERE commitment_id = $1 AND month = $2::date`, [
          commitmentId,
          m1,
        ]),
      ).rejects.toThrow(/budget_commitment_months keeps its history/);
    });
  });

  describe('invoices_pool_figures CHECK and append-only invoice_pool_variance_resolutions', () => {
    it('persists pool figures (including NULL expected_minor), rejects invalid combinations, and resolves via append-only table', async () => {
      const serviceMonth = `${h.year}-01-01`;
      const inv = await runner.run((tx) =>
        invoices.insert(tx, {
          organizationId,
          commitmentId: null,
          vendorId,
          number: `POOL-INT-${randomUUID().slice(0, 8)}`,
          issuedOn: `${h.year}-02-05`,
          currency: h.reporting,
          netMinor: 1_200_000n,
          deductibleTaxMinor: 0n,
          nonDeductibleTaxMinor: 0n,
          actualCostMinor: 1_200_000n,
          appliedMinor: 0n,
          matchResult: 'PRICE_QUANTITY_EXCEPTION',
          note: null,
          recordedByEmployeeId: h.finance.employeeId,
          now: new Date(`${h.year}-02-05T00:00:00.000Z`),
          serviceMonth,
          subscriptionId,
          poolFigures: {
            expectedMinor: 1_000_000n,
            varianceMinor: 200_000n,
            varianceMonth: serviceMonth,
            inReview: true,
          },
        }),
      );
      expect(inv.poolExpectedMinor).toBe(1_000_000n);
      expect(inv.poolVarianceInReview).toBe(true);

      // NO_EXPECTED_AMOUNT: pool_expected_minor is NULL while pool_variance_minor/month are set and in_review is false.
      const noExpected = await runner.run((tx) =>
        invoices.insert(tx, {
          organizationId,
          commitmentId: null,
          vendorId,
          number: `POOL-NOEXP-${randomUUID().slice(0, 8)}`,
          issuedOn: `${h.year}-02-06`,
          currency: h.reporting,
          netMinor: 300_000n,
          deductibleTaxMinor: 0n,
          nonDeductibleTaxMinor: 0n,
          actualCostMinor: 300_000n,
          appliedMinor: 0n,
          matchResult: 'MATCHED',
          note: null,
          recordedByEmployeeId: h.finance.employeeId,
          now: new Date(`${h.year}-02-06T00:00:00.000Z`),
          serviceMonth,
          subscriptionId,
          poolFigures: {
            expectedMinor: null,
            varianceMinor: 300_000n,
            varianceMonth: serviceMonth,
            inReview: false,
          },
        }),
      );
      expect(noExpected.poolExpectedMinor).toBeNull();
      expect(noExpected.poolVarianceMinor).toBe(300_000n);

      await expect(
        h.ctx.sql.query(
          `INSERT INTO invoices (id, organization_id, vendor_id, number, issued_on, currency, net_minor,
             deductible_tax_minor, non_deductible_tax_minor, actual_cost_minor, applied_minor, match_result,
             recorded_by_employee_id, recorded_at, subscription_id, service_month, pool_variance_minor, pool_variance_month, pool_variance_in_review)
           VALUES (gen_random_uuid(), $1, $2, $3, $4::date, $5, 100, 0, 0, 100, 0, 'MATCHED', $6, now(), $7, $8::date, 100, $8::date, true)`,
          [
            organizationId,
            vendorId,
            `BAD-${randomUUID().slice(0, 8)}`,
            `${h.year}-02-05`,
            h.reporting,
            h.finance.employeeId,
            subscriptionId,
            serviceMonth,
          ],
        ),
      ).rejects.toThrow(/invoices_pool_figures/);

      await expect(
        h.ctx.sql.query(`UPDATE invoices SET pool_variance_in_review = false WHERE id = $1`, [inv.id]),
      ).rejects.toThrow(/invoices is append-only/);

      const resolved = await runner.run((tx) => invoices.markPoolVarianceResolved(tx, inv.purchaseInvoiceId ?? inv.id));
      expect(resolved).toBeNull();

      await h.ctx.sql.query(`INSERT INTO invoice_pool_variance_resolutions (invoice_id) VALUES ($1)`, [inv.id]);
      await expect(
        h.ctx.sql.query(`DELETE FROM invoice_pool_variance_resolutions WHERE invoice_id = $1`, [inv.id]),
      ).rejects.toThrow(/invoice_pool_variance_resolutions is append-only/);
    });
  });

  describe('budget review pool snapshots and M3 values', () => {
    it('freezes shared_pool_* and prior_year_released_minor and exposes M3 enum & CHECK values', async () => {
      const reviewYear = h.year + 50;
      const periodInput: NewReviewPeriod = {
        organizationId,
        year: reviewYear,
        month: 2,
        kind: 'MONTH',
        currency: h.reporting,
        snapshotByEmployeeId: h.finance.employeeId,
        snapshotAt: new Date(`${reviewYear}-03-02T00:00:00.000Z`),
        companySpentMinor: 10_000_000n,
        sharedPoolUnallocatedMinor: 500_000n,
        sharedPoolReserveMinor: 1_000_000n,
        annualCeilingMinor: 100_000_000n,
        sharedPoolIdleMinor: 200_000n,
        sharedPoolDeviceLotMinor: 100_000n,
        sharedPoolReplacementMinor: 50_000n,
        sharedPoolVarianceMinor: 25_000n,
        sharedPoolVarianceInReviewMinor: 10_000n,
      };
      const lineInput: NewReviewLine = {
        costCenterId: randomUUID(),
        baseMinor: 10_000_000n,
        reserveMinor: 1_000_000n,
        spentMinor: 2_000_000n,
        spentAfterMonthMinor: 0n,
        priorYearReleasedMinor: 150_000n,
        committedMinor: 500_000n,
        pendingSpendMinor: 0n,
        remainingMinor: 7_500_000n,
        invoiceBasisMinor: 2_000_000n,
        invoiceActualMinor: 2_000_000n,
        variancePpm: 0n,
        priceIncreaseMinor: 0n,
        forecastMinor: 10_000_000n,
        paceBasisPoints: 10_000n,
        light: 'GREEN',
      };

      const saved = await runner.run((tx) => reviews.insert(tx, periodInput, [lineInput]));
      expect(saved.sharedPoolVarianceMinor).toBe(25_000n);

      await expect(
        h.ctx.sql.query(`UPDATE budget_review_periods SET shared_pool_idle_minor = 0 WHERE id = $1`, [saved.id]),
      ).rejects.toThrow(/never change/);

      await expect(
        h.ctx.sql.query(`UPDATE budget_review_lines SET prior_year_released_minor = 0 WHERE period_id = $1`, [
          saved.id,
        ]),
      ).rejects.toThrow(/never change/);

      const enums = await h.ctx.sql.query<{ typname: string; enumlabel: string }>(
        `SELECT t.typname, e.enumlabel
           FROM pg_enum e
           JOIN pg_type t ON t.oid = e.enumtypid
          WHERE t.typname IN ('CommitmentReleaseReason', 'InvoiceDiscrepancyOutcome')`,
      );
      expect(enums.rows.map((r) => `${r.typname}:${r.enumlabel}`)).toEqual(
        expect.arrayContaining([
          'CommitmentReleaseReason:MONTH_END',
          'CommitmentReleaseReason:YEAR_END_SEAT_MONTHS',
          'InvoiceDiscrepancyOutcome:EXCHANGE_RATE_LINE_PRICE_UPDATED',
        ]),
      );

      const check = await h.ctx.sql.query<{ def: string }>(
        `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = 'invoice_discrepancy_cases_mismatches_check'`,
      );
      expect(check.rows[0]?.def).toContain('EXPECTED_AMOUNT');
    });
  });
});
