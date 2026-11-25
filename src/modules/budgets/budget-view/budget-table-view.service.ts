import { Injectable } from '@nestjs/common';
import { pageOf } from '../../../core/application/pagination';
import { BudgetFactsService, type MoneyView } from '../budget/budget-facts.service';
import { SeatMonthRepo } from '../seat-month/seat-month.repo';
import { SharedPoolLineFactsService } from '../shared-pool-line/shared-pool-line-facts.service';
import type { BudgetSummaryWire, TableRowWire } from '../budget/budget.dto';
import { BudgetViewNumbersService, type BudgetViewNumbers } from './budget-view-numbers.service';
import { budgetNumbers } from './budget-view.mapper';
import { BudgetViewRepo, type BudgetViewFigures } from './budget-view.repo';

interface SummarySums {
  base: bigint;
  reserve: bigint;
  total: bigint;
  adjustment: bigint;
  committed: bigint;
  spent: bigint;
  pendingSpend: bigint;
  runningUncommitted: bigint;
  costCenterCount: number;
  overBudgetCount: number;
}

/** Finance and the spending approver read the same table and totals, including commitment-only years. */
@Injectable()
export class BudgetTableViewService {
  constructor(
    private readonly repo: BudgetViewRepo,
    private readonly numbers: BudgetViewNumbersService,
    private readonly facts: BudgetFactsService,
    private readonly seatMonths: SeatMonthRepo,
    private readonly poolFacts: SharedPoolLineFactsService,
  ) {}

  async table(query: { year?: number; page: number; pageSize: number }) {
    const { items, total } = await this.repo.page({
      year: query.year,
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    });
    const [centers, totals, formatters] = await Promise.all([
      this.facts.costCenters(items.map((row) => row.costCenterId)),
      this.numbers.totals(items),
      this.formatters(items),
    ]);
    const rows: TableRowWire[] = items.map((row) => {
      const costCenter = centers.get(row.costCenterId);
      if (!costCenter) throw new Error(`The Cost Center ${row.costCenterId} does not exist.`);
      const money = formatters.get(row.currency)!;
      const numbers = totals.get(`${row.costCenterId}:${row.year}`)!;
      const figures = budgetNumbers(row, numbers, money);
      return {
        costCenter,
        year: row.year,
        status: row.versionId === null ? 'NO_BUDGET' : 'ACTIVE',
        versionId: row.versionId,
        number: row.number,
        ...figures,
        remaining: figures.remainingWithReserve,
        overCommitted: figures.overBudget,
        priorPeriodAdjustment: money(numbers.priorPeriodAdjustment),
      };
    });
    return pageOf(rows, total, query.page, query.pageSize);
  }

  async summary(year: number): Promise<BudgetSummaryWire> {
    const rows = await this.repo.rows(year);
    const numbers = await this.numbers.totals(rows);
    const sums = new Map<string, SummarySums>();
    for (const row of rows) {
      const sum = sums.get(row.currency) ?? emptySums();
      addToSummary(sum, row, numbers.get(`${row.costCenterId}:${row.year}`)!);
      sums.set(row.currency, sum);
    }
    const totals: BudgetSummaryWire['totals'] = {};
    for (const [currency, sum] of sums) totals[currency] = await this.summaryTotal(currency, sum);
    const cycle = await this.numbers.cycle(year);
    const money = cycle ? await this.facts.formatter(cycle.currency) : null;
    const pool = await this.poolFigures(year, cycle?.sharedPoolReserveMinor ?? null, money);
    return {
      year,
      totals,
      lastInvoiceRecordedAt: await this.numbers.lastInvoice(year),
      ...pool,
      annualCeiling: cycle && money ? money(cycle.annualCeilingMinor) : null,
      sharedPoolReserve: cycle?.sharedPoolReserveMinor != null && money ? money(cycle.sharedPoolReserveMinor) : null,
    };
  }

  /** What the year cost the company, with the pool in it, and the line of the pool against the reserve of the cycle (`MG-03`, `QĐ-104i`). */
  private async poolFigures(
    year: number,
    reserveMinor: bigint | null,
    money: ((minor: bigint) => MoneyView) | null,
  ): Promise<
    Pick<
      BudgetSummaryWire,
      | 'companySpent'
      | 'sharedPoolUnallocated'
      | 'sharedPoolOverReserve'
      | 'seatMonthsWithoutCostCenter'
      | 'sharedPoolLines'
    >
  > {
    const company = await this.seatMonths.yearTotals(year);
    const lines = await this.poolFacts.yearFigures(year);
    const overReserve = reserveMinor === null ? null : lines.unallocatedMinor > reserveMinor;

    return {
      companySpent: money ? money(company.companyMinor) : null,
      sharedPoolUnallocated: money ? money(lines.unallocatedMinor) : null,
      sharedPoolOverReserve: overReserve,
      seatMonthsWithoutCostCenter: money ? money(company.withoutCostCenterMinor) : null,
      sharedPoolLines: money
        ? {
            idleCost: money(lines.idleCostMinor),
            invoiceVariance: money(lines.invoiceVarianceMinor),
            invoiceVarianceInReview: money(lines.invoiceVarianceInReviewMinor),
            deviceLotPurchases: money(lines.deviceLotPurchasesMinor),
            replacementKeys: money(lines.replacementKeysMinor),
            total: money(lines.unallocatedMinor),
            reserve: reserveMinor === null ? null : money(reserveMinor),
            overReserve,
          }
        : null,
    };
  }

  private async summaryTotal(currency: string, sum: SummarySums) {
    const money = await this.facts.formatter(currency);
    const used = sum.committed + sum.spent + sum.pendingSpend + sum.runningUncommitted;
    return {
      currency,
      base: money(sum.base),
      reserve: money(sum.reserve),
      total: money(sum.total),
      effectiveBudget: {
        base: money(sum.base + sum.adjustment),
        reserve: money(sum.reserve),
        total: money(sum.total + sum.adjustment),
        adjustment: money(sum.adjustment),
      },
      committed: money(sum.committed),
      spent: money(sum.spent),
      pendingSpend: money(sum.pendingSpend),
      runningUncommitted: money(sum.runningUncommitted),
      remaining: money(sum.total + sum.adjustment - used),
      remainingBase: money(sum.base + sum.adjustment - used),
      remainingWithReserve: money(sum.total + sum.adjustment - used),
      costCenterCount: sum.costCenterCount,
      overBudgetCount: sum.overBudgetCount,
    };
  }

  private async formatters(rows: readonly BudgetViewFigures[]) {
    const entries = await Promise.all(
      [...new Set(rows.map((row) => row.currency))].map(
        async (currency) => [currency, await this.facts.formatter(currency)] as const,
      ),
    );
    return new Map(entries);
  }
}

const emptySums = (): SummarySums => ({
  base: 0n,
  reserve: 0n,
  total: 0n,
  adjustment: 0n,
  committed: 0n,
  spent: 0n,
  pendingSpend: 0n,
  runningUncommitted: 0n,
  costCenterCount: 0,
  overBudgetCount: 0,
});

function addToSummary(sum: SummarySums, row: BudgetViewFigures, numbers: BudgetViewNumbers): void {
  sum.base += row.baseMinor ?? 0n;
  sum.reserve += row.reserveMinor ?? 0n;
  sum.total += row.totalMinor ?? 0n;
  sum.adjustment += row.adjustmentMinor ?? 0n;
  sum.committed += numbers.committed;
  sum.spent += numbers.spent;
  sum.pendingSpend += numbers.pendingSpend;
  sum.runningUncommitted += numbers.runningUncommitted;
  sum.costCenterCount += 1;
  const used = numbers.committed + numbers.spent + numbers.pendingSpend + numbers.runningUncommitted;
  if (row.totalMinor !== null && row.totalMinor + (row.adjustmentMinor ?? 0n) < used) sum.overBudgetCount += 1;
}
