export type ExpiryProblem =
  /** The right does not exist or is not one that ends on a day (a service account, or a right without an end date). */
  | 'NOT_FOUND'
  /** The right ended already (a return, a renewal, a revocation completed) and is no longer held. */
  | 'NOT_OPEN'
  /** The end day has not passed: the right is in force until the end of it. */
  | 'NOT_EXPIRED'
  /** A renewal sent up to the end day waits for its decision: the right stays as it is. */
  | 'RENEWAL_PENDING'
  /** Someone who is not an IT Admin asked for the reminders of everyone. */
  | 'SCOPE_FORBIDDEN';

/** A request about the end of a right was refused; nothing is written. */
export class ExpiryError extends Error {
  constructor(readonly problem: ExpiryProblem) {
    super(`The expiry request was refused: ${problem}.`);
    this.name = 'ExpiryError';
  }
}
