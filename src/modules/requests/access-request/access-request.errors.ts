import type { WithdrawalRefusal } from './withdrawal.policy';
import type { CancellationRefusal, DelegationRefusal, HeldAccess } from './access-request.types';

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

/** The person sending belongs to no department on the day: a request is charged to the Unit of a department (`INV-20`). */
export class AccessRequestNoDepartmentError extends Error {
  constructor() {
    super('The person sending the request belongs to no department.');
    this.name = 'AccessRequestNoDepartmentError';
  }
}

/** Internal software with no fee has no money to spend, so it has no day the money is expected to go out (`US-05-02` AC-11). */
export class AccessRequestSpendDateNotAllowedError extends Error {
  constructor() {
    super('A request for internal software has no expected spend date: nothing is paid.');
    this.name = 'AccessRequestSpendDateNotAllowedError';
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
  constructor(
    readonly reason:
      | 'OWN_REQUEST'
      | 'NOT_THE_ASSIGNEE'
      | 'STEP_NOT_PENDING'
      | 'TERM_CONFIRMATION_REQUIRED'
      /** A head approving a request that costs money chooses a line of the plan or "outside the plan" (`US-05-04` AC-12). */
      | 'PLAN_LINE_REQUIRED'
      /** The line, the flag or the day is only for the head who approves a request that costs money. */
      | 'SPEND_NOT_APPLICABLE',
  ) {
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

/** The line a request is attached to cannot be kept (`US-05-04` AC-12, AC-13, `US-06-14` AC-5). */
export class AccessRequestPlanLineRefusedError extends Error {
  constructor(
    readonly reason:
      /** The request costs nothing, so it has no line of a plan to be attached to. */
      | 'NO_SPEND'
      | 'LINE_NOT_FOUND'
      /** The window of the line has gone by and the head did not say it is still needed. */
      | 'STILL_NEEDED_REQUIRED',
  ) {
    super(`The line cannot be attached: ${reason}.`);
    this.name = 'AccessRequestPlanLineRefusedError';
  }
}

/** The request cannot be priced for another day: its quote is not in force then, or does not say how it is paid. */
export class AccessRequestNotPriceableError extends Error {
  constructor() {
    super('The request cannot be priced for that day.');
    this.name = 'AccessRequestNotPriceableError';
  }
}

/** A head cannot send requests for the person as asked (`US-03-02`, `US-05-03` rows 5 to 7); `employeeId` is the person it is about. */
export class DelegatedRequestRefusedError extends Error {
  constructor(
    readonly reason: DelegationRefusal,
    readonly employeeId: string | null,
  ) {
    super(`The requests cannot be sent for the person: ${reason}.`);
    this.name = 'DelegatedRequestRefusedError';
  }
}

/** The request is not withdrawn: the reason says why (`US-05-08` AC-3, AC-4, AC-8, `US-06-14` AC-14). */
export class AccessRequestWithdrawalRefusedError extends Error {
  constructor(
    readonly reason: WithdrawalRefusal,
    /** What the refusal points the person to: the seat the grant made, when the way on is a return, or the people it is about. */
    readonly details: { assignmentId?: string; employeeIds?: readonly string[] } | null = null,
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
