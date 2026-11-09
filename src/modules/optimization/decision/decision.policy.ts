import { addDays, type BusinessDate } from '../../../core/business-date';
import { addMonths } from '../../../core/fiscal-year';
import type { GhostSeatState } from '../ghost-seat/ghost-seat.types';
import { DECIDABLE_STATES } from '../ghost-seat/ghost-seat-state.policy';

/** The exemption of a head lasts at most 12 calendar months and begins after the day it is decided (`INV-09`, `FR-3.10`). */
export const EXEMPTION_MAX_MONTHS = 12;
/** A right that ends within this many calendar months is left to end (`R-J06`, QT exception of `MF-5`). */
export const LEFT_TO_EXPIRE_MONTHS = 1;

/** Why a head's choice of _exempt_ is refused: no day, or a day that is not in `(today, today + 12 months]` (a 12-month exemption is fine). */
export function exemptionProblemOf(
  today: BusinessDate,
  exemptUntil: BusinessDate | undefined,
): 'REQUIRED' | 'TOO_LONG' | null {
  if (exemptUntil === undefined) return 'REQUIRED';

  return exemptUntil <= today || exemptUntil > addMonths(today, EXEMPTION_MAX_MONTHS) ? 'TOO_LONG' : null;
}

/** `R-J06`: a right with an end day within one calendar month is closed to expire by itself; none with no end day. */
export const isLeftToExpire = (expectedEndDate: BusinessDate | null, today: BusinessDate): boolean =>
  expectedEndDate !== null && expectedEndDate <= addMonths(today, LEFT_TO_EXPIRE_MONTHS);

/**
 * The first day the revocation of a reclaim can be taken (`BR-MF5-04`, `Q-88`): the day the head decided plus the grace in calendar days;
 * after a return the day already promised to the holder stands, but never a day before today.
 */
export function graceNotBefore(input: {
  decidedOn: BusinessDate;
  graceDays: number;
  previous: BusinessDate | null;
}): BusinessDate {
  const first = addDays(input.decidedOn, input.graceDays);
  if (input.previous === null) return first;

  return input.previous > input.decidedOn ? input.previous : input.decidedOn;
}

/** The ids of a batch once each, in ascending order: the order every service locks in (`DA6-23`), and the end of a duplicate id (`Q-94`). */
export const lockOrderOf = (ids: readonly string[]): string[] => [...new Set(ids)].sort();

export type DecidableVerdict = 'OK' | 'NOT_DECIDER' | 'PAUSED' | 'NOT_DECIDABLE';

/**
 * Whether the caller may decide on a recommendation now (`US-10-06` AC-8): only the head of the department that was asked, only while it is
 * waiting for them or was returned to them; a paused one answers `PAUSED`. Who is not the head is told nothing about the state.
 */
export function decidableVerdictOf(input: {
  state: GhostSeatState;
  deciderDepartmentId: string | null;
  callerHeadedDepartmentId: string | null;
}): DecidableVerdict {
  if (input.deciderDepartmentId === null || input.deciderDepartmentId !== input.callerHeadedDepartmentId) {
    return 'NOT_DECIDER';
  }
  if (input.state === 'PAUSED') return 'PAUSED';

  return DECIDABLE_STATES.includes(input.state) ? 'OK' : 'NOT_DECIDABLE';
}

/** The head decides on their own seat (`US-10-03` AC-13): the reason is mandatory for every choice and the act is marked. */
export const isSelfDecided = (holderEmployeeId: string | null, deciderEmployeeId: string): boolean =>
  holderEmployeeId !== null && holderEmployeeId === deciderEmployeeId;
