import { RevocationHookRefusedError } from '../../licensing/public/licensing.errors';
import type { ReturnableProblem, SenderRefusal } from './return-request.policy';

export type ReturnRefusal =
  | SenderRefusal
  /** The seat named does not exist. */
  | 'ASSIGNMENT_NOT_FOUND'
  /** The holder belongs to no department on the day: a return is read by the head of that department. */
  | 'NO_DEPARTMENT'
  | 'ASSIGNMENT_NOT_RETURNABLE'
  /** The seat already has a return waiting for its revocation. */
  | 'ALREADY_REQUESTED'
  /** A renewal of the seat waits for its decision: the return waits for it too. */
  | 'RENEWAL_PENDING'
  /** The request the return says it follows is not the one that made the seat, or the person has no part in it. */
  | 'ORIGIN_MISMATCH'
  /** The return does not exist, or the person has no part in it: the two answer alike so a return cannot be probed. */
  | 'NOT_FOUND'
  | 'NOT_REQUESTER'
  | 'HANDOVER_NOT_REQUIRED'
  | 'HANDOVER_ALREADY_CONFIRMED'
  /** The return has ended: its revocation is completed or failed. */
  | 'NOT_AWAITING';

/** The return of a seat cannot be sent or confirmed as asked: the reason says why (`US-05-13`). */
export class ReturnRequestRefusedError extends Error {
  constructor(
    readonly reason: ReturnRefusal,
    /** Why the seat cannot be returned, for `ASSIGNMENT_NOT_RETURNABLE`. */
    readonly problem: ReturnableProblem | null = null,
  ) {
    super(`The return of the seat is refused: ${reason}.`);
    this.name = 'ReturnRequestRefusedError';
  }
}

/**
 * The revocation of a seat that was returned cannot be completed yet: the handover that loses data is not confirmed by the person
 * who triggered the return, and its deadline has not passed (`US-05-13` AC-6). Thrown from the hook of the revocation, which the
 * licensing mapper answers as a conflict with this code.
 */
export class ReturnHandoverPendingError extends RevocationHookRefusedError {
  constructor(returnRequestId: string, dueOn: string) {
    super(
      'PROVISIONING.HANDOVER_PENDING',
      'The handover of the data has to be confirmed before the seat is taken away.',
      {
        returnRequestId,
        dueOn,
      },
    );
  }
}
