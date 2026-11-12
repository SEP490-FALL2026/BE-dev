import { addDays, type BusinessDate } from '../../../core/business-date';
import { nthWorkingDayFrom, type NonWorkingDates } from '../../../core/working-days';
import type { CommitmentToRelease, RightToRevoke } from './departure-impact.types';

/** The most calendar days after the last working day that a deadline of working days is counted over: ninety days hold them with the days off in between. */
const CALENDAR_WINDOW_DAYS = 90;

/** K1, K2, K4 (the key goes back to the store) and K5 have a revocation; K3 does not, so a task cannot be made for it. */
export const isRevocableType = (provisioningType: string): boolean =>
  provisioningType === 'K1' || provisioningType === 'K2' || provisioningType === 'K4' || provisioningType === 'K5';

/**
 * The day the IT Admin has until to take every right of the person away (`QĐ-110c`): the `workingDays`th working day counting the day
 * after the last working day as day 1, or the next working day when that one is a day off. A planned handover ending on Wednesday
 * 30/09 gives Thursday 01/10, and a departure blocked now on Thursday 12/11 (last working day 12/11) gives Friday 13/11 (SPEC §8, T-MF2).
 */
export function revocationDueOn(
  lastWorkingDay: BusinessDate,
  workingDays: number,
  nonWorkingDates: NonWorkingDates,
): BusinessDate {
  return nthWorkingDayFrom(addDays(lastWorkingDay, 1), workingDays, nonWorkingDates);
}

/** The last day whose days off the deadline needs: the caller reads the non-working dates from the day after the last working day to here. */
export function impactWindowEnd(lastWorkingDay: BusinessDate): BusinessDate {
  return addDays(addDays(lastWorkingDay, 1), CALENDAR_WINDOW_DAYS);
}

/** What the system gives back to the budget: what is held of the requests it closes, added by currency, in the order of the code. */
export function commitmentToRelease(
  held: readonly { requestId: string; currency: string; heldMinor: bigint }[],
): CommitmentToRelease[] {
  const totals = new Map<string, bigint>();
  for (const item of held) {
    if (item.heldMinor <= 0n) continue;
    totals.set(item.currency, (totals.get(item.currency) ?? 0n) + item.heldMinor);
  }

  return [...totals.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([currency, amount]) => ({ currency, amountMinor: amount.toString() }));
}

/** What the departure needs to know of a personal seat (a subset of what the licensing facade gives). */
export interface SeatFacts {
  assignmentId: string;
  planId: string;
  planName: string;
  applicationId: string;
  applicationName: string;
  provisioningType: string;
  revocationNote: string | null;
  dataLossOnRemoval: boolean;
  /** The revocation under way for the seat, if a task already works on it. */
  revocation: { taskId: string; status: string; source: string } | null;
}

/** A seat as the departure would take it away: what it is, how it is removed, and whether a task already works on it. */
export function rightToRevokeOf(seat: SeatFacts): RightToRevoke {
  return {
    assignmentId: seat.assignmentId,
    application: { id: seat.applicationId, name: seat.applicationName },
    plan: { id: seat.planId, name: seat.planName },
    provisioningType: seat.provisioningType,
    revocable: isRevocableType(seat.provisioningType),
    dataLossOnRemoval: seat.dataLossOnRemoval,
    revocationNote: seat.revocationNote,
    revocationUnderWay: seat.revocation !== null,
  };
}
