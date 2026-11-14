import type { K1ChecklistExpectation } from './licensing.types';

/** The seat baseline is closed: an assignment without a request is no longer taken (`US-02-05` AC-6, `OI-10`). */
export class SeatBaselineClosedError extends Error {
  constructor() {
    super('The seat baseline is closed: an assignment without a request is no longer taken.');
    this.name = 'SeatBaselineClosedError';
  }
}

/** The subscription or the plan the seats are for does not exist. */
export class SeatTargetNotFoundError extends Error {
  constructor(readonly target: 'SUBSCRIPTION' | 'PLAN') {
    super(`The ${target === 'SUBSCRIPTION' ? 'subscription' : 'plan'} does not exist.`);
    this.name = 'SeatTargetNotFoundError';
  }
}

export type SeatTargetProblem = 'NEITHER' | 'BOTH' | 'PLAN_NEEDS_SUBSCRIPTION' | 'SUBSCRIPTION_NEEDS_PLAN_ONLY';

/** The target is not exactly one subscription of a paid plan or one internal plan. */
export class SeatTargetInvalidError extends Error {
  constructor(readonly problem: SeatTargetProblem) {
    super(`The seats are for one subscription or one internal plan: ${problem}.`);
    this.name = 'SeatTargetInvalidError';
  }
}

/** The kind of provisioning of the plan has no baseline yet: K4 needs the key vault and the company devices. */
export class SeatPlanNotSupportedError extends Error {
  constructor(readonly provisioningType: string) {
    super(`The seat baseline of a ${provisioningType} plan is not supported yet.`);
    this.name = 'SeatPlanNotSupportedError';
  }
}

/** The subscription has no quantity, so the seats it has are not known (`INV-01`). */
export class SeatQuantityUnknownError extends Error {
  constructor() {
    super('The number of seats bought is not known.');
    this.name = 'SeatQuantityUnknownError';
  }
}

export type AssignmentConflict =
  'OVERLAP' | 'IDENTIFIER_IN_USE' | 'SEAT_CAPACITY' | 'EXPECTED_END_REQUIRED' | 'SUBSCRIPTION_DEPARTMENT_MISMATCH';

/** The database refused an assignment that the judgement had accepted: the data changed in between. */
export class AssignmentConflictError extends Error {
  constructor(
    readonly conflict: AssignmentConflict,
    readonly index: number,
    /** For `SEAT_CAPACITY` of a K2 or K4 grant: the seats still free in the other subscriptions of the plan, so the IT Admin grants from there (`BR-MF1-09a`). */
    readonly freeSeatsInPool?: number,
  ) {
    super(`An assignment conflicts with the data as it is now: ${conflict}.`);
    this.name = 'AssignmentConflictError';
  }
}

export class AssignmentNotFoundError extends Error {
  constructor() {
    super('The assignment does not exist.');
    this.name = 'AssignmentNotFoundError';
  }
}

export class AssignmentNotOpenError extends Error {
  constructor() {
    super('The assignment has ended or is set to end: only an open one changes.');
    this.name = 'AssignmentNotOpenError';
  }
}

/** The department whose tools are asked for does not exist. */
export class ToolsDepartmentNotFoundError extends Error {
  constructor() {
    super('The department does not exist.');
    this.name = 'ToolsDepartmentNotFoundError';
  }
}

/** A department head asks for the tools of a department that is not theirs (`SoD-2`, `FR-3.7`). */
export class ToolsDepartmentOutOfScopeError extends Error {
  constructor() {
    super('A department head sees the tools of their own department only.');
    this.name = 'ToolsDepartmentOutOfScopeError';
  }
}

/**
 * A place proposed for the list of software of a department, or added to it, is not what the catalog offers (`QĐ-110t`): an application that
 * does not exist or is retired, or a plan that is not one of that application. Every such place is named. What the catalog does not have
 * is asked for as new software (case B), never listed.
 */
export class DepartmentSoftwareNotInCatalogError extends Error {
  constructor(readonly places: readonly { applicationId: string; planId: string | null }[]) {
    super('The software is not in the catalog: ask for it as new software.');
    this.name = 'DepartmentSoftwareNotInCatalogError';
  }
}

/**
 * The note given with a place of the list of software of a department is one the table would refuse: longer than 500 characters, or holding a
 * NUL. It is judged before any statement, so the transaction of the caller is not aborted; the caller answers it as a 422.
 */
export class DepartmentSoftwareNoteInvalidError extends Error {
  constructor(readonly reason: 'TOO_LONG' | 'ILLEGAL_CHARACTER') {
    super(
      reason === 'TOO_LONG'
        ? 'The note of a place of the list is at most 500 characters.'
        : 'The note of a place of the list holds a character no text keeps.',
    );
    this.name = 'DepartmentSoftwareNoteInvalidError';
  }
}

/**
 * The request cannot be granted: the gate that answers for requests does not know it, has not seen it approved, has ended
 * it, it asks for software that is not in the catalog yet (`US-05-06` AC-8), or it is for a service account whose boundary
 * the IT Admin has not accepted (`US-05-21` AC-3).
 */
export class GrantRequestRefusedError extends Error {
  constructor(
    readonly reason:
      'NOT_FOUND' | 'NOT_APPROVED' | 'ENDED' | 'NOT_IN_CATALOG' | 'BOUNDARY_NOT_CHECKED' | 'BENEFICIARY_REQUIRED',
  ) {
    super(`The request cannot be granted: ${reason}.`);
    this.name = 'GrantRequestRefusedError';
  }
}

/** The plan is K3 (SSO/SCIM, specified only): no grant for it yet (`RB-4`). K4 is granted from the key pool of its plan (`QĐ-103d`). */
export class ProvisioningTypeNotSupportedError extends Error {
  constructor(readonly provisioningType: string) {
    super(`A ${provisioningType} plan cannot be granted yet.`);
    this.name = 'ProvisioningTypeNotSupportedError';
  }
}

export type ProvisioningSubscriptionProblem = 'REQUIRED' | 'NOT_ALLOWED' | 'PLAN_MISMATCH' | 'NOT_GRANTABLE';

/**
 * A grant names a subscription when it needs none (K5), none when it needs one (K1, K2), one of another plan, or one of the plan a seat
 * cannot be taken from today (its period ended, or a next period that runs took it over).
 */
export class ProvisioningSubscriptionError extends Error {
  constructor(readonly problem: ProvisioningSubscriptionProblem) {
    super(`The subscription of the grant is not right: ${problem}.`);
    this.name = 'ProvisioningSubscriptionError';
  }
}

/** The account is not an address of a company domain: a paid right is never granted to a personal account (`FR-2.9`). */
export class ProvisioningPersonalAccountError extends Error {
  constructor() {
    super('A paid right is granted to a company account only.');
    this.name = 'ProvisioningPersonalAccountError';
  }
}

/** A service account is granted to the identifier the IT Admin enters, never to one taken from the request (`US-05-21` AC-4). */
export class ProvisioningAccountIdentifierRequiredError extends Error {
  constructor() {
    super('The IT Admin enters the account identifier of a service account.');
    this.name = 'ProvisioningAccountIdentifierRequiredError';
  }
}

/** The person who answers for the service account is no longer active or no longer in its department (`QĐ-86c`). */
export class ProvisioningResponsibleNotInDepartmentError extends Error {
  constructor() {
    super('The person who answers for the service account is not active in the department that owns it.');
    this.name = 'ProvisioningResponsibleNotInDepartmentError';
  }
}

export type ProvisioningResponsibleProblem = 'NOT_SERVICE_ACCOUNT' | 'NOT_FOUND' | 'NOT_ACTIVE' | 'OUTSIDE_DEPARTMENT';

/** The person the IT Admin names to answer for the service account cannot: the request is not for one, or they are not active in its department. */
export class ProvisioningResponsibleInvalidError extends Error {
  constructor(readonly problem: ProvisioningResponsibleProblem) {
    super(`The person named cannot answer for the service account: ${problem}.`);
    this.name = 'ProvisioningResponsibleInvalidError';
  }
}

/**
 * The beneficiary has left, or a departure blocks their access from today: no task to grant starts for them (`QĐ-77f`, `QĐ-110d`). The
 * reason says which, for a client that tells a person at work from one who is gone (`details.cause` on the wire; the field is not called
 * `cause`, which would hide `Error.cause`).
 */
export class ProvisioningBeneficiaryDepartedError extends Error {
  constructor(
    readonly requestId: string,
    readonly reason: 'LEFT' | 'ACCESS_BLOCKED' = 'LEFT',
  ) {
    super(
      reason === 'LEFT'
        ? 'The beneficiary has left the company.'
        : 'The access of the beneficiary is blocked by their departure.',
    );
    this.name = 'ProvisioningBeneficiaryDepartedError';
  }
}

/** The beneficiary has not started yet: no seat is granted before the day they join (`US-02-02` AC-15). */
export class ProvisioningBeneficiaryNotStartedError extends Error {
  constructor(
    readonly requestId: string,
    readonly startsOn: string,
  ) {
    super('The beneficiary has not started yet.');
    this.name = 'ProvisioningBeneficiaryNotStartedError';
  }
}

export class ProvisioningTaskNotFoundError extends Error {
  constructor() {
    super('The provisioning task does not exist.');
    this.name = 'ProvisioningTaskNotFoundError';
  }
}

/** The task belongs to the automatic channel: a person does not take it, complete it or fail it by hand. */
export class ProvisioningTaskNotManualError extends Error {
  constructor() {
    super('The task is for the connector, not for a person.');
    this.name = 'ProvisioningTaskNotManualError';
  }
}

export type ProvisioningTaskStateProblem =
  | 'NOT_CLAIMABLE'
  | 'NOT_IN_PROGRESS'
  | 'NOT_FAILED'
  | 'NOT_RUNNING'
  /** The requester withdrew: only cancelling the task is left, not retrying, handing off or closing it as failed. */
  | 'WITHDRAWAL_PENDING'
  /** The task is cancelled only when its request was withdrawn. */
  | 'NO_WITHDRAWAL'
  /** A revocation ends by its own completion, never by the completion of a grant. */
  | 'IS_REVOCATION'
  /** Only a revocation is completed as a revocation or has the access of its seat cut. */
  | 'NOT_REVOCATION'
  /** The access of a seat is cut early only while it runs on to the end of the paid period. */
  | 'NOT_TERMINATING';

export class ProvisioningTaskStateError extends Error {
  constructor(readonly problem: ProvisioningTaskStateProblem) {
    super(`The task is not in a state that allows this: ${problem}.`);
    this.name = 'ProvisioningTaskStateError';
  }
}

/** A task is completed with a note of what was done, never without one (`US-07-02` AC-5, `OQ-D-02`). */
export class ProvisioningEvidenceRequiredError extends Error {
  constructor() {
    super('The completion of a task needs the evidence of what was done.');
    this.name = 'ProvisioningEvidenceRequiredError';
  }
}

export class ProvisioningReasonRequiredError extends Error {
  constructor() {
    super('A task that could not be done needs the reason.');
    this.name = 'ProvisioningReasonRequiredError';
  }
}

/** The IT Admin is the beneficiary and another usable IT Admin can do the work instead (`QĐ-77m`). */
export class ProvisioningAnotherItAdminNeededError extends Error {
  constructor() {
    super('Another IT Admin has to do the work for the IT Admin who is its beneficiary.');
    this.name = 'ProvisioningAnotherItAdminNeededError';
  }
}

/** The task is by hand already: there is nothing to hand off. */
export class ProvisioningTaskAlreadyManualError extends Error {
  constructor() {
    super('The task is already done by hand.');
    this.name = 'ProvisioningTaskAlreadyManualError';
  }
}

/** The connector reports on tasks of the connector only: a task by hand is reported by the person who worked it. */
export class ProvisioningTaskNotConnectorError extends Error {
  constructor() {
    super('The task is done by hand, not by the connector.');
    this.name = 'ProvisioningTaskNotConnectorError';
  }
}

/** The application of the plan is retired: it takes no seat any more. */
export class SeatApplicationRetiredError extends Error {
  constructor() {
    super('The application is retired: it takes no seat.');
    this.name = 'SeatApplicationRetiredError';
  }
}

/** The subscription is still a draft: it lacks data to be complete, so it takes no seat (`US-04-03` AC-6). */
export class SeatSubscriptionDraftError extends Error {
  constructor(readonly missing: string[]) {
    super('The subscription is still a draft: it takes no seat until its data is complete.');
    this.name = 'SeatSubscriptionDraftError';
  }
}

/** The license key does not exist (`US-04-12`). */
export class LicenseKeyNotFoundError extends Error {
  constructor() {
    super('The license key does not exist.');
    this.name = 'LicenseKeyNotFoundError';
  }
}

/** Only the purchases of a K4 plan have a vault of keys (`US-04-12` AC-10). */
export class LicenseKeyPlanNotK4Error extends Error {
  constructor(readonly provisioningType: string) {
    super(`Only a purchase of a K4 plan keeps license keys; this plan is ${provisioningType}.`);
    this.name = 'LicenseKeyPlanNotK4Error';
  }
}

/** The account has opened as many keys as it may in this minute or this day (`SEC-02`); nothing was opened. */
export class LicenseKeyRevealLimitError extends Error {
  constructor(readonly window: 'MINUTE' | 'DAY') {
    super('Too many license keys were opened by this account. Try again later.');
    this.name = 'LicenseKeyRevealLimitError';
  }
}

export type RevocationProblem = 'SOURCE_REQUIRED' | 'ASSIGNMENT_IS_SERVICE_ACCOUNT' | 'TYPE_NOT_SUPPORTED';

/**
 * The seat cannot be revoked: no source says why, the assignment is a service account (answered for by a person, not part
 * of the personal rights a departure takes away: `US-03-04` AC-17), or its kind of provisioning has no revocation (K3, which is specified only; K4 is revoked and its key goes back to the store, `QĐ-103d`).
 */
export class RevocationRefusedError extends Error {
  constructor(
    readonly problem: RevocationProblem,
    readonly provisioningType?: string,
  ) {
    super(`The seat cannot be revoked: ${problem}.`);
    this.name = 'RevocationRefusedError';
  }
}

/** A revocation was opened with a timing that contradicts itself (a day not before that is after the due day): a fault of the source module. */
export class RevocationInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RevocationInputError';
  }
}

/** The revocation may not be taken or completed before the day the source asked for (`US-10-07` AC-18): the day it can be is told. */
export class ProvisioningTaskNotBeforeError extends Error {
  constructor(readonly notBefore: string) {
    super(`The revocation cannot be done before ${notBefore}.`);
    this.name = 'ProvisioningTaskNotBeforeError';
  }
}

export type RevocationCompletionProblem =
  | 'COMPLETION_NOT_ALLOWED'
  | 'NOTE_REQUIRED'
  | 'PAID_THROUGH_REQUIRED'
  | 'ACCESS_STATE_REQUIRED'
  | 'ACCESS_STATE_INVALID'
  | 'WITHDRAWAL_REASON_REQUIRED'
  /** A K4 completion must say where the key goes (`QĐ-111p`). */
  | 'KEY_DISPOSITION_REQUIRED'
  /** A K1 completion lacks a step of its checklist (not ticked, or ticked with no time) or the evidence (`QĐ-111az`). */
  | 'K1_CHECKLIST_INCOMPLETE'
  /** The steps of a K1 checklist were not ticked in their order: a step is timed before one that comes first (`QĐ-111az`, m-09). */
  | 'K1_CHECKLIST_OUT_OF_ORDER';

/**
 * The way a revocation is completed does not fit its kind of provisioning, or lacks what the kind needs to be stored. A refusal of the checklist
 * of a K1 revocation also carries what the server expects of it (`expected`, the `details` of the answer).
 */
export class RevocationCompletionError extends Error {
  constructor(
    readonly problem: RevocationCompletionProblem,
    readonly expected?: K1ChecklistExpectation,
  ) {
    super(`The completion of the revocation is not valid: ${problem}.`);
    this.name = 'RevocationCompletionError';
  }
}

export type AssignmentRenewalProblem =
  /** It has ended, failed or been cancelled: there is nothing left to renew. */
  | 'NOT_OPEN'
  | 'SERVICE_ACCOUNT'
  /** The end it was expected to have is not the end the renewal was asked against: it changed, or it has none. */
  | 'END_CHANGED'
  /** The seat is being revoked: renewing it would end the record the revocation has to end. */
  | 'REVOCATION_PENDING';

/** The seat cannot be renewed as the request asks: the record it would follow is not the one the request was made against. */
export class AssignmentRenewalRefusedError extends Error {
  constructor(readonly problem: AssignmentRenewalProblem) {
    super(`The seat cannot be renewed: ${problem}.`);
    this.name = 'AssignmentRenewalRefusedError';
  }
}

/**
 * A module that extends a revocation (a listener of `RevocationListeners`) refuses the step: the code is its own and stable, and the
 * refusal is answered as a conflict. Throw it at `BEFORE_WORK` to stop the task being taken or completed so the caller sees a code and not a failure of the
 * server. No listener does so today: the confirmation of a handover that did is gone (`QĐ-110g`).
 */
export class RevocationHookRefusedError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly details?: Record<string, string | number | boolean | null>,
  ) {
    super(message);
    this.name = 'RevocationHookRefusedError';
  }
}
