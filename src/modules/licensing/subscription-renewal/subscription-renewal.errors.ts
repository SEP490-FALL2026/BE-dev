export type RenewalProblem =
  /** No renewal case, or no subscription, with this id. */
  | 'NOT_FOUND'
  /** The caller reads no renewal (an employee, the person who decides spending: `SoD-2`). */
  | 'READ_FORBIDDEN'
  /** The caller is not the usable IT Admin responsible for the subscription. */
  | 'NOT_RESPONSIBLE'
  /** No renewal is recorded for it (`QĐ-49c`, `FR-1.12`(9)): `details.reason` is PERPETUAL, INTERNAL, NOT_POOL_TERM, NOT_ACTIVE, ALREADY_CONTINUED or CANCELLED (the company recorded the subscription as cancelled, `A1C-02`). */
  | 'NOT_RENEWABLE'
  /** The period has no milestone: the contract data must be completed first (`US-11-05` AC-1). */
  | 'CONTRACT_DATA_INCOMPLETE'
  /** The period already has its result recorded, or a case of before still waits for its outcome: one case per period (`details.renewalId`). */
  | 'ALREADY_PROPOSED'
  /** The quantity does not fit the choice: a reduction names fewer seats than bought, the others name none. */
  | 'QUANTITY_INVALID'
  /** The result is recorded from the point of adjustment of the period, not before it (`QĐ-103e`). */
  | 'BEFORE_ADJUSTMENT_POINT'
  /** The quantity is not the seats the system counts for the next period (`QĐ-104d`(1)). */
  | 'QUANTITY_NOT_SEATS_NEEDED'
  /** A cancellation while seats are in effect or a request for the plan is open, or while seats are needed (`QĐ-104d`(2)). */
  | 'CANCEL_NOT_ALLOWED'
  /** The seats are the vendor minimum above the need and the note gives no evidence for it (`QĐ-104d`(1)). */
  | 'VENDOR_MINIMUM_EVIDENCE_REQUIRED'
  /** The case is not waiting for its outcome (not decided yet, or recorded already). */
  | 'NOT_AWAITING_OUTCOME'
  /** An outcome as decided does not match the decision: record it as different. */
  | 'OUTCOME_MISMATCH'
  /** More seats are still in use than the new period buys (`US-11-03` AC-5, `US-11-05` AC-9). */
  | 'EXCESS_NOT_REVOKED'
  /** A seat to carry still has an open task of the provisioning queue. */
  | 'SEATS_HAVE_OPEN_TASKS'
  /** The new period cannot be recorded as the continuation of this one. */
  | 'PERIOD_REFUSED'
  /** A result with no new period leaves the period with no way to be recorded: a renewal, a reduction or an increase carries it (`A1C-03`). */
  | 'NEXT_PERIOD_REQUIRED'
  /** Per-line proposed quantity does not match the line target before deadline. */
  | 'LINE_QUANTITY_NOT_TARGET'
  /** Annual commitment period cannot reduce seats below deadline seat count after deadline (R-LATE). */
  | 'REDUCTION_AFTER_DEADLINE'
  /** Multi-line period renewal proposal must submit `lines[]` instead of legacy `proposedQuantity`. */
  | 'LINES_REQUIRED';

/** A request about the renewal of a subscription was refused; nothing is written. */
export class RenewalError extends Error {
  constructor(
    readonly problem: RenewalProblem,
    readonly details: Record<string, unknown> = {},
  ) {
    super(`The renewal request was refused: ${problem}.`);
    this.name = 'RenewalError';
  }
}
