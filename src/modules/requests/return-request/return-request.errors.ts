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
  | 'NOT_FOUND';

/** The return of a seat cannot be sent as asked: the reason says why (`US-05-13`). */
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
