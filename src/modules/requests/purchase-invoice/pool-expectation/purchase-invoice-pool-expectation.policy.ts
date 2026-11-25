import { addDays, monthBoundsOf, type BusinessDate } from '../../../../core/business-date';
import { addMonths, firstGridOffsetFrom } from '../../../../core/fiscal-year';
import { roundHalfAway } from '../../../../core/seat-month-cost';

export type PoolInvoiceBillingCycle = 'MONTHLY' | 'QUARTERLY' | 'ANNUAL' | 'OTHER';

export type PoolInvoiceExpectationSource =
  | {
      kind: 'SUBSCRIPTION';
      billingCycle: PoolInvoiceBillingCycle | null;
      purchasedQuantity: number | null;
      monthlyPriceMinor: bigint | null;
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

const DAY_MS = 86_400_000;

const PERIOD_CYCLE_MONTHS: Readonly<Record<Exclude<PoolInvoiceBillingCycle, 'OTHER'>, bigint>> = {
  MONTHLY: 1n,
  QUARTERLY: 3n,
  ANNUAL: 12n,
};

function calendarDays(from: BusinessDate, to: BusinessDate): number {
  if (to <= from) return 0;

  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

function gcd(a: bigint, b: bigint): bigint {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y !== 0n) {
    const t = x % y;
    x = y;
    y = t;
  }

  return x === 0n ? 1n : x;
}

function addFraction(a: { num: bigint; den: bigint }, b: { num: bigint; den: bigint }): { num: bigint; den: bigint } {
  const num = a.num * b.den + b.num * a.den;
  const den = a.den * b.den;
  const divisor = gcd(num, den);

  return { num: num / divisor, den: den / divisor };
}

/**
 * Exact rational sum of `coveredDays_m / daysInMonth_m` over every calendar month intersecting `[from, toInclusive]`,
 * so each purchase-date group rounds only once at the end. Pure.
 */
export function coverFraction(from: BusinessDate, toInclusive: BusinessDate): { num: bigint; den: bigint } {
  if (from > toInclusive) return { num: 0n, den: 1n };
  const endExclusive = addDays(toInclusive, 1);
  let total = { num: 0n, den: 1n };
  let cursor = from;

  while (cursor < endExclusive) {
    const { start, nextStart } = monthBoundsOf(cursor);
    const segEnd = endExclusive < nextStart ? endExclusive : nextStart;
    const daysInMonth = calendarDays(start, nextStart);
    const coveredDays = calendarDays(cursor, segEnd);
    const piece =
      coveredDays === daysInMonth ? { num: 1n, den: 1n } : { num: BigInt(coveredDays), den: BigInt(daysInMonth) };
    total = addFraction(total, piece);
    cursor = segEnd;
  }

  return total;
}

function topUpEndBoundary(
  billingCycle: PoolInvoiceBillingCycle | null,
  renewalDate: BusinessDate | null,
  endDate: BusinessDate | null,
  purchaseDate: BusinessDate,
): BusinessDate | null {
  if (billingCycle === 'ANNUAL') {
    return renewalDate ?? (endDate !== null ? addDays(endDate, 1) : null);
  }
  if (billingCycle === 'MONTHLY' || billingCycle === 'QUARTERLY') {
    const anchor = renewalDate ?? endDate;
    if (anchor === null) return null;
    const stepMonths = billingCycle === 'MONTHLY' ? 1 : 3;
    const offset = firstGridOffsetFrom(anchor, stepMonths, addDays(purchaseDate, 1));

    return addMonths(anchor, offset * stepMonths);
  }

  return null;
}

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
    const boundary = topUpEndBoundary(source.billingCycle, source.renewalDate, source.endDate, purchaseDate);
    if (boundary === null) return null;
    const cover = coverFraction(purchaseDate, addDays(boundary, -1));
    total += roundHalfAway(BigInt(count) * source.monthlyPriceMinor * cover.num, cover.den);
  }

  return total;
}

/** Expected amount in dong for a pooled-quota seat invoice; null when required inputs are absent or non-periodic. Pure. */
export function expectedPoolAmountOf(source: PoolInvoiceExpectationSource): bigint | null {
  return source.kind === 'SUBSCRIPTION' ? expectedForSubscription(source) : expectedForRequestTopUp(source);
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
