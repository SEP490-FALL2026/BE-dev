import { fromDateColumn, toDateColumn, type BusinessDate } from '../../../core/business-date';
import { Prisma } from '../../../generated/prisma/client';
import type { BillingCycle } from './subscription.types';

/** The queries that tell which subscription prices a plan: shared by the price reads of `SubscriptionRepo`. */

/**
 * The subscriptions that can price a plan: active, with a unit price, a currency and a billing cycle, and not already continued by a later
 * period that is active itself (that one prices the plan; a later period still a draft leaves the price with this one, F-012). Its end date
 * is not looked at here, the repository has no calendar. No department is asked: the pool is the plan's. A draft has no price to rely on.
 * `pickPriceSource` chooses the one that prices the plan among them (`Q-04` C).
 */
export const livePricedOf = (): Prisma.SubscriptionWhereInput => ({
  status: 'ACTIVE',
  unitPriceMinor: { not: null },
  unitPriceCurrency: { not: null },
  AND: [
    { OR: [{ renewedBy: null }, { renewedBy: { is: { status: { not: 'ACTIVE' } } } }] },
    // A perpetual purchase has a price and no billing cycle: its price is the price of the purchase (`QĐ-106d`).
    { OR: [{ billingCycle: { not: null } }, { kind: 'PERPETUAL' }] },
    // A period that has already ended does not price the plan any more (review G23-05); the UTC day is close enough here.
    { OR: [{ endDate: null }, { endDate: { gte: new Date(new Date().toISOString().slice(0, 10)) } }] },
  ],
});

/** A K4 plan always carries its purchase price, paid once (`QĐ-106d`, review G23-04), whatever kind of subscription records it. */
export const PLAN_KIND = { plan: { select: { provisioningType: true } } } as const;

/** The priced subscriptions of a plan whose period runs on `on`: begun by it, not ended before it, not continued by a period begun by it. */
export const pricedOn = (on: BusinessDate): Prisma.SubscriptionWhereInput => {
  const day = toDateColumn(on);

  return {
    status: 'ACTIVE',
    unitPriceMinor: { not: null },
    unitPriceCurrency: { not: null },
    AND: [
      { OR: [{ billingCycle: { not: null } }, { kind: 'PERPETUAL' }] },
      { OR: [{ startDate: null }, { startDate: { lte: day } }] },
      { OR: [{ endDate: null }, { endDate: { gte: day } }] },
      { OR: [{ renewedBy: { is: null } }, { renewedBy: { is: { startDate: { gt: day } } } }] },
    ],
  };
};
export const PRICE_FIELDS = {
  kind: true,
  unitPriceMinor: true,
  unitPriceCurrency: true,
  priceReportingMinor: true,
  priceReportingCurrency: true,
  billingCycle: true,
  allowsMidTermReduction: true,
} as const;

/** A priced row as `pickPriceSource` reads it: the price and the cycle are there (`livePricedOf` asks for them). */
export const withPriceSource = <
  R extends {
    id: string;
    startDate: Date | null;
    isPrimaryForPlan: boolean;
    unitPriceMinor: bigint | null;
    priceReportingMinor: bigint | null;
    billingCycle: BillingCycle | null;
  },
>(
  row: R,
) => ({
  ...row,
  startDate: row.startDate ? fromDateColumn(row.startDate) : null,
  unitPriceMinor: row.unitPriceMinor ?? 0n,
  reportingPriceMinor: row.priceReportingMinor,
  billingCycle: row.billingCycle ?? 'OTHER',
});
