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
