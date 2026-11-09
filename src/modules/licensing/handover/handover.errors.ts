import type { BusinessDate } from '../../../core/business-date';
import { RevocationHookRefusedError } from '../public/licensing.errors';
import type { HandoverRole, WaitingReason } from './handover-confirmer.policy';

/**
 * The work on a seat is held until the person who confirms the handover has done it, or its deadline ends (`US-03-09` AC-3, AC-5,
 * `US-07-05` AC-13). Thrown from the hook of the revocation, so the route of the task answers it as a conflict with this code and
 * nothing is changed.
 */
export class HandoverConfirmationPendingError extends RevocationHookRefusedError {
  constructor(dutyId: string, dueOn: BusinessDate, role: HandoverRole, waiting: WaitingReason | null) {
    super(
      'HANDOVER.CONFIRMATION_PENDING',
      'The handover of the data has to be confirmed before the seat is taken away.',
      {
        dutyId,
        dueOn,
        role,
        waitingReason: waiting,
      },
    );
  }
}

export type HandoverDutyProblem =
  /** The duty does not exist, or the caller has nothing to do with it. */
  | 'NOT_FOUND'
  /** Someone who is not an IT Admin asked for every duty. */
  | 'SCOPE_FORBIDDEN'
  /** The caller is not the person the duty falls to. */
  | 'NOT_CONFIRMER'
  /** The value is not one the source of the duty allows. */
  | 'VALUE_NOT_ALLOWED'
  | 'ALREADY_CONFIRMED'
  | 'CANCELLED';

/** A refusal to read or to confirm a duty; nothing is written. */
export class HandoverDutyError extends Error {
  constructor(readonly problem: HandoverDutyProblem) {
    super(`The handover duty cannot be used: ${problem}`);
    this.name = 'HandoverDutyError';
  }
}
