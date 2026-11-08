import type { BusinessDate } from '../../../core/business-date';

/**
 * The monthly price of one seat from the unit price in the reporting currency and the cycle it is paid in (`R-I03`): a year's price
 * divided by 12, a quarter's by 3, rounded to the nearest minor unit (half up). A cycle that is not one of those (`OTHER`) or a price
 * not known gives none.
 */
export function monthlyUnitPrice(unitPriceMinor: bigint | null, billingCycle: string | null): bigint | null {
  if (unitPriceMinor === null) return null;
  switch (billingCycle) {
    case 'MONTHLY':
      return unitPriceMinor;
    case 'QUARTERLY':
      return (unitPriceMinor * 2n + 3n) / 6n;
    case 'ANNUAL':
      return (unitPriceMinor * 2n + 12n) / 24n;
    default:
      return null;
  }
}

/**
 * The months of `year` a subscription runs, counting each month it touches: no end date means it runs to the end of the year, no start
 * date that it ran from the start; one that ends before the year or starts after it runs none (`R-I03`).
 */
export function monthsRunning(year: number, startDate: BusinessDate | null, endDate: BusinessDate | null): number {
  const first = startDate !== null && startDate > `${year}-01-01` ? startDate : `${year}-01-01`;
  const last = endDate !== null && endDate < `${year}-12-31` ? endDate : `${year}-12-31`;
  if (first > last || first.slice(0, 4) !== String(year) || last.slice(0, 4) !== String(year)) return 0;

  return Number(last.slice(5, 7)) - Number(first.slice(5, 7)) + 1;
}

/** What a subscription is estimated to cost over `months` months: seats × monthly price × months; none when a figure is unknown. */
export function estimatedCost(seats: number | null, monthlyMinor: bigint | null, months: number): bigint | null {
  return seats === null || monthlyMinor === null ? null : BigInt(seats) * monthlyMinor * BigInt(months);
}

/** Whether the budget of `year` should propose to renew a subscription: its term ends within the year (a `Renew` line, `FR-5.15`). */
export const shouldSuggestRenewal = (year: number, endDate: BusinessDate | null): boolean =>
  endDate !== null && endDate >= `${year}-01-01` && endDate <= `${year}-12-31`;
