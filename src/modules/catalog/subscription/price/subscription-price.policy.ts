import type { BusinessDate } from '../../../../core/business-date';
import { DONG, type Money } from '../../../../core/money/money';
import { SubscriptionPriceNotVndError } from '../subscription.errors';
import type { PriceSnapshotRecord, SubscriptionRecord } from '../subscription.types';

/** The one currency a unit price is entered in (`QĐ-111an`, R-4): the reporting currency of the organization is fixed to it. */
export const PRICE_CURRENCY = DONG;

/** The rate 1 of ADR-0007 (`ScaledRate`: the rate times 10^10). */
const RATE_ONE = 10n ** 10n;

/** A price is accepted only in dong. Throws SubscriptionPriceNotVndError. */
export function assertPriceInDong(currency: string): void {
  if (currency !== PRICE_CURRENCY) throw new SubscriptionPriceNotVndError(currency);
}

/**
 * The snapshot of a price in dong: the rate 1 of the same currency (`SAME_CURRENCY`), dated by the day the price is recorded, with the price
 * itself as the reporting price and no exchange-rate row behind it. It is written for every price (S-1, D2) so that the constraints of the
 * table (`subscriptions_snapshot_whole`, `subscriptions_active_complete`) and the readers of the reporting price stay as they are. Throws
 * SubscriptionPriceNotVndError for another currency: nothing here converts.
 */
export function uniformSnapshotOf(price: Money, recordedOn: BusinessDate): PriceSnapshotRecord {
  assertPriceInDong(price.currency);

  return {
    rate: RATE_ONE,
    rateDate: recordedOn,
    rateSource: 'SAME_CURRENCY',
    reportingMinor: price.amountMinor,
    reportingCurrency: PRICE_CURRENCY,
    exchangeRateId: null,
  };
}

/**
 * Whether the unit price is one the system can use: entered in dong, with its snapshot. A price an earlier release left in another currency
 * (no rate was entered to convert it once) is not, until it is entered again in dong: the subscription lacks its price.
 */
export function isPricedInDong(state: { unitPrice: { currency: string } | null; priceSnapshot: unknown }): boolean {
  return state.unitPrice !== null && state.unitPrice.currency === PRICE_CURRENCY && state.priceSnapshot !== null;
}

const CYCLE_MONTHS: Readonly<Record<string, number>> = { MONTHLY: 1, QUARTERLY: 3, ANNUAL: 12 };

/**
 * The price of one seat for one month in dong, read directly from the stored `monthlyUnitPriceMinor` column (`QĐ-115e`).
 * Returns null when no monthly price is stored (for example a perpetual purchase or an unpriced draft).
 */
export function monthlyPriceOf(record: Pick<SubscriptionRecord, 'monthlyUnitPriceMinor'>): bigint | null {
  return record.monthlyUnitPriceMinor ?? null;
}

/** The price of one seat for a month in dong (from `monthlyPriceOf`) and the months a payment pays for. */
export function monthlyCostOf(record: Pick<SubscriptionRecord, 'billingCycle' | 'monthlyUnitPriceMinor'>): {
  monthlyPriceMinor: bigint | null;
  cycleMonths: number | null;
} {
  const cycleMonths = record.billingCycle === null ? null : (CYCLE_MONTHS[record.billingCycle] ?? null);
  if (cycleMonths === null) return { monthlyPriceMinor: null, cycleMonths: null };

  return { monthlyPriceMinor: monthlyPriceOf(record), cycleMonths };
}

/** What a plan is bought at, and where that price comes from: a subscription of the plan, or the reference price of the plan itself (`QĐ-113a`). */
export interface PlanPriceFacts {
  kind: 'RECURRING' | 'ONE_TIME';
  provisioningType?: 'K1' | 'K2' | 'K3' | 'K4' | 'K5';
  referenceCommitmentMonths?: 1 | 12 | null;
  unitPrice: Money;
  /** The unit price converted to the reporting currency when it was recorded (`M-17`); null when it was not converted. */
  reportingUnitPrice: Money | null;
  /** The monthly price of one seat in dong from `monthly_unit_price_minor` (or `referencePriceMinor` for K1/K2); null for `ONE_TIME` or when unset. */
  monthlyPriceMinor: bigint | null;
  billingCycle: 'MONTHLY' | 'QUARTERLY' | 'ANNUAL' | 'OTHER';
  /** The subscription may be cut before its term ends (`QĐ-96f`): a request on it runs to the end of the fiscal year at most. */
  allowsMidTermReduction: boolean;
  /** `SUBSCRIPTION`: the main subscription of the plan prices it; `PLAN_REFERENCE`: the plan has none that does and its own reference price stands in (`QĐ-113a`). */
  source: 'SUBSCRIPTION' | 'PLAN_REFERENCE';
}

/**
 * The cycle a reference price is counted by (`QĐ-113a`): K1 and K2 give the price of one seat for one month, K4 the price of one purchase; any other
 * kind has no reference price. It is what the catalog of requestable software counts as a price that exists.
 */
export function referenceCycleOf(kind: string): 'MONTHLY' | 'ONE_TIME' | undefined {
  if (kind === 'K1' || kind === 'K2') return 'MONTHLY';

  return kind === 'K4' ? 'ONE_TIME' : undefined;
}

/**
 * The price facts the reference price of a plan gives when no subscription prices it (`QĐ-113a`): recurring by the month for K1 and K2, once for K4.
 * Dong is the reporting currency, so the reporting price is the price itself. Null when the plan has no reference price or its kind cannot have one.
 */
export function referencePriceSourceOf(
  kind: string,
  price: Money | null,
  referenceCommitmentMonths?: 1 | 12 | null,
): PlanPriceFacts | null {
  const cycle = referenceCycleOf(kind);
  if (price === null || cycle === undefined) return null;

  return {
    kind: cycle === 'MONTHLY' ? 'RECURRING' : 'ONE_TIME',
    ...(kind === 'K1' || kind === 'K2' || kind === 'K4' ? { provisioningType: kind } : {}),
    ...(referenceCommitmentMonths !== undefined ? { referenceCommitmentMonths } : {}),
    unitPrice: price,
    reportingUnitPrice: price,
    monthlyPriceMinor: cycle === 'MONTHLY' ? price.amountMinor : null,
    billingCycle: cycle === 'MONTHLY' ? 'MONTHLY' : 'OTHER',
    allowsMidTermReduction: false,
    source: 'PLAN_REFERENCE',
  };
}
