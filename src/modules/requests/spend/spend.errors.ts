import type { AnswerRefusal, AskRefusal } from './budget-information.policy';
import type { ReviewRefusal } from './finance-review.policy';

/** The request has no review of Finance to read, or the caller has no part in its check: the two answer alike. */
export class SpendReviewNotFoundError extends Error {
  constructor() {
    super('The review does not exist.');
    this.name = 'SpendReviewNotFoundError';
  }
}

/** Only Finance reviews a request (`US-06-13`); nobody else gives or reads the opinion. */
export class SpendNotFinanceError extends Error {
  constructor() {
    super('Only Finance reviews a request for the spending approver.');
    this.name = 'SpendNotFinanceError';
  }
}

/** The request has no review of Finance open: it was reviewed, withdrawn, or never needed one. */
export class SpendReviewNotOpenError extends Error {
  constructor() {
    super('The request has no review of Finance open.');
    this.name = 'SpendReviewNotOpenError';
  }
}

/** The outcome does not fit the check the review is about (`US-06-13` AC-4, AC-11). */
export class SpendReviewRefusedError extends Error {
  constructor(readonly reason: ReviewRefusal) {
    super(`The review cannot end that way: ${reason}.`);
    this.name = 'SpendReviewRefusedError';
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
  constructor(readonly reason: 'NOT_IN_QUEUE' | 'NOT_PRICED' | 'NO_CHANGE') {
    super(`The supplementary file cannot be made: ${reason}.`);
    this.name = 'SpendSupplementRefusedError';
  }
}

/** The spending approver cannot decide the step as asked (`US-06-01`); the years are those an override has to name. */
export class SpendDecisionRefusedError extends Error {
  constructor(
    readonly reason:
      | 'NOT_THE_ASSIGNEE'
      | 'OWN_REQUEST'
      | 'STEP_NOT_PENDING'
      /** The request has no spend step open: it is not yet at the approver, or was decided, or went back. */
      | 'NO_SPEND_STEP'
      | 'OVERRIDE_REQUIRED'
      | 'OVERRIDE_MISMATCH'
      | 'OVERRIDE_NOT_NEEDED'
      /** The request cannot be checked now (no price, no rate), so it has no snapshot to be decided on. */
      | 'NOT_CHECKABLE',
    readonly years: readonly number[] = [],
  ) {
    super(`The spend step cannot be decided: ${reason}.`);
    this.name = 'SpendDecisionRefusedError';
  }
}

/** The question to Finance does not exist. */
export class BudgetInformationNotFoundError extends Error {
  constructor() {
    super('The question does not exist.');
    this.name = 'BudgetInformationNotFoundError';
  }
}

/** The approver cannot ask, or Finance cannot answer, as asked (`US-06-02`, `US-06-03`). */
export class BudgetInformationRefusedError extends Error {
  constructor(
    readonly reason:
      | AskRefusal
      | AnswerRefusal
      /** The request has no spend step open to ask on: it is not yet at the approver, or was decided, or went back. */
      | 'NO_SPEND_STEP',
  ) {
    super(`The question cannot be put or answered: ${reason}.`);
    this.name = 'BudgetInformationRefusedError';
  }
}
