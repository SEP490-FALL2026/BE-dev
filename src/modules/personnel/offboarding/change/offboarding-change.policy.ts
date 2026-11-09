import type { BusinessDate } from '../../../../core/business-date';
import type { GroundsInput } from '../../personnel-grounds.policy';
import type { OffboardingState } from '../offboarding.types';

/** What the new last working day is judged against (`US-03-04` AC-14): the facts of the case, the person and the placement, and the move. */
export function changeFactsOf(
  held: { state: OffboardingState; lastWorkingDay: BusinessDate },
  read: {
    today: BusinessDate;
    hireDate: BusinessDate;
    placementFrom: BusinessDate | null;
    newLastWorkingDay: BusinessDate;
    reason: string;
    grounds?: GroundsInput | undefined;
  },
) {
  return {
    state: held.state,
    today: read.today,
    hireDate: read.hireDate,
    placementFrom: read.placementFrom,
    currentLastWorkingDay: held.lastWorkingDay,
    newLastWorkingDay: read.newLastWorkingDay,
    reason: read.reason,
    grounds: read.grounds,
  };
}
