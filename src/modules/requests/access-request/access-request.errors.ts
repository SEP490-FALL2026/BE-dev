import type { BusinessDate } from '../../../core/business-date';
import type { TermKind, TermRefusal } from '../../../core/term-limit';
import type { WithdrawalRefusal } from './withdrawal.policy';
import type { CancellationRefusal, HeldAccess } from './access-request.types';

/** The request does not exist, or the caller has no part in it: the two answer alike so a request cannot be probed. */
export class AccessRequestNotFoundError extends Error {
  constructor() {
    super('The request does not exist.');
    this.name = 'AccessRequestNotFoundError';
  }
}

/** The plan the request asks for does not exist. */
export class AccessRequestPlanNotFoundError extends Error {
  constructor() {
    super('The plan does not exist.');
    this.name = 'AccessRequestPlanNotFoundError';
  }
}

/** The application of the plan has left the catalog, so no new access is asked for. */
export class AccessRequestApplicationRetiredError extends Error {
  constructor() {
    super('The application of the plan is retired: no access is asked for it.');
    this.name = 'AccessRequestApplicationRetiredError';
  }
}

/** True when a K4 plan is bound to a device (`DEVICE_KEY` or `DEVICE_BUNDLED`) and cannot be requested in MF-1 (`W2-18`). */
export const isDeviceBoundKeyBinding = (keyBinding: string | null | undefined): boolean =>
  keyBinding === 'DEVICE_KEY' || keyBinding === 'DEVICE_BUNDLED';

/** A device-bound plan (`DEVICE_KEY` or `DEVICE_BUNDLED`) is activated on a device, not requested through MF-1 (`W2-18`). */
export class AccessRequestPlanBoundToDeviceError extends Error {
  constructor() {
    super(
      'A device-bound plan cannot be requested through an access request; record its activation on a device instead.',
    );
    this.name = 'AccessRequestPlanBoundToDeviceError';
  }
}

/** The person sending belongs to no department on the day: a request is charged to the Unit of a department (`INV-20`). */
export class AccessRequestNoDepartmentError extends Error {
  constructor() {
    super('The person sending the request belongs to no department.');
    this.name = 'AccessRequestNoDepartmentError';
  }
}

/** The caller has a part in the request but is not the person who holds its need step (`US-05-04` AC-3, AC-4). */
export class AccessRequestNotAssigneeError extends Error {
  constructor() {
    super('Only the person who holds the need step of the request may do this.');
    this.name = 'AccessRequestNotAssigneeError';
  }
}

/** The person may not decide the need step now: the reason says why (`US-05-04`). */
export class AccessRequestDecisionRefusedError extends Error {
  constructor(readonly reason: 'OWN_REQUEST' | 'NOT_THE_ASSIGNEE' | 'STEP_NOT_PENDING') {
    super(`The need step cannot be decided: ${reason}.`);
    this.name = 'AccessRequestDecisionRefusedError';
  }
}

/** The person already holds a seat of the plan, so asking for it again is refused and the seat is shown (`US-05-01` AC-2). */
export class AccessRequestAlreadyHoldsAccessError extends Error {
  constructor(readonly held: HeldAccess) {
    super('The person already holds access to the plan.');
    this.name = 'AccessRequestAlreadyHoldsAccessError';
  }
}

/** GH-1 (`BR-MF1-01e`): the person already has a request for new access of the plan open. */
export class AccessRequestOpenRequestExistsError extends Error {
  constructor(readonly requestId: string) {
    super('The person already has a request for this plan open.');
    this.name = 'AccessRequestOpenRequestExistsError';
  }
}

/** GH-2 (`BR-MF1-01f`, `QĐ-111h`): the person was already named in as many requests for new access this calendar week as they may; the count starts again on `resetsOn`. */
export class AccessRequestOpenLimitReachedError extends Error {
  constructor(
    readonly limit: number,
    readonly resetsOn: BusinessDate,
  ) {
    super('The person was already named in as many requests for new access this week as they may.');
    this.name = 'AccessRequestOpenLimitReachedError';
  }
}

/** The request cannot be priced for another day: its quote is not in force then, or does not say how it is paid. */
export class AccessRequestNotPriceableError extends Error {
  constructor() {
    super('The request cannot be priced for that day.');
    this.name = 'AccessRequestNotPriceableError';
  }
}

const TERM_MESSAGES: Readonly<Record<TermRefusal, string>> = {
  TERM_REQUIRED: 'Give the time of use in months.',
  TERM_MONTHS_OUT_OF_RANGE:
    'The time of use is a whole number of months: from 1 to 9 for a plan bought by the month, from 1 to 12 for the others.',
  TERM_NOT_ASKED: 'This plan is bought once: it takes no time of use.',
  TERM_LONG_TERM_NOT_ALLOWED:
    'A contractor, a freelancer or an intern gets access for a term: give the months, not a right with no end.',
  TERM_CONTRACT_ENDED: 'The contract of the person ended before the time of use begins: no access is given beyond it.',
  K1_ANNUAL_TERM_FIXED: 'This K1 annual-commitment plan requires a fixed term of 12 months.',
  K1_ANNUAL_CONTRACT_TOO_SHORT: 'The person’s contract ends before the 12-month K1 annual commitment completes.',
};

/**
 * The time of use the request gives is refused (`QĐ-111i`, `FR-2.8`, `INV-07`): it is missing, outside what the kind of plan takes, given to a
 * plan that asks none, no end for a person who has a term, or a contract that ended before the time of use begins (`contractEndDate` says
 * when). A term that runs past the end of the contract is not refused: it is cut (R-38).
 */
export class AccessRequestTermRefusedError extends Error {
  constructor(
    readonly reason: TermRefusal,
    /** The last day of the contract, for `TERM_CONTRACT_ENDED`. */
    readonly contractEndDate: BusinessDate | null = null,
    /** The kind of the plan the time of use is judged for; null for a proposal, whose plan is not known (the rule that takes the most judges it). */
    readonly kind: TermKind | null = null,
  ) {
    super(TERM_MESSAGES[reason]);
    this.name = 'AccessRequestTermRefusedError';
  }
}

/** The request is not withdrawn: the reason says why (`US-05-08` AC-3, AC-4, AC-8, `US-06-14` AC-14). */
export class AccessRequestWithdrawalRefusedError extends Error {
  constructor(
    readonly reason: WithdrawalRefusal,
    /** What the refusal points the person to: the seat the grant made, when the way on is a return, or the people it is about. */
    readonly details: {
      assignmentId?: string;
      employeeIds?: readonly string[];
      /** The state of what was decided: the person's line (`scope` LINE) or the request (`scope` REQUEST). */
      state?: string;
      scope?: 'LINE' | 'REQUEST';
    } | null = null,
  ) {
    super(`The request cannot be withdrawn: ${reason}.`);
    this.name = 'AccessRequestWithdrawalRefusedError';
  }
}

/**
 * The request is not closed because its beneficiary left: the reason says why (`US-03-04` AC-25). `EVIDENCE_REQUIRED` is the answer for
 * a task of the grant that is being worked, which is cancelled only with the evidence that the IT Admin undid the work.
 */
export class AccessRequestCancellationRefusedError extends Error {
  constructor(readonly reason: CancellationRefusal | 'EVIDENCE_REQUIRED') {
    super(`The request cannot be closed because its beneficiary left: ${reason}.`);
    this.name = 'AccessRequestCancellationRefusedError';
  }
}

/** A route made for one person was asked of a request for a group, whose people are decided and withdrawn one by one (`US-05-17`). */
export class AccessRequestGroupUsesLinesError extends Error {
  constructor() {
    super('A request for a group is decided and withdrawn for each person: use the routes of its lines.');
    this.name = 'AccessRequestGroupUsesLinesError';
  }
}

/** The request is for a group and the call did not say which person of it (`US-05-17`). */
export class AccessRequestEmployeeRequiredError extends Error {
  constructor() {
    super('A request for a group is read for one person at a time: name the person.');
    this.name = 'AccessRequestEmployeeRequiredError';
  }
}

/** The Super Admin does no business work and sends no request (`QĐ-87a`, `SoD-1`, F30); checked by every service that sends one. */
export class AccessRequestSuperAdminCannotRequestError extends Error {
  constructor() {
    super('The Super Admin does not send requests for access.');
    this.name = 'AccessRequestSuperAdminCannotRequestError';
  }
}

/** The request is the caller's but is no longer a draft: a draft is sent or deleted once (spec L.1). */
export class AccessRequestNotDraftError extends Error {
  constructor() {
    super('The request is not a draft any more.');
    this.name = 'AccessRequestNotDraftError';
  }
}

/**
 * The caller does not hold the role the act needs: a service that closes a request for the IT Admin judges it itself, so the
 * guard of a route is never the only invariant (F13). Answered as the guard answers: 403 `AUTHORIZATION.FORBIDDEN`.
 */
export class AccessRequestRoleRequiredError extends Error {
  constructor(readonly role: 'IT_ADMIN') {
    super(`Only the role ${role} may do this.`);
    this.name = 'AccessRequestRoleRequiredError';
  }
}

export class AccessRequestNotAwaitingRevisionError extends Error {
  constructor() {
    super('The request is not waiting for its requester to revise and send it again.');
  }
}
export class AccessRequestNotRequesterError extends Error {
  constructor() {
    super('Only the requester may send this request again.');
  }
}
