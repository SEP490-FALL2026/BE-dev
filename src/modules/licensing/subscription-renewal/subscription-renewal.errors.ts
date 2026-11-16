export type RenewalProblem =
  /** No renewal case, or no subscription, with this id. */
  | 'NOT_FOUND'
  /** The caller is not among the people who work the renewals (a head of department, an employee: `SoD-2`). */
  | 'READ_FORBIDDEN'
  /** No renewal is recorded for it (`QĐ-49c`, `FR-1.12`(9)): `details.reason` is PERPETUAL, INTERNAL, NOT_POOL_TERM, NOT_ACTIVE or ALREADY_CONTINUED. */
  | 'NOT_RENEWABLE'
  /** The period has no milestone: the contract data must be completed first (`US-11-05` AC-1). */
  | 'CONTRACT_DATA_INCOMPLETE'
  /** The period already has its result recorded, or a case of before still waits for its outcome: one case per period (`details.renewalId`). */
  | 'ALREADY_PROPOSED'
  /** The quantity does not fit the choice: a reduction names fewer seats than bought, the others name none. */
  | 'QUANTITY_INVALID'
  /** The caller is not the person who decides this renewal now (`FR-3.13`, `SoD-3`). */
  | 'NOT_DECIDER'
  /** The head of the owner department proposes: the head confirms, so another IT Admin proposes (`SoD-3`). */
  | 'PROPOSER_IS_OWNER_HEAD'
  /** The case is not waiting for a decision (already decided). */
  | 'NOT_AWAITING_DECISION'
  /** A cancellation while seats are in use must be confirmed after the warning (`US-11-02` AC-2). */
  | 'ACTIVE_USERS_NOT_ACKNOWLEDGED'
  /** The seats chosen to take back are not exactly the excess, or not seats in use of this subscription (`US-11-02` AC-20). */
  | 'EXCESS_SELECTION_INVALID'
  /** The seats the IT Admin proposed to take back are no longer exactly the excess of the day of the confirmation. */
  | 'PROPOSAL_STALE'
  /** Reducing within the paid period is only for a subscription that allows a reduction mid-term. */
  | 'MID_TERM_NOT_ALLOWED'
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
  | 'PERIOD_REFUSED';

/** A request about the renewal of a subscription was refused; nothing is written. */
export class RenewalError extends Error {
  constructor(
    readonly problem: RenewalProblem,
    readonly details: Record<string, string | number | boolean | null> = {},
  ) {
    super(`The renewal request was refused: ${problem}.`);
    this.name = 'RenewalError';
  }
}
