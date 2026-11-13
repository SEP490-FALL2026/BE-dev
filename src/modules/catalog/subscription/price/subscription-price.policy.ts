import type { BusinessDate } from '../../../../core/business-date';
import { DONG, type Money } from '../../../../core/money/money';
import { SubscriptionPriceNotVndError } from '../subscription.errors';
import type { PriceSnapshotRecord } from '../subscription.types';

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
