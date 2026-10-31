/** Why the spending approver may not put a question to Finance (`US-06-02`); the rules that judge it are in `budget-information`. */
export type AskRefusal =
  | 'OWN_REQUEST'
  | 'NOT_THE_ASSIGNEE'
  | 'STEP_NOT_PENDING'
  /** A question of this step is still waiting for Finance; the approver asks the next one after the answer. */
  | 'ALREADY_OPEN';

/** Why Finance may not answer a question of the spending approver (`US-06-03`). */
export type AnswerRefusal =
  | 'NOT_FINANCE'
  /** Finance is a party to the request: it asked for the access or is given it. */
  | 'OWN_REQUEST'
  /** The one who answers also decides the request as the spending approver (`SoD-8`, `US-06-03` AC-4). */
  | 'SOD_APPROVER'
  /** The question was answered or closed; a request that went away takes its question with it (`US-06-03` AC-6). */
  | 'NOT_OPEN';

/** Why a Finance review may not end as asked (`US-06-13`); the rules that judge it are in `finance-review`. */
export type ReviewRefusal =
  /** The plan line is still overdue: Finance moves it on the line, or gives the request back (`AC-4`). */
  | 'PLAN_LINE_NOT_UPDATED'
  /** There is no budget to make: no year lacks one or has too little, or this is neither of the two (`AC-11`). */
  | 'NO_BUDGET_TO_MAKE'
  /** Nobody heads the department, so nobody can propose the budget (`AC-11`). */
  | 'NO_HEAD_TO_PROPOSE'
  /** The request already waits for a budget: it asks for none again (J.3). */
  | 'ALREADY_AWAITING_BUDGET'
  /** Finance is the one who asked or one the request is for: nobody independent reviews it (`QĐ-82l`(8)). */
  | 'OWN_REQUEST'
  /** Finance is the one who will decide the spend step of the request: the two are two people (`SoD-8`). */
  | 'REVIEWER_IS_APPROVER';

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
      | 'NOT_CHECKABLE'
      /** The approver is the person who completed the review of Finance of this request: the two are two people (`SoD-8`, F32). */
      | 'REVIEWER_IS_APPROVER',
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
