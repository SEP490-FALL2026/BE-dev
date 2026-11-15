import type { BusinessDate } from '../../../core/business-date';

/**
 * A stretch of days a person is placed in one department: `[from, to)`, `to` null while it is open. What the organization says of where a person
 * was on each day (`QĐ-103k`), read for the month being charged.
 */
export interface PlacementPeriod {
  departmentId: string;
  from: BusinessDate;
  to: BusinessDate | null;
}

/** What a seat of a K2 pool costs a department in one month: the days it held the seat and the amount of them (`SM-1`). */
export interface SeatMonthSegment {
  departmentId: string;
  days: number;
  amountMinor: bigint;
}

/** The days a seat is in force in the month, `[from, until)`, `until` null while it is open. */
export interface HeldRange {
  from: BusinessDate;
  until: BusinessDate | null;
}

/**
 * Whether the month was already signed off by a review period (`RV-1`): a signed month is never charged again. The review capability binds the
 * real answer; until it does, nothing is signed.
 */
export abstract class SeatMonthSignedGuard {
  abstract isSigned(month: BusinessDate): Promise<boolean>;
}
