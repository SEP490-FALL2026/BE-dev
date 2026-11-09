import type { BusinessDate } from '../../../../core/business-date';
import type { SubscriptionState } from '../subscription.types';

/** The part of a subscription that says what is owed and for how long: what a change can create, raise or extend. */
export type ObligationState = Pick<
  SubscriptionState,
  'purchasedQuantity' | 'unitPrice' | 'priceSnapshot' | 'endDate' | 'renewalDate' | 'autoRenew'
>;

/** A day later than the stored one, or a day where none was set: a term that gets longer. */
const extended = (next: BusinessDate | null, current: BusinessDate | null): boolean =>
  next !== null && (current === null || next > current);

/**
 * A unit price that is higher than the stored one, or a price where none was recorded. Prices of one currency are compared in
 * that currency; across currencies they are compared in the reporting currency of their frozen conversions, and a price that
 * cannot be shown to be no higher (a conversion is missing) counts as a raise.
 */
function priceRaised(current: ObligationState, next: ObligationState): boolean {
  if (next.unitPrice === null) return false;
  if (current.unitPrice === null) return true;
  if (next.unitPrice.currency === current.unitPrice.currency) {
    return next.unitPrice.amountMinor > current.unitPrice.amountMinor;
  }
  if (next.priceSnapshot && current.priceSnapshot) {
    return next.priceSnapshot.reportingMinor > current.priceSnapshot.reportingMinor;
  }

  return true;
}

/**
 * Whether a change creates, raises or extends what the company owes for a subscription (`QĐ-88a`(2), `QĐ-89a`(3)): more seats bought than stored (or a quantity where there was none), the end or the renewal date later than the stored
 * one (or a date where there was none), auto renewal switched on, a higher unit price (or a price where there was none). A decrease,
 * a correction that raises or extends nothing and the descriptive fields are not obligations. Pure; `current` is the state under
 * the lock of the subscription row.
 */
export function increasesObligation(current: ObligationState, next: ObligationState): boolean {
  if (
    next.purchasedQuantity !== null &&
    (current.purchasedQuantity === null || next.purchasedQuantity > current.purchasedQuantity)
  ) {
    return true;
  }
  if (extended(next.endDate, current.endDate) || extended(next.renewalDate, current.renewalDate)) return true;
  if (!current.autoRenew && next.autoRenew) return true;

  return priceRaised(current, next);
}
