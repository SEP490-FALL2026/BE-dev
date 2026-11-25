import { Injectable } from '@nestjs/common';
import { addDays, monthBoundsOf, type BusinessDate } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { CatalogApi } from '../../catalog/public/catalog.api';
import { SubscriptionPeriodApi } from '../../catalog/public/subscription-period.api';
import { AssignmentSeatMonthRepo } from '../assignment/assignment-seat-month.repo';
import { SubscriptionRenewalRepo } from '../subscription-renewal/subscription-renewal.repo';
import type { SeatInForce, SeatOfMonth, UnrequestedK1SeatInForce } from './licensing-seat-month.types';

/**
 * The licensing facade for the cost of a month of the seats of the shared pool (`SM-1`, `QĐ-103k`): which seats of a `K2` plan were in force on
 * some day of the month. The price of a month belongs to the subscription (catalog) and the department of the holder on each day to the
 * organization; the budgets context puts the three together.
 */
@Injectable()
export class LicensingSeatMonthApi {
  constructor(
    private readonly seats: AssignmentSeatMonthRepo,
    private readonly catalog: CatalogApi,
    private readonly renewals: SubscriptionRenewalRepo,
    private readonly periods: SubscriptionPeriodApi,
  ) {}

  /**
   * The seats of the plans of the shared pool of seats (`K2`) on a subscription that are in force on at least one day of the month of `month`
   * (any day of it), by subscription then seat. Two reads for the plans and the seats, whatever their number. With `subscriptionId` only the seats of
   * that subscription are read, which is what the charge of one subscription reads inside its own transaction, under the lock of its month.
   */
  async getSeatsOfMonth(month: BusinessDate, tx?: DbTx, subscriptionId?: string): Promise<SeatOfMonth[]> {
    const { start, nextStart } = monthBoundsOf(month);
    const pools = await this.k2PlansTouching(start, nextStart, tx, subscriptionId);

    return this.seats.seatsOfPlans(pools, start, nextStart, tx, subscriptionId);
  }

  /**
   * The seats of K2 pool subscriptions that are in force on `day` (`heldFrom <= day && (heldUntil === null || day < heldUntil)`).
   */
  async getSeatsInForceOn(day: BusinessDate, tx?: DbTx): Promise<SeatInForce[]> {
    const pools = await this.k2PlansTouching(day, addDays(day, 1), tx);

    return this.seats.seatsInForceOfPlans(pools, day, tx);
  }

  /** Active standalone K1 seats without a Request on `day` (`K-A2`), enriched with plan VND monthly reference prices. */
  async getUnrequestedK1SeatsInForceOn(day: BusinessDate, tx?: DbTx): Promise<UnrequestedK1SeatInForce[]> {
    const planIds = await this.seats.standalonePlanIdsOn(day, tx);
    if (planIds.length === 0) return [];
    const k1Targets = (await this.catalog.findPlanSeatTargets(planIds, tx)).filter(
      (target) => target.provisioningType === 'K1',
    );
    if (k1Targets.length === 0) return [];
    const priceByPlan = new Map(k1Targets.map((target) => [target.planId, target.monthlyUnitPriceMinor ?? null]));
    const seats = await this.seats.unrequestedK1SeatsInForceOfPlans(
      k1Targets.map((target) => target.planId),
      day,
      tx,
    );

    return seats.map((seat) => ({
      ...seat,
      referenceMonthlyPriceMinor: priceByPlan.get(seat.planId) ?? null,
    }));
  }

  private async k2PlansTouching(
    start: BusinessDate,
    nextStart: BusinessDate,
    tx?: DbTx,
    subscriptionId?: string,
  ): Promise<string[]> {
    const planIds = await this.seats.planIdsTouching(start, nextStart, tx, subscriptionId);
    const pools = (await this.catalog.findPlanSeatTargets(planIds, tx))
      .filter((target) => target.provisioningType === 'K2')
      .map((target) => target.planId);

    return [...new Set(pools)];
  }

  /**
   * Next-period purchased seat counts confirmed on recorded renewal outcomes (`Q-F`), keyed by subscription id. Subscriptions
   * whose renewal has no recorded outcome (or whose outcome did not confirm a reduction) are omitted so callers fall back to `q`.
   */
  async getNextPeriodQuantities(subscriptionIds: readonly string[], tx?: DbTx): Promise<Map<string, number>> {
    const casesBySub = await this.renewals.ofSubscriptions(subscriptionIds, tx);
    const nextIds: string[] = [];
    const nextBySub = new Map<string, string>();
    const result = new Map<string, number>();

    for (const [subId, cases] of casesBySub) {
      const latestOutcome = [...cases].reverse().find((c) => c.outcome !== null);
      if (!latestOutcome?.outcome) continue;
      if (latestOutcome.outcome.nextSubscriptionId !== null) {
        nextBySub.set(subId, latestOutcome.outcome.nextSubscriptionId);
        nextIds.push(latestOutcome.outcome.nextSubscriptionId);
      } else if (latestOutcome.outcome.kind === 'AS_DECIDED' && latestOutcome.decision?.choice === 'CANCEL') {
        result.set(subId, 0);
      }
    }

    if (nextIds.length > 0) {
      const qtyByNextId = new Map(
        (await this.periods.getPurchaseFacts([...new Set(nextIds)], tx))
          .filter((fact) => fact.purchasedQuantity !== null)
          .map((fact) => [fact.subscriptionId, fact.purchasedQuantity as number]),
      );
      for (const [subId, nextId] of nextBySub) {
        const qty = qtyByNextId.get(nextId);
        if (qty !== undefined) result.set(subId, qty);
      }
    }

    return result;
  }
}
