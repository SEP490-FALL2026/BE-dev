import type { EndRefusal, RenewableProblem, RenewalSenderRefusal } from './renewal-request.policy';

export type RenewalRefusal =
  | RenewalSenderRefusal
  | EndRefusal
  /** The seat named does not exist. */
  | 'ASSIGNMENT_NOT_FOUND'
  | 'ASSIGNMENT_NOT_RENEWABLE'
  /** The seat already has a request for its renewal that waits for its decision. */
  | 'ALREADY_REQUESTED'
  /** A head who sends the renewal confirms a stay over twelve months in so many words, as the head who decides would. */
  | 'TERM_CONFIRMATION_REQUIRED'
  /**
   * The right has ended and the head asks for the person: the new request that follows is sent by the person it is for, or by
   * the head as a request for the people of the department, not through this route.
   */
  | 'END_PASSED';

/** The renewal cannot be asked for as sent: the reason says why (`US-05-14`). */
export class RenewalRequestRefusedError extends Error {
  constructor(
    readonly reason: RenewalRefusal,
    /** Why the seat cannot be renewed, for `ASSIGNMENT_NOT_RENEWABLE`. */
    readonly problem: RenewableProblem | null = null,
  ) {
    super(`The renewal is refused: ${reason}.`);
    this.name = 'RenewalRequestRefusedError';
  }
}
