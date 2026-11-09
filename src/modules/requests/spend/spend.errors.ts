/** The request has no check to read, or the caller has no part in its check: the two answer alike. */
export class SpendReviewNotFoundError extends Error {
  constructor() {
    super('The check does not exist.');
    this.name = 'SpendReviewNotFoundError';
  }
}

/** The caller does not head a department today: only a head sends requests on and keeps the queue (`US-06-14` AC-10). */
export class SpendNotHeadError extends Error {
  constructor() {
    super('Only the head of a department sends its requests on to be decided as spend.');
    this.name = 'SpendNotHeadError';
  }
}

/** A request named is not waiting in the queue of the head: it was sent on, is being decided, or is not for spend. */
export class SpendNotInQueueError extends Error {
  constructor(readonly requestId: string) {
    super(`The request ${requestId} is not waiting to be sent on.`);
    this.name = 'SpendNotInQueueError';
  }
}

/** The batch does not exist, or the caller has no part in it: the two answer alike. */
export class SpendBatchNotFoundError extends Error {
  constructor() {
    super('The batch does not exist.');
    this.name = 'SpendBatchNotFoundError';
  }
}

/** The supplementary file cannot be made (`US-06-14` AC-13, AC-15). */
export class SpendSupplementRefusedError extends Error {
  constructor(
    readonly reason: 'NOT_IN_QUEUE' | 'NOT_PRICED' | 'NO_CHANGE' | 'TERM_NOT_REDUCED' | 'END_DATE_OUT_OF_RANGE',
  ) {
    super(`The supplementary file cannot be made: ${reason}.`);
    this.name = 'SpendSupplementRefusedError';
  }
}

/** The spending approver cannot decide the step as asked (`US-06-01`). */
export class SpendDecisionRefusedError extends Error {
  constructor(
    readonly reason:
      | 'NOT_THE_ASSIGNEE'
      | 'OWN_REQUEST'
      | 'STEP_NOT_PENDING'
      /** The request has no spend step open: it is not yet at the approver, or was decided, or went back. */
      | 'NO_SPEND_STEP'
      /** The request cannot be checked now (no price, no rate), so it has no snapshot to be decided on. */
      | 'NOT_CHECKABLE',
  ) {
    super(`The spend step cannot be decided: ${reason}.`);
    this.name = 'SpendDecisionRefusedError';
  }
}

/**
 * The head cannot confirm the use of the reserve as asked (`BR-MF1-06h`): the request does not wait for it, or the head is the person it is
 * for (the head confirms what they ask a decision on, never their own, `QT 1.6`).
 */
export class SpendReserveRefusedError extends Error {
  constructor(readonly reason: 'RESERVE_NOT_PENDING' | 'RESERVE_CONFIRMER_IS_BENEFICIARY') {
    super(`The reserve cannot be confirmed: ${reason}.`);
    this.name = 'SpendReserveRefusedError';
  }
}

/** A confirmation of the reserve in the body of a batch names a request that is not in the batch (`RV-11`). */
export class SpendConfirmationNotInBatchError extends Error {
  constructor(readonly requestId: string) {
    super(`The request ${requestId} to confirm is not in the batch.`);
    this.name = 'SpendConfirmationNotInBatchError';
  }
}
