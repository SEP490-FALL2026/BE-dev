import { Injectable } from '@nestjs/common';
import { monthBoundsOf, type BusinessDate } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { BudgetFactsRepo } from '../budget/budget-facts.repo';
import { CommitmentRepo, heldKey } from '../budget/commitment.repo';
import { InvoiceRepo } from '../budget/invoice.repo';
import { PendingSpendContributions } from '../public/budgets.extension-points';
import { SeatMonthRepo } from '../seat-month/seat-month.repo';
import { BudgetReviewPriceService } from './budget-review-price.service';
import { knownPriceIncrease, reviewFiguresOf } from './budget-review.policy';
import type { PriceIncreaseItem } from './budget-review.types';
import type { NewReviewLine } from './budget-review.repo';

/**
 * Gathers, for every Cost Center that has an effective budget of the year, what the review needs at the close of a month and lets the policy work out the
 * figures (`RV-1`, `QĐ-111ai`): the budget, what was spent (the invoices and the seat-months of the shared pool, as the table of budgets reads it), what is held,
 * what waits for the spend decision, what the invoices cost against their price (the basis of k) and the price increase already known. It reads in the transaction
 * of the caller and writes nothing; the one place where "the budget of the year" is read for a review, so a budget that is the effective one (`AD-1`) changes it here.
 */
@Injectable()
export class BudgetReviewFiguresService {
  constructor(
    private readonly budgets: BudgetFactsRepo,
    private readonly commitments: CommitmentRepo,
    private readonly invoices: InvoiceRepo,
    private readonly pending: PendingSpendContributions,
    private readonly prices: BudgetReviewPriceService,
    private readonly seatMonths: SeatMonthRepo,
  ) {}

  /** What the company spent in the year, every invoice of it whatever it is booked to, the invoices of the shared pool in it (`MG-03`). */
  async companySpentMinor(year: number): Promise<bigint> {
    return (await this.seatMonths.yearTotals(year)).companyMinor;
  }

  /** Whether any Cost Center has an effective budget of the year in `currency`: when none has there is nothing to review (`RV1-09`). */
  async hasBudget(year: number, currency: string): Promise<boolean> {
    return [...(await this.budgets.approvedOfYear(year)).values()].some((budget) => budget.currency === currency);
  }

  /** The lines of the Cost Centers with a budget in `currency`, in order of id. A Cost Center with no budget has nothing to compare and no line. */
  async linesOf(tx: DbTx, year: number, month: number, currency: string): Promise<NewReviewLine[]> {
    const approved = [...(await this.budgets.approvedOfYear(year, tx))]
      .filter(([, budget]) => budget.currency === currency)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

    return this.linesFor(tx, year, month, approved);
  }

  /**
   * The forecast of the end of the year of each of these Cost Centers as it stands `today`, worked out by the formula of the review and no other (`AD-1`: the floor of a
   * return and of the source of a transfer is this figure, `R-40`). It is the figure of the month before this one, the last that has ended; of January it is the first month,
   * and of a year that has not begun it is the first too, with nothing spent. A Cost Center with no budget of the year is absent.
   */
  async forecastsOf(
    tx: DbTx,
    year: number,
    costCenterIds: readonly string[],
    today: BusinessDate,
  ): Promise<Map<string, bigint>> {
    const forecasts = new Map<string, bigint>();
    const approved = [...(await this.budgets.approvedOfCostCenters(costCenterIds, year, tx))];
    if (approved.length === 0) return forecasts;
    const month = year > Number(today.slice(0, 4)) ? 1 : Math.max(1, Number(today.slice(5, 7)) - 1);
    for (const line of await this.linesFor(tx, year, month, approved))
      forecasts.set(line.costCenterId, line.forecastMinor);

    return forecasts;
  }

  private async linesFor(
    tx: DbTx,
    year: number,
    month: number,
    approved: readonly [string, { baseMinor: bigint; reserveMinor: bigint }][],
  ): Promise<NewReviewLine[]> {
    if (approved.length === 0) return [];
    const costCenterIds = approved.map(([costCenterId]) => costCenterId);
    const pairs = costCenterIds.map((costCenterId) => ({ costCenterId, year }));
    const from = monthBoundsOf(`${year}-${String(month).padStart(2, '0')}-01`).nextStart;
    // One statement at a time on the client of the transaction (`R2`).
    const totals = await this.commitments.totals(pairs, tx, true);
    // What had been spent through the end of the month, by the month each invoice pays for and not by the day of the close; the rest of what is recorded took the commitments down (`RV1-03`).
    const spentThrough = await this.invoices.spentOf(pairs, tx, from);
    const pending = await this.pending.totals(pairs, tx);
    const basis = await this.invoices.priceBasisOf(pairs, tx, from);
    const increases = await this.prices.itemsOf(tx, costCenterIds, year, month);
    const priorYearReleased =
      month === 1 ? await this.budgets.priorYearReleasedOf(costCenterIds, year - 1, tx) : new Map<string, bigint>();

    const facts: YearFacts = { totals, spentThrough, pending, basis, increases, priorYearReleased };

    return approved.map(([costCenterId, budget]) => lineOf(month, year, costCenterId, budget, facts));
  }
}

/** What the lines of a review are worked out from: the figures of every Cost Center of the year, read once and keyed `costCenterId:year` (the prices by Cost Center). */
interface YearFacts {
  totals: Map<string, { held: bigint; spent: bigint }>;
  spentThrough: Map<string, bigint>;
  pending: Map<string, bigint>;
  basis: Map<string, { basisMinor: bigint; actualMinor: bigint }>;
  increases: Map<string, PriceIncreaseItem[]>;
  priorYearReleased: Map<string, bigint>;
}

/** The line of one Cost Center: its figures put in the policy and what the policy says kept with them. */
function lineOf(
  month: number,
  year: number,
  costCenterId: string,
  budget: { baseMinor: bigint; reserveMinor: bigint },
  facts: YearFacts,
): NewReviewLine {
  const key = heldKey(costCenterId, year);
  const invoiceBasis = facts.basis.get(key) ?? { basisMinor: 0n, actualMinor: 0n };
  const totals = facts.totals.get(key) ?? { held: 0n, spent: 0n };
  const spentThroughMonth = facts.spentThrough.get(key) ?? 0n;
  const input = {
    month,
    baseMinor: budget.baseMinor,
    reserveMinor: budget.reserveMinor,
    spentMinor: spentThroughMonth,
    spentAfterMonthMinor: totals.spent > spentThroughMonth ? totals.spent - spentThroughMonth : 0n,
    committedMinor: totals.held,
    pendingMinor: facts.pending.get(key) ?? 0n,
    invoiceBasisMinor: invoiceBasis.basisMinor,
    invoiceActualMinor: invoiceBasis.actualMinor,
    priceIncreaseMinor: knownPriceIncrease(facts.increases.get(costCenterId) ?? []),
  };
  const figures = reviewFiguresOf(input);

  return {
    costCenterId,
    baseMinor: input.baseMinor,
    reserveMinor: input.reserveMinor,
    spentMinor: input.spentMinor,
    spentAfterMonthMinor: input.spentAfterMonthMinor,
    priorYearReleasedMinor: facts.priorYearReleased.get(costCenterId) ?? 0n,
    committedMinor: input.committedMinor,
    pendingSpendMinor: input.pendingMinor,
    remainingMinor: figures.remainingMinor,
    invoiceBasisMinor: input.invoiceBasisMinor,
    invoiceActualMinor: input.invoiceActualMinor,
    variancePpm: figures.variancePpm,
    priceIncreaseMinor: input.priceIncreaseMinor,
    forecastMinor: figures.forecastMinor,
    paceBasisPoints: figures.paceBasisPoints,
    light: figures.light,
  };
}
