import { monthBoundsOf, type BusinessDate } from '../../../core/business-date';

/**
 * A period of a subscription of the shared pool (`K2`) as the line of the pool reads it: the days it runs, the seats bought and what one seat costs a month.
 * The price of a month is the price of its billing cycle over the months of the cycle, so a purchase of a year is the same price every month it runs.
 */
export interface PoolPeriod {
  subscriptionId: string;
  startDate: BusinessDate | null;
  endDate: BusinessDate | null;
  purchasedQuantity: number | null;
  monthlyPriceMinor: bigint | null;
}

/** Whether the period runs on some day of the month (the first day of it): from the month of its first day to the month of its last day. */
export function inForce(period: Pick<PoolPeriod, 'startDate' | 'endDate'>, month: BusinessDate): boolean {
  const { start, nextStart } = monthBoundsOf(month);

  return (
    (period.startDate === null || period.startDate < nextStart) && (period.endDate === null || period.endDate >= start)
  );
}

/** What the seats paid for cost a month: the seats bought times the price of a month; null when either is not known. */
export function paidMinor(period: Pick<PoolPeriod, 'purchasedQuantity' | 'monthlyPriceMinor'>): bigint | null {
  if (period.purchasedQuantity === null || period.monthlyPriceMinor === null) return null;

  return BigInt(period.purchasedQuantity) * period.monthlyPriceMinor;
}

/**
 * The line "not allocated, shared pool" of one subscription in one month (`QĐ-104c`(2), `QĐ-103k`): the seats paid for at the price of a month, less the
 * seat-months charged to departments. The invoice is the proof of what was paid and says nothing about which month a cost belongs to, so it is not the
 * line: a purchase of a year booked in its first month does not make that month carry the year. Only when the seats paid for or the price of a month is
 * not known is the line what the invoices of the month cost less the seat-months.
 */
export function poolLineMinor(input: {
  paidMinor: bigint | null;
  invoicedMinor: bigint;
  allocatedMinor: bigint;
}): bigint {
  return (input.paidMinor ?? input.invoicedMinor) - input.allocatedMinor;
}
