import type { SubscriptionRecord } from '../subscription.types';

const CYCLE_MONTHS: Readonly<Record<string, number>> = { MONTHLY: 1, QUARTERLY: 3, ANNUAL: 12 };

/** The price of one seat for a month in dong (the price of its cycle over the months of the cycle, rounded up) and the months a payment pays for. */
export function monthlyCostOf(record: Pick<SubscriptionRecord, 'billingCycle' | 'priceSnapshot' | 'unitPrice'>): {
  monthlyPriceMinor: bigint | null;
  cycleMonths: number | null;
} {
  const cycleMonths = record.billingCycle === null ? null : (CYCLE_MONTHS[record.billingCycle] ?? null);
  const price =
    record.priceSnapshot?.reportingMinor ??
    (record.unitPrice?.currency === 'VND' ? record.unitPrice.amountMinor : null);
  if (cycleMonths === null || price === null) return { monthlyPriceMinor: null, cycleMonths };
  const months = BigInt(cycleMonths);

  return { monthlyPriceMinor: (price + months - 1n) / months, cycleMonths };
}
