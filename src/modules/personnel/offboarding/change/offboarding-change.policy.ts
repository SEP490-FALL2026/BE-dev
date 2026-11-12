import type { BusinessDate } from '../../../../core/business-date';
import type { AccessBlockMode, OffboardingState } from '../offboarding.types';

/** What the new last working day is judged against (`US-03-04` AC-14): the facts of the case, the person and the placement, and the move. */
export function changeFactsOf(
  held: { state: OffboardingState; accessBlockMode: AccessBlockMode; lastWorkingDay: BusinessDate },
  read: {
    today: BusinessDate;
    hireDate: BusinessDate;
    placementFrom: BusinessDate | null;
    newLastWorkingDay: BusinessDate;
    reason: string;
    groundsNote?: string | undefined;
  },
) {
  return {
    state: held.state,
    accessBlockMode: held.accessBlockMode,
    today: read.today,
    hireDate: read.hireDate,
    placementFrom: read.placementFrom,
    currentLastWorkingDay: held.lastWorkingDay,
    newLastWorkingDay: read.newLastWorkingDay,
    reason: read.reason,
    groundsNote: read.groundsNote,
  };
}
