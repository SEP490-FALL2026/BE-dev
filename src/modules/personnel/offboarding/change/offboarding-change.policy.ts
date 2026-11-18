import type { BusinessDate } from '../../../../core/business-date';
import type { PendingBlockOutcome } from '../../../identity-access/public/identity-access.types';
import type { WithdrawnRevocation } from '../../../licensing/public/licensing.types';
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

/**
 * Whether cancelling a handover also takes back what the block did (`QĐ-110c`, `QĐ-100z`): the reasons of the departure on the tasks
 * of revocation and the registrations of the machines of the person. Only when the block had taken effect (the last working day is
 * past): before it nothing was taken away, so there is nothing to take back, and the person keeps their machines.
 */
export function cancelTakesBackEffects(block: PendingBlockOutcome): boolean {
  return block === 'IN_FORCE';
}

/** What taking back the reasons of the departure did to the tasks, by outcome: the `revocationsWithdrawn` of the answer. */
export interface RevocationsWithdrawn {
  /** Tasks that waited and now are cancelled as no longer applying. */
  cancelled: number;
  /** Tasks in progress, left to the IT Admin who works them to close by what happened at the provider. */
  itAdminToClose: number;
  /** Tasks that go on because another source still asks for the revocation. */
  continues: number;
  /** Tasks already completed (a K1 seat whose access runs on to the end of the paid period): nothing is taken back and nothing is left to the IT Admin. */
  alreadyDone: number;
}

/** The count of the outcomes of the withdrawals; a seat the departure never asked a revocation for, or whose task ended, counts nowhere. */
export function revocationsWithdrawnOf(outcomes: readonly WithdrawnRevocation['outcome'][]): RevocationsWithdrawn {
  const count = (outcome: WithdrawnRevocation['outcome']): number => outcomes.filter((one) => one === outcome).length;

  return {
    cancelled: count('CANCELLED'),
    itAdminToClose: count('IT_ADMIN_TO_CLOSE'),
    continues: count('CONTINUES'),
    alreadyDone: count('ALREADY_ENDED'),
  };
}
