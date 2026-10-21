import type { BusinessDate } from './business-date';

/** The period a seat is held: the first day counts, `until` is the day it ends and does not count; null is open. */
export interface SeatPeriod {
  from: BusinessDate;
  until: BusinessDate | null;
}

/** Whether a seat held over `period` is taken on `day`. */
export function occupies(period: SeatPeriod, day: BusinessDate): boolean {
  return period.from <= day && (period.until === null || day < period.until);
}

/**
 * The most seats taken on any day of `within` (`INV-01`), counting every period of `all`, which holds `within` itself
 * when it is already kept. The count can only rise on a day a seat starts, so it is taken on the first day of `within`
 * and on the first day of every other period that starts inside it. The database trigger of
 * `license_assignments` counts the same days.
 */
export function peakOccupancy(all: readonly SeatPeriod[], within: SeatPeriod): number {
  const days = new Set<BusinessDate>([within.from]);
  for (const period of all) {
    if (period.from > within.from && (within.until === null || period.from < within.until)) days.add(period.from);
  }

  let peak = 0;
  for (const day of days) {
    peak = Math.max(peak, all.filter((period) => occupies(period, day)).length);
  }

  return peak;
}
