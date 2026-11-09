import type { RenewableProblem, RenewalSenderRefusal } from './renewal-request.policy';

export type RenewalRefusal =
  | RenewalSenderRefusal
  /** The seat named does not exist. */
  | 'ASSIGNMENT_NOT_FOUND'
  | 'ASSIGNMENT_NOT_RENEWABLE'
  /** The seat already has a request for its renewal that waits for its decision. */
  | 'ALREADY_REQUESTED';

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
