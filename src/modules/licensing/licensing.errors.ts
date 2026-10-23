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

export type AssignmentConflict = 'OVERLAP' | 'IDENTIFIER_IN_USE' | 'SEAT_CAPACITY' | 'EXPECTED_END_REQUIRED';

/** The database refused an assignment that the judgement had accepted: the data changed in between. */
export class AssignmentConflictError extends Error {
  constructor(
    readonly conflict: AssignmentConflict,
    readonly index: number,
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
    super('The assignment has ended or is set to end: only an open one changes hands.');
    this.name = 'AssignmentNotOpenError';
  }
}

export class AssignmentNotServiceAccountError extends Error {
  constructor() {
    super('Only the person responsible for a service account changes by this route.');
    this.name = 'AssignmentNotServiceAccountError';
  }
}

export type ResponsibleProblem = 'NOT_FOUND' | 'NOT_ACTIVE' | 'SAME_PERSON' | 'OUTSIDE_OWNING_DEPARTMENT';

export class AssignmentResponsibleInvalidError extends Error {
  constructor(readonly problem: ResponsibleProblem) {
    super(`The person named cannot take over the service account: ${problem}.`);
    this.name = 'AssignmentResponsibleInvalidError';
  }
}

export type EffectiveDateProblem = 'NOT_AFTER_START' | 'IN_THE_PAST' | 'EXPECTED_END_BEFORE_START';

export class AssignmentEffectiveDateInvalidError extends Error {
  constructor(readonly problem: EffectiveDateProblem) {
    super(`The date the change takes effect is not valid: ${problem}.`);
    this.name = 'AssignmentEffectiveDateInvalidError';
  }
}

/** A contractor, freelancer or intern holds the seat without an expected end date (`INV-07`). */
export class AssignmentExpectedEndRequiredError extends Error {
  constructor() {
    super('A contractor, freelancer or intern needs an expected end date.');
    this.name = 'AssignmentExpectedEndRequiredError';
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

/** The request cannot be granted: the gate that answers for requests does not know it, has not seen it approved, or has ended it. */
export class GrantRequestRefusedError extends Error {
  constructor(readonly reason: 'NOT_FOUND' | 'NOT_APPROVED' | 'ENDED') {
    super(`The request cannot be granted: ${reason}.`);
    this.name = 'GrantRequestRefusedError';
  }
}

/** The plan is K3 (specified only) or K4 (needs the key store and the company devices): no grant for it yet (`RB-4`). */
export class ProvisioningTypeNotSupportedError extends Error {
  constructor(readonly provisioningType: string) {
    super(`A ${provisioningType} plan cannot be granted yet.`);
    this.name = 'ProvisioningTypeNotSupportedError';
  }
}

export type ProvisioningSubscriptionProblem = 'REQUIRED' | 'NOT_ALLOWED' | 'PLAN_MISMATCH';

/** A grant names a subscription when it needs none (K5), none when it needs one (K1, K2), or one of another plan. */
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

/** The beneficiary has left: no task to grant starts for them (`QĐ-77f`). */
export class ProvisioningBeneficiaryDepartedError extends Error {
  constructor(readonly requestId: string) {
    super('The beneficiary has left the company.');
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

export type ProvisioningTaskStateProblem = 'NOT_CLAIMABLE' | 'NOT_IN_PROGRESS' | 'NOT_FAILED' | 'NOT_RUNNING';

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
