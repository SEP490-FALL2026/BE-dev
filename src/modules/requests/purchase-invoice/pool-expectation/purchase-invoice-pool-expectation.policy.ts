import { addDays, type BusinessDate } from '../../../../core/business-date';
import {
  coverFraction,
  nextBillingBoundary,
  proratedSeatAmount,
  roundHalfAway,
} from '../../../../core/seat-month-cost';

export { coverFraction };

export type PoolInvoiceBillingCycle = 'MONTHLY' | 'QUARTERLY' | 'ANNUAL' | 'OTHER';

export interface SubscriptionLineExpectationEntry {
  seats: number;
  monthlyPriceMinor: bigint | null;
}

export interface FoldedMonthlyPurchaseEntry {
  quantity: number;
  monthlyPriceMinor: bigint;
  purchasedOn: BusinessDate;
  renewalDate: BusinessDate | null;
  endDate: BusinessDate | null;
}

export type PoolInvoiceExpectationSource =
  | {
      kind: 'SUBSCRIPTION';
      billingCycle: PoolInvoiceBillingCycle | null;
      purchasedQuantity: number | null;
      monthlyPriceMinor: bigint | null;
    }
  | {
      kind: 'SUBSCRIPTION_LINES';
      billingCycle: PoolInvoiceBillingCycle | null;
      lines: readonly SubscriptionLineExpectationEntry[];
      foldedPurchases?: readonly FoldedMonthlyPurchaseEntry[];
    }
  | {
      kind: 'SEAT_PURCHASE';
      billingCycle: PoolInvoiceBillingCycle | null;
      monthlyPriceMinor: bigint | null;
      quantity: number;
      purchasedOn: BusinessDate;
      renewalDate: BusinessDate | null;
      endDate: BusinessDate | null;
    }
  | {
      kind: 'REQUEST_TOP_UP';
      billingCycle: PoolInvoiceBillingCycle | null;
      monthlyPriceMinor: bigint | null;
      renewalDate: BusinessDate | null;
      endDate: BusinessDate | null;
      /** Business dates (`YYYY-MM-DD`, organization timezone) of completed pool top-up tasks; null/empty when unknown. */
      purchaseDates: readonly BusinessDate[] | null;
    };

export interface PoolInvoiceExpectationInput {
  source: PoolInvoiceExpectationSource;
  netMinor: bigint;
  nonDeductibleTaxMinor: bigint;
  thresholdPercent: number;
  varianceMonth: BusinessDate;
}

export interface PoolInvoiceFigures {
  expectedMinor: bigint | null;
  varianceMinor: bigint;
  varianceMonth: BusinessDate;
  inReview: boolean;
}

export interface PoolInvoiceExpectationResult {
  poolFigures: PoolInvoiceFigures;
  exceedsThreshold: boolean;
  noExpectedAmount: boolean;
}

const PERIOD_CYCLE_MONTHS: Readonly<Record<Exclude<PoolInvoiceBillingCycle, 'OTHER'>, bigint>> = {
  MONTHLY: 1n,
  QUARTERLY: 3n,
  ANNUAL: 12n,
};

function expectedForSubscription(
  source: Extract<PoolInvoiceExpectationSource, { kind: 'SUBSCRIPTION' }>,
): bigint | null {
  if (
    source.billingCycle === null ||
    source.billingCycle === 'OTHER' ||
    source.purchasedQuantity === null ||
    source.purchasedQuantity <= 0 ||
    source.monthlyPriceMinor === null ||
    source.monthlyPriceMinor <= 0n
  ) {
    return null;
  }

  return BigInt(source.purchasedQuantity) * source.monthlyPriceMinor * PERIOD_CYCLE_MONTHS[source.billingCycle];
}

function expectedForSubscriptionLines(
  source: Extract<PoolInvoiceExpectationSource, { kind: 'SUBSCRIPTION_LINES' }>,
): bigint | null {
  if (source.billingCycle === null || source.billingCycle === 'OTHER' || source.lines.length === 0) {
    return null;
  }
  const cycleMonths = PERIOD_CYCLE_MONTHS[source.billingCycle];
  let total = 0n;
  for (const line of source.lines) {
    if (line.seats < 0 || line.monthlyPriceMinor === null || line.monthlyPriceMinor <= 0n) return null;
    total += BigInt(line.seats) * line.monthlyPriceMinor * cycleMonths;
  }
  for (const purchase of source.foldedPurchases ?? []) {
    const boundary = nextBillingBoundary({
      billingCycle: 'MONTHLY',
      renewalDate: purchase.renewalDate,
      endDate: purchase.endDate,
      fromDate: purchase.purchasedOn,
    });
    if (boundary === null) return null;
    total += proratedSeatAmount({
      monthlyMinor: purchase.monthlyPriceMinor,
      seats: purchase.quantity,
      from: purchase.purchasedOn,
      untilExclusive: boundary,
    });
  }

  return total;
}

function expectedForSeatPurchase(
  source: Extract<PoolInvoiceExpectationSource, { kind: 'SEAT_PURCHASE' }>,
): bigint | null {
  if (
    source.billingCycle === null ||
    source.billingCycle === 'OTHER' ||
    source.monthlyPriceMinor === null ||
    source.monthlyPriceMinor <= 0n ||
    source.quantity <= 0
  ) {
    return null;
  }
  const boundary = nextBillingBoundary({
    billingCycle: source.billingCycle,
    renewalDate: source.renewalDate,
    endDate: source.endDate,
    fromDate: source.purchasedOn,
  });
  if (boundary === null) return null;

  return proratedSeatAmount({
    monthlyMinor: source.monthlyPriceMinor,
    seats: source.quantity,
    from: source.purchasedOn,
    untilExclusive: boundary,
  });
}

function expectedForRequestTopUp(
  source: Extract<PoolInvoiceExpectationSource, { kind: 'REQUEST_TOP_UP' }>,
): bigint | null {
  if (
    source.billingCycle === null ||
    source.billingCycle === 'OTHER' ||
    source.monthlyPriceMinor === null ||
    source.monthlyPriceMinor <= 0n ||
    source.purchaseDates === null ||
    source.purchaseDates.length === 0
  ) {
    return null;
  }

  const countByDate = new Map<BusinessDate, number>();
  for (const date of source.purchaseDates) {
    countByDate.set(date, (countByDate.get(date) ?? 0) + 1);
  }

  let total = 0n;
  for (const [purchaseDate, count] of countByDate) {
    const boundary = nextBillingBoundary({
      billingCycle: source.billingCycle,
      renewalDate: source.renewalDate,
      endDate: source.endDate,
      fromDate: purchaseDate,
    });
    if (boundary === null) return null;
    const cover = coverFraction(purchaseDate, addDays(boundary, -1));
    total += roundHalfAway(BigInt(count) * source.monthlyPriceMinor * cover.num, cover.den);
  }

  return total;
}

/** Expected amount in dong for a pooled-quota seat invoice; null when required inputs are absent or non-periodic. Pure. */
export function expectedPoolAmountOf(source: PoolInvoiceExpectationSource): bigint | null {
  switch (source.kind) {
    case 'SUBSCRIPTION':
      return expectedForSubscription(source);
    case 'SUBSCRIPTION_LINES':
      return expectedForSubscriptionLines(source);
    case 'SEAT_PURCHASE':
      return expectedForSeatPurchase(source);
    case 'REQUEST_TOP_UP':
      return expectedForRequestTopUp(source);
  }
}

/**
 * Evaluates expected amount, warehouse variance (`actual - expected`), and strict threshold breach on `netMinor`
 * (`|net - expected| * 100 > threshold * expected`) for a pooled-quota seat purchase invoice. Pure.
 */
export function evaluatePoolInvoiceExpectation(input: PoolInvoiceExpectationInput): PoolInvoiceExpectationResult {
  const actualMinor = input.netMinor + input.nonDeductibleTaxMinor;
  const expectedMinor = expectedPoolAmountOf(input.source);
  if (expectedMinor === null) {
    return {
      poolFigures: {
        expectedMinor: null,
        varianceMinor: actualMinor,
        varianceMonth: input.varianceMonth,
        inReview: false,
      },
      exceedsThreshold: false,
      noExpectedAmount: true,
    };
  }

  const netDiff = input.netMinor >= expectedMinor ? input.netMinor - expectedMinor : expectedMinor - input.netMinor;
  const exceedsThreshold = netDiff * 100n > BigInt(input.thresholdPercent) * expectedMinor;

  return {
    poolFigures: {
      expectedMinor,
      varianceMinor: actualMinor - expectedMinor,
      varianceMonth: input.varianceMonth,
      inReview: exceedsThreshold,
    },
    exceedsThreshold,
    noExpectedAmount: false,
  };
}
