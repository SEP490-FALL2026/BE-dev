import { Injectable } from '@nestjs/common';
import { monthBoundsOf } from '../../../core/business-date';
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

  /** The lines of the Cost Centers with a budget in `currency`, in order of id. A Cost Center with no budget has nothing to compare and no line. */
  async linesOf(tx: DbTx, year: number, month: number, currency: string): Promise<NewReviewLine[]> {
    const approved = [...(await this.budgets.approvedOfYear(year, tx))]
      .filter(([, budget]) => budget.currency === currency)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
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

    const facts: YearFacts = { totals, spentThrough, pending, basis, increases };

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
