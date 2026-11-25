// Thứ tự khóa: advisory commitment-month:<org>:<month> (0) -> budget_commitments FU (9) -> budget_commitment_months FU (9b) -> CC-year (10) chỉ khi attachedVersionId !== null - E1
import { Injectable } from '@nestjs/common';
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
    return this.runner.run(async (tx) => {
      await this.commitmentMonths.lockOrganizationMonth(tx, organizationId, month);
      const unsettled = await this.commitmentMonths.listUnsettledForMonth(organizationId, month, tx);
      if (unsettled.length === 0) return { settledSlices: 0, settledCommitments: 0, releasedMinor: 0n };

      const ids = [...new Set(unsettled.map((item) => item.commitmentId))].sort(byId);
      const commitments = await this.lockCommitments(tx, ids);
      const slicesById = await this.lockSlices(tx, [...commitments.keys()]);
      await this.lockAttachedCostCenters(tx, commitments.values());

      return this.applyMonthSettlements(tx, { month, now, commitments, slicesById });
    });
  }

  private async sweepYear(
    organizationId: string,
    year: number,
    now: Date,
  ): Promise<{ sweptCommitments: number; releasedMinor: bigint }> {
    const sweepKey: BusinessDate = `${year}-12-31`;
    return this.runner.run(async (tx) => {
      await this.commitmentMonths.lockOrganizationMonth(tx, organizationId, sweepKey);
      const held = await this.budgetFacts.listHeldByYear(organizationId, year, tx);
      if (held.length === 0) return { sweptCommitments: 0, releasedMinor: 0n };

      const k2Ids = await this.filterK2CommitmentIds(tx, held);
      if (k2Ids.length === 0) return { sweptCommitments: 0, releasedMinor: 0n };

      const commitments = await this.lockCommitments(tx, k2Ids.sort(byId));
      const slicesById = await this.lockSlices(tx, [...commitments.keys()]);
      await this.lockAttachedCostCenters(tx, commitments.values());

      return this.applyYearSweep(tx, { year, now, commitments, slicesById });
    });
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

  private async lockCommitments(tx: DbTx, ids: readonly string[]): Promise<Map<string, LockedCommitment>> {
    const map = new Map<string, LockedCommitment>();
    for (const id of ids) {
      const row = await this.commitments.lockById(tx, id);
      if (row && row.state === 'HELD') map.set(id, row);
    }
    return map;
  }

  private async lockSlices(tx: DbTx, ids: readonly string[]): Promise<Map<string, CommitmentMonthRecord[]>> {
    const map = new Map<string, CommitmentMonthRecord[]>();
    for (const id of ids) {
      map.set(id, await this.commitmentMonths.lockOfCommitment(tx, id));
    }
    return map;
  }

  private async lockAttachedCostCenters(tx: DbTx, rows: Iterable<LockedCommitment>): Promise<void> {
    const byKey = new Map<string, { costCenterId: string; year: number }>();
    for (const row of rows) {
      // E1: never lock CC-year when commitment waits unattached for a budget version.
      if (row.attachedVersionId === null) continue;
      byKey.set(`${row.costCenterId}:${row.year}`, { costCenterId: row.costCenterId, year: row.year });
    }
    const pairs = [...byKey.values()].sort((a, b) => byId(a.costCenterId, b.costCenterId) || a.year - b.year);
    for (const pair of pairs) {
      await this.yearLock.lock(tx, pair.costCenterId, [pair.year]);
    }
  }

  private async applyMonthSettlements(
    tx: DbTx,
    ctx: {
      month: BusinessDate;
      now: Date;
      commitments: ReadonlyMap<string, LockedCommitment>;
      slicesById: ReadonlyMap<string, CommitmentMonthRecord[]>;
    },
  ): Promise<MonthSettlementResult> {
    let settledSlices = 0;
    let settledCommitments = 0;
    let releasedMinor = 0n;

    for (const [id, row] of ctx.commitments) {
      const slice = ctx.slicesById.get(id)?.find((s) => s.month === ctx.month);
      if (!slice || slice.settledAt !== null) continue;
      settledSlices += 1;
      const takeMinor = settlementOf(slice);
      await this.commitmentMonths.markSettled(tx, id, ctx.month, ctx.now);
      if (takeMinor <= 0n) continue;

      await this.commitmentMonths.addReleased(tx, id, ctx.month, takeMinor);
      await this.recordSystemRelease(tx, row, takeMinor, 'MONTH_END', `month:${ctx.month}`, ctx.now);
      settledCommitments += 1;
      releasedMinor += takeMinor;
    }

    return { settledSlices, settledCommitments, releasedMinor };
  }

  private async applyYearSweep(
    tx: DbTx,
    ctx: {
      year: number;
      now: Date;
      commitments: ReadonlyMap<string, LockedCommitment>;
      slicesById: ReadonlyMap<string, CommitmentMonthRecord[]>;
    },
  ): Promise<{ sweptCommitments: number; releasedMinor: bigint }> {
    let sweptCommitments = 0;
    let releasedMinor = 0n;

    for (const [id, row] of ctx.commitments) {
      const slices = ctx.slicesById.get(id) ?? [];
      if (slices.length > 0) {
        const unsettled = slices.filter((slice) => slice.settledAt === null);
        if (unsettled.length === 0) continue;
        let sliceTotal = 0n;
        for (const slice of unsettled) {
          const take = settlementOf(slice);
          await this.commitmentMonths.markSettled(tx, id, slice.month, ctx.now);
          if (take <= 0n) continue;
          await this.commitmentMonths.addReleased(tx, id, slice.month, take);
          sliceTotal += take;
        }
        if (sliceTotal <= 0n) continue;
        await this.recordSystemRelease(tx, row, sliceTotal, 'YEAR_END_SEAT_MONTHS', `year:${ctx.year}`, ctx.now);
        sweptCommitments += 1;
        releasedMinor += sliceTotal;
        continue;
      }
      const remaining = row.amountMinor - row.releasedMinor - row.appliedMinor;
      if (remaining <= 0n) continue;

      await this.recordSystemRelease(tx, row, remaining, 'YEAR_END_SEAT_MONTHS', `year:${ctx.year}`, ctx.now);
      sweptCommitments += 1;
      releasedMinor += remaining;
    }

    return { sweptCommitments, releasedMinor };
  }

  private async filterK2CommitmentIds(
    tx: DbTx,
    held: ReadonlyArray<{ id: string; requestId: string }>,
  ): Promise<string[]> {
    const requestIds = [...new Set(held.map((c) => c.requestId))];
    const views = await this.requestFacts.get().factsOf(requestIds);
    const planIds = [...new Set([...views.values()].flatMap((v) => (v.planId ? [v.planId] : [])))];
    if (planIds.length === 0) return [];
    const plans = await this.catalog.getPlanRevocationInfo(planIds, tx);
    const k2Plans = new Set(plans.filter((p) => p.provisioningType === 'K2').map((p) => p.planId));
    return held
      .filter((c) => {
        const planId = views.get(c.requestId)?.planId;
        return planId !== null && planId !== undefined && k2Plans.has(planId);
      })
      .map((c) => c.id);
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

  private accumulate(total: SettlementPassResult, add: MonthSettlementResult): void {
    total.settledSlices += add.settledSlices;
    total.settledCommitments += add.settledCommitments;
    total.releasedMinor += add.releasedMinor;
  }
}
