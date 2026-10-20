import { formatRate } from '../../../core/money/rate';
import type { ConversionSnapshot } from '../../finance/finance.types';
import type { PriceSnapshotRecord, SubscriptionRecord, SubscriptionState } from './subscription.types';

/** What the audit trail keeps of a subscription: the business fields, the price and its frozen conversion as text. */
export const snapshotOf = (record: SubscriptionRecord) => ({
  quantity: record.purchasedQuantity,
  unitPrice: record.unitPrice
    ? `${record.unitPrice.amountMinor} ${record.unitPrice.currency} on ${record.unitPrice.recordedOn}`
    : null,
  reporting: record.priceSnapshot
    ? `${record.priceSnapshot.reportingMinor} ${record.priceSnapshot.reportingCurrency} at ${formatRate(record.priceSnapshot.rate)} of ${record.priceSnapshot.rateDate}`
    : null,
  billingCycle: record.billingCycle,
  startDate: record.startDate,
  endDate: record.endDate,
  renewalDate: record.renewalDate,
  noticeDeadline: record.noticeDeadline,
  noticePeriodDays: record.noticePeriodDays,
  autoRenew: record.autoRenew,
  allowsMidTermReduction: record.allowsMidTermReduction,
  status: record.status,
});

/** The whole mutable state of a stored subscription. */
export const stateOf = (record: SubscriptionRecord): SubscriptionState => ({
  status: record.status,
  purchasedQuantity: record.purchasedQuantity,
  unitPrice: record.unitPrice,
  priceSnapshot: record.priceSnapshot,
  billingCycle: record.billingCycle,
  startDate: record.startDate,
  endDate: record.endDate,
  renewalDate: record.renewalDate,
  noticeDeadline: record.noticeDeadline,
  noticePeriodDays: record.noticePeriodDays,
  autoRenew: record.autoRenew,
  allowsMidTermReduction: record.allowsMidTermReduction,
});

/** The state in one fixed order of keys, with money as text, so that two equal states serialize equally. */
const canonical = (state: SubscriptionState): string =>
  JSON.stringify([
    state.status,
    state.purchasedQuantity,
    state.unitPrice && [state.unitPrice.amountMinor.toString(), state.unitPrice.currency, state.unitPrice.recordedOn],
    state.priceSnapshot && [
      state.priceSnapshot.rate.toString(),
      state.priceSnapshot.rateDate,
      state.priceSnapshot.rateSource,
      state.priceSnapshot.reportingMinor.toString(),
      state.priceSnapshot.reportingCurrency,
      state.priceSnapshot.exchangeRateId,
    ],
    state.billingCycle,
    state.startDate,
    state.endDate,
    state.renewalDate,
    state.noticeDeadline,
    state.noticePeriodDays,
    state.autoRenew,
    state.allowsMidTermReduction,
  ]);

/** True when two states hold the same data. */
export const sameState = (a: SubscriptionState, b: SubscriptionState): boolean => canonical(a) === canonical(b);

/** The stored form of a conversion the finance facade took. */
export function toSnapshot(result: ConversionSnapshot): PriceSnapshotRecord {
  return {
    rate: result.rate,
    rateDate: result.rateDate,
    rateSource: result.rateSource,
    reportingMinor: result.reportingAmountMinor,
    reportingCurrency: result.reportingCurrency,
    exchangeRateId: result.exchangeRateId,
  };
}
