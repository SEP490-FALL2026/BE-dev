import type { RenewableProblem, RenewalSenderRefusal } from './renewal-request.policy';

export type RenewalRefusal =
  | RenewalSenderRefusal
  /** The seat named does not exist. */
  | 'ASSIGNMENT_NOT_FOUND'
  | 'ASSIGNMENT_NOT_RENEWABLE'
  /** The seat already has a request for its renewal that waits for its decision. */
  | 'ALREADY_REQUESTED';

/** The window of the renewal is not open yet (`BR-MF1-08a`): it opens `windowDays` days before the approved end, on `opensOn`. */
export class RenewalWindowNotOpenError extends Error {
  constructor(
    readonly opensOn: string,
    readonly windowDays: number,
  ) {
    super('The renewal can be sent only from the day its window opens.');
    this.name = 'RenewalWindowNotOpenError';
  }
}

/** The new end asked for is not after the end the right has, or is more than twelve months after it (`QĐ-108a`). */
export class RenewalEndDateOutOfRangeError extends Error {
  constructor(
    readonly previousEndDate: string,
    readonly maxEndDate: string,
  ) {
    super('The new end date must be after the current end date and at most twelve months after it.');
    this.name = 'RenewalEndDateOutOfRangeError';
  }
}

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
