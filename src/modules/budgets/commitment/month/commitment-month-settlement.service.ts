// Thứ tự khóa: advisory commitment-month:<org>:<month> (0) -> budget_commitments FU (9) -> budget_commitment_months FU (9b) -> CC-year (10) chỉ khi attachedVersionId !== null - E1
import { Injectable, Logger } from '@nestjs/common';
import type { BusinessDate } from '../../../../core/business-date';
import { fiscalYearOf } from '../../../../core/fiscal-year';
import { TransactionRunner, type DbTx } from '../../../../infrastructure/database/transaction-runner';
import { AuditApi } from '../../../audit/public/audit.api';
import { CatalogApi } from '../../../catalog/public/catalog.api';
import { BudgetFactsRepo } from '../../budget/budget-facts.repo';
import { BudgetYearLockRepo } from '../../budget/budget-year-lock.repo';
import { CommitmentRepo } from '../../budget/commitment.repo';
import { CommitmentRequestFactsHook } from '../../public/budgets.extension-points';
import { settlementOf } from './commitment-month.policy';
import { CommitmentMonthRepo, type CommitmentMonthRecord } from './commitment-month.repo';

const byId = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

type LockedCommitment = NonNullable<Awaited<ReturnType<CommitmentRepo['lockById']>>>;

export interface MonthSettlementResult {
  settledSlices: number;
  settledCommitments: number;
  releasedMinor: bigint;
}

export interface SettlementPassResult extends MonthSettlementResult {
  sweptCommitments: number;
}

/**
 * Settles monthly slices of K2 commitments at month-end (`MONTH_END`) and sweeps prior-year unspent K2 commitments
 * (`YEAR_END_SEAT_MONTHS`) once December is ready or from `(year+1)-02-01` onward (`W3-07`).
 */
@Injectable()
export class CommitmentMonthSettlementService {
  private readonly logger = new Logger(CommitmentMonthSettlementService.name);

  constructor(
    private readonly runner: TransactionRunner,
    private readonly commitments: CommitmentRepo,
    private readonly budgetFacts: BudgetFactsRepo,
    private readonly commitmentMonths: CommitmentMonthRepo,
    private readonly yearLock: BudgetYearLockRepo,
    private readonly audit: AuditApi,
    private readonly catalog: CatalogApi,
    private readonly requestFacts: CommitmentRequestFactsHook,
  ) {}

  async runPass(input: {
    organizationId: string;
    today: BusinessDate;
    now: Date;
    readyMonths: readonly BusinessDate[];
    priorDecemberReady?: boolean;
  }): Promise<SettlementPassResult> {
    const total: SettlementPassResult = {
      settledSlices: 0,
      settledCommitments: 0,
      sweptCommitments: 0,
      releasedMinor: 0n,
    };
    const settledMonths = new Set<BusinessDate>();

    for (const month of input.readyMonths) {
      const res = await this.settleMonth(input.organizationId, month, input.now);
      settledMonths.add(month);
      this.accumulate(total, res);
    }

    const currentYear = fiscalYearOf(input.today);
    const priorYears = await this.priorYearsPending(input.organizationId, currentYear);
    for (const year of priorYears) {
      if (!this.isPriorYearReady(year, currentYear, input.today, input.priorDecemberReady === true)) continue;
      for (const month of await this.commitmentMonths.listUnsettledMonthsInYear(input.organizationId, year)) {
        if (settledMonths.has(month)) continue;
        const res = await this.settleMonth(input.organizationId, month, input.now);
        settledMonths.add(month);
        this.accumulate(total, res);
      }
      const swept = await this.sweepYear(input.organizationId, year, input.now);
      total.sweptCommitments += swept.sweptCommitments;
      total.releasedMinor += swept.releasedMinor;
    }

    return total;
  }

  async settleMonth(organizationId: string, month: BusinessDate, now: Date): Promise<MonthSettlementResult> {
    const unsettled = await this.commitmentMonths.listUnsettledForMonth(organizationId, month);
    if (unsettled.length === 0) return { settledSlices: 0, settledCommitments: 0, releasedMinor: 0n };

    const ordered = this.orderByYearAndId(unsettled);
    const total: MonthSettlementResult = { settledSlices: 0, settledCommitments: 0, releasedMinor: 0n };
    for (const { commitmentId } of ordered) {
      try {
        const res = await this.settleCommitmentMonth(organizationId, month, commitmentId, now);
        this.accumulate(total, res);
      } catch (error) {
        this.logFailure('settleMonth', commitmentId, month, error);
      }
    }

    return total;
  }

  private async settleCommitmentMonth(
    organizationId: string,
    month: BusinessDate,
    commitmentId: string,
    now: Date,
  ): Promise<MonthSettlementResult> {
    return this.runner.run(async (tx) => {
      await this.commitmentMonths.lockOrganizationMonth(tx, organizationId, month);
      const locked = await this.lockCommitmentGraph(tx, commitmentId);
      if (!locked) return { settledSlices: 0, settledCommitments: 0, releasedMinor: 0n };

      const slice = locked.slices.find((s) => s.month === month);
      if (!slice || slice.settledAt !== null) return { settledSlices: 0, settledCommitments: 0, releasedMinor: 0n };

      const takeMinor = settlementOf(slice);
      await this.commitmentMonths.markSettled(tx, commitmentId, month, now);
      if (takeMinor <= 0n) return { settledSlices: 1, settledCommitments: 0, releasedMinor: 0n };

      await this.commitmentMonths.addReleased(tx, commitmentId, month, takeMinor);
      await this.recordSystemRelease(tx, locked.row, takeMinor, 'MONTH_END', `month:${month}`, now);

      return { settledSlices: 1, settledCommitments: 1, releasedMinor: takeMinor };
    });
  }

  private async sweepYear(
    organizationId: string,
    year: number,
    now: Date,
  ): Promise<{ sweptCommitments: number; releasedMinor: bigint }> {
    const held = await this.budgetFacts.listHeldByYear(organizationId, year);
    if (held.length === 0) return { sweptCommitments: 0, releasedMinor: 0n };

    const k2Ids = (await this.filterK2CommitmentIds(held)).sort(byId);
    if (k2Ids.length === 0) return { sweptCommitments: 0, releasedMinor: 0n };

    const sweepKey: BusinessDate = `${year}-12-31`;
    let sweptCommitments = 0;
    let releasedMinor = 0n;
    for (const commitmentId of k2Ids) {
      try {
        const released = await this.sweepCommitmentYear(organizationId, year, sweepKey, commitmentId, now);
        if (released <= 0n) continue;
        sweptCommitments += 1;
        releasedMinor += released;
      } catch (error) {
        this.logFailure('sweepYear', commitmentId, sweepKey, error);
      }
    }

    return { sweptCommitments, releasedMinor };
  }

  private async sweepCommitmentYear(
    organizationId: string,
    year: number,
    sweepKey: BusinessDate,
    commitmentId: string,
    now: Date,
  ): Promise<bigint> {
    return this.runner.run(async (tx) => {
      await this.commitmentMonths.lockOrganizationMonth(tx, organizationId, sweepKey);
      const locked = await this.lockCommitmentGraph(tx, commitmentId);
      if (!locked) return 0n;

      return this.applySingleYearSweep(tx, { year, now, row: locked.row, slices: locked.slices });
    });
  }

  private orderByYearAndId(
    candidates: ReadonlyArray<{ commitmentId: string; year: number }>,
  ): Array<{ commitmentId: string; year: number }> {
    const byCommitment = new Map<string, number>();
    for (const item of candidates) {
      const existing = byCommitment.get(item.commitmentId);
      if (existing === undefined || item.year < existing) byCommitment.set(item.commitmentId, item.year);
    }

    return [...byCommitment.entries()]
      .map(([commitmentId, year]) => ({ commitmentId, year }))
      .sort((a, b) => a.year - b.year || byId(a.commitmentId, b.commitmentId));
  }

  private async lockCommitmentGraph(
    tx: DbTx,
    commitmentId: string,
  ): Promise<{ row: LockedCommitment; slices: CommitmentMonthRecord[] } | null> {
    const row = await this.commitments.lockById(tx, commitmentId);
    if (!row || row.state !== 'HELD') return null;
    const slices = await this.commitmentMonths.lockOfCommitment(tx, commitmentId);
    // E1: never lock CC-year when commitment waits unattached for a budget version.
    if (row.attachedVersionId !== null) await this.yearLock.lock(tx, row.costCenterId, [row.year]);

    return { row, slices };
  }

  private async applySingleYearSweep(
    tx: DbTx,
    ctx: { year: number; now: Date; row: LockedCommitment; slices: CommitmentMonthRecord[] },
  ): Promise<bigint> {
    if (ctx.slices.length > 0) {
      const unsettled = ctx.slices.filter((slice) => slice.settledAt === null);
      if (unsettled.length === 0) return 0n;
      let sliceTotal = 0n;
      for (const slice of unsettled) {
        const take = settlementOf(slice);
        await this.commitmentMonths.markSettled(tx, ctx.row.id, slice.month, ctx.now);
        if (take <= 0n) continue;
        await this.commitmentMonths.addReleased(tx, ctx.row.id, slice.month, take);
        sliceTotal += take;
      }
      if (sliceTotal <= 0n) return 0n;
      await this.recordSystemRelease(tx, ctx.row, sliceTotal, 'YEAR_END_SEAT_MONTHS', `year:${ctx.year}`, ctx.now);
      return sliceTotal;
    }

    const remaining = ctx.row.amountMinor - ctx.row.releasedMinor - ctx.row.appliedMinor;
    if (remaining <= 0n) return 0n;
    await this.recordSystemRelease(tx, ctx.row, remaining, 'YEAR_END_SEAT_MONTHS', `year:${ctx.year}`, ctx.now);
    return remaining;
  }

  private async priorYearsPending(organizationId: string, currentYear: number): Promise<number[]> {
    const [sliceYears, heldYears] = await Promise.all([
      this.commitmentMonths.listUnsettledYearsBefore(organizationId, currentYear),
      this.budgetFacts.listHeldYearsBefore(organizationId, currentYear),
    ]);
    return [...new Set([...sliceYears, ...heldYears])].sort((a, b) => a - b);
  }

  private isPriorYearReady(
    year: number,
    currentYear: number,
    today: BusinessDate,
    priorDecemberReady: boolean,
  ): boolean {
    if (year < currentYear - 1) return true;
    return priorDecemberReady || today >= `${year + 1}-02-01`;
  }

  private async filterK2CommitmentIds(held: ReadonlyArray<{ id: string; requestId: string }>): Promise<string[]> {
    const requestIds = [...new Set(held.map((c) => c.requestId))];
    const views = await this.requestFacts.get().factsOf(requestIds);
    const planIds = [...new Set([...views.values()].flatMap((v) => (v.planId ? [v.planId] : [])))];
    if (planIds.length === 0) return [];
    const plans = await this.catalog.getPlanRevocationInfo(planIds);
    const k2Plans = new Set(plans.filter((p) => p.provisioningType === 'K2').map((p) => p.planId));
    return held
      .filter((c) => {
        const planId = views.get(c.requestId)?.planId;
        return planId !== null && planId !== undefined && k2Plans.has(planId);
      })
      .map((c) => c.id);
  }

  private logFailure(operation: string, commitmentId: string, scope: string, error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    this.logger.error(`${operation} skipped commitment ${commitmentId} (${scope}): ${message}`, stack);
  }

  private async recordSystemRelease(
    tx: DbTx,
    row: LockedCommitment,
    takeMinor: bigint,
    reason: 'MONTH_END' | 'YEAR_END_SEAT_MONTHS',
    reasonText: string,
    now: Date,
  ): Promise<void> {
    const result = await this.commitments.release(tx, row, {
      takeMinor,
      reason,
      reasonText,
      releasedByEmployeeId: null,
      now,
    });
    await this.audit.record(tx, {
      organizationId: row.organizationId,
      actorKind: 'SYSTEM',
      action: 'BUDGET_COMMITMENT.RELEASED',
      resourceType: 'BUDGET_COMMITMENT',
      resourceId: row.id,
      before: null,
      after: {
        requestId: row.requestId,
        year: row.year,
        amountMinor: takeMinor.toString(),
        heldMinor: result.heldMinor.toString(),
        reason,
        reasonText,
      },
      correlationId: row.requestId,
    });
  }

  private accumulate(total: MonthSettlementResult, add: MonthSettlementResult): void {
    total.settledSlices += add.settledSlices;
    total.settledCommitments += add.settledCommitments;
    total.releasedMinor += add.releasedMinor;
  }
}
