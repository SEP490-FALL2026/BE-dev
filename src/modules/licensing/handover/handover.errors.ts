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
