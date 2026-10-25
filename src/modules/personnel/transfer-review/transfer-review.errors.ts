export type TransferReviewProblem =
  /** The review does not exist, or the caller has nothing to do with it. */
  | 'NOT_FOUND'
  /** The caller is not the head of the department the review was opened for. */
  | 'NOT_REVIEWER'
  | 'ITEM_NOT_FOUND'
  | 'DECISION_ALREADY_RECORDED'
  /** The review was completed, or a later transfer made it obsolete. */
  | 'NOT_OPEN'
  | 'EMPLOYEE_LEFT'
  /** The kind of provisioning of the tool has no revocation (K3, K4). */
  | 'REVOCATION_NOT_SUPPORTED'
  /** The seat ended or was set to end since the review was opened: there is nothing left to take away. */
  | 'SEAT_NOT_OPEN';

/** A refusal to read or to decide a review; nothing is written. */
export class TransferReviewError extends Error {
  constructor(
    readonly problem: TransferReviewProblem,
    readonly details?: Record<string, unknown>,
  ) {
    super(`The transfer review cannot be used: ${problem}`);
    this.name = 'TransferReviewError';
  }
}
