export type RenewalProblem =
  /** No renewal case, or no subscription, with this id. */
  | 'NOT_FOUND'
  /** The caller is not among the people who work the renewals (a head of department, an employee: `SoD-2`). */
  | 'READ_FORBIDDEN'
  /** A perpetual purchase, a draft or a period already continued has no renewal (`QĐ-49c`). */
  | 'NOT_RENEWABLE'
  /** The period has no milestone: the contract data must be completed first (`US-11-05` AC-1). */
  | 'CONTRACT_DATA_INCOMPLETE'
  /** The period already has a proposal: one case per period. */
  | 'ALREADY_PROPOSED'
  /** The quantity does not fit the choice: a reduction names fewer seats than bought, the others name none. */
  | 'QUANTITY_INVALID'
  /** The caller is not the person who decides this renewal now (`FR-3.13`, `SoD-3`). */
  | 'NOT_DECIDER'
  /** The Business Owner's head proposes: the head confirms, so another IT Admin proposes (`SoD-3`). */
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
