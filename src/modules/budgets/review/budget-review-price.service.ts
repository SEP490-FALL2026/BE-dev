import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
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
 * hook of the commitments), the price of the plan from the first day after the month closed, and the months of the year the commitment still covers. The policy
 * (`knownPriceIncrease`) keeps only what rose. A commitment whose request or plan is not known, or whose price is not by a billing cycle, is left out: it cannot
 * be compared. Nothing is written, and the commitment keeps the price it was made at (`QĐ-97d`).
 */
@Injectable()
export class BudgetReviewPriceService {
  constructor(
    private readonly commitments: CommitmentRepo,
    private readonly requestFacts: CommitmentRequestFactsHook,
    private readonly catalog: CatalogApi,
  ) {}

  /** The commitments of each Cost Center that have a price to compare, for the months after `month` of `year`; `from` is the first day of the month after. */
  async itemsOf(
    tx: DbTx,
    costCenterIds: readonly string[],
    year: number,
    month: number,
    from: BusinessDate,
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
      from,
    );
    for (const row of held) {
      const fact = facts.get(row.requestId);
      const current = fact?.planId ? monthlyOf.get(fact.planId) : undefined;
      if (!fact || current === undefined || fact.beneficiaryCount <= 0) continue;
      const seats = BigInt(fact.beneficiaryCount);
      const covered = Number(ceilDiv(row.heldMinor, seats * row.seatMonthlyMinor));
      const list = items.get(row.costCenterId) ?? [];
      list.push({
        currentMonthlyMinor: current,
        committedMonthlyMinor: row.seatMonthlyMinor,
        seats: fact.beneficiaryCount,
        monthsLeft: Math.min(12 - month, covered),
      });
      items.set(row.costCenterId, list);
    }

    return items;
  }

  /** What one seat of each plan costs a month from `from`, rounded up; a plan with no price by a billing cycle is absent. */
  private async monthlyPrices(tx: DbTx, planIds: readonly string[], from: BusinessDate): Promise<Map<string, bigint>> {
    const prices = new Map<string, bigint>();
    for (const planId of planIds) {
      const price = await this.catalog.getPlanPrice(planId, tx, from);
      if (!price || price.kind !== 'RECURRING' || price.billingCycle === 'OTHER') continue;
      prices.set(planId, ceilDiv(price.unitPrice.amountMinor, CYCLE_MONTHS[price.billingCycle]));
    }

    return prices;
  }
}
