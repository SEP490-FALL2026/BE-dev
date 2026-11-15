import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { CatalogApi } from '../../catalog/public/catalog.api';
import { CommitmentRepo } from '../budget/commitment.repo';
import { CommitmentRequestFactsHook } from '../public/budgets.extension-points';
import type { PriceIncreaseItem } from './budget-review.types';

const CYCLE_MONTHS = { MONTHLY: 1n, QUARTERLY: 3n, ANNUAL: 12n } as const;

const ceilDiv = (numerator: bigint, denominator: bigint): bigint => (numerator + denominator - 1n) / denominator;

/**
 * What a price of the catalog that rose since a commitment was made adds to the year (`R-52`, `US-12-21` AC-7), gathered for the Cost Centers of a review: each
 * commitment still held that knows what a seat cost a month when it was made, the seats and the plan of its request (the requests context tells them through the
 * hook of the commitments), what it still holds, and the price of the plan in each month of the year after the one closed, so a price that takes effect in October is
 * known in August (`RV1-04`). The policy (`knownPriceIncrease`) works out the months the commitment still holds and keeps only what rose. A commitment whose request or
 * plan is not known, or whose price is not by a billing cycle, is left out: it cannot be compared. Nothing is written, and the commitment keeps the price it was made at
 * (`QĐ-97d`).
 */
@Injectable()
export class BudgetReviewPriceService {
  constructor(
    private readonly commitments: CommitmentRepo,
    private readonly requestFacts: CommitmentRequestFactsHook,
    private readonly catalog: CatalogApi,
  ) {}

  /** The commitments of each Cost Center that have a price to compare, with the price of their plan in each month of `year` after `month`. */
  async itemsOf(
    tx: DbTx,
    costCenterIds: readonly string[],
    year: number,
    month: number,
  ): Promise<Map<string, PriceIncreaseItem[]>> {
    const items = new Map<string, PriceIncreaseItem[]>();
    if (month >= 12) return items;
    const held = await this.commitments.heldWithSeatPrice(
      costCenterIds.map((costCenterId) => ({ costCenterId, year })),
      tx,
    );
    if (held.length === 0) return items;
    const facts = await this.requestFacts.get().factsOf([...new Set(held.map((row) => row.requestId))]);
    const monthlyOf = await this.monthlyPrices(
      tx,
      [...new Set([...facts.values()].flatMap((fact) => (fact.planId === null ? [] : [fact.planId])))],
      year,
      month,
    );
    for (const row of held) {
      const fact = facts.get(row.requestId);
      const monthly = fact?.planId ? monthlyOf.get(fact.planId) : undefined;
      if (!fact || monthly === undefined || fact.beneficiaryCount <= 0) continue;
      const list = items.get(row.costCenterId) ?? [];
      list.push({
        committedMonthlyMinor: row.seatMonthlyMinor,
        seats: fact.beneficiaryCount,
        heldMinor: row.heldMinor,
        monthlyMinor: monthly,
      });
      items.set(row.costCenterId, list);
    }

    return items;
  }

  /**
   * What one seat of each plan costs a month in each month of `year` after `month`, from the first day of the month, rounded up; a plan with no price by a billing
   * cycle in the first of those months is absent. A later month the catalog has no comparable price for keeps the price of the month before: it is not known to have
   * changed.
   */
  private async monthlyPrices(
    tx: DbTx,
    planIds: readonly string[],
    year: number,
    month: number,
  ): Promise<Map<string, bigint[]>> {
    const prices = new Map<string, bigint[]>();
    for (const planId of planIds) {
      const monthly: bigint[] = [];
      for (let later = month + 1; later <= 12; later += 1) {
        const price = await this.catalog.getPlanPrice(planId, tx, `${year}-${String(later).padStart(2, '0')}-01`);
        const comparable =
          price && price.kind === 'RECURRING' && price.billingCycle !== 'OTHER'
            ? ceilDiv(price.unitPrice.amountMinor, CYCLE_MONTHS[price.billingCycle])
            : (monthly[monthly.length - 1] ?? null);
        if (comparable === null) break;
        monthly.push(comparable);
      }
      if (monthly.length === 12 - month) prices.set(planId, monthly);
    }

    return prices;
  }
}
