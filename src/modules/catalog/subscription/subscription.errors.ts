export class SubscriptionNotFoundError extends Error {
  constructor() {
    super('The subscription does not exist.');
    this.name = 'SubscriptionNotFoundError';
  }
}

export class SubscriptionPlanNotFoundError extends Error {
  constructor() {
    super('The plan does not exist.');
    this.name = 'SubscriptionPlanNotFoundError';
  }
}

/** The department named as the owner of a purchase does not exist or is no longer active (`QĐ-89a`). */
export class SubscriptionOwnerDepartmentInactiveError extends Error {
  constructor() {
    super('The department that would own the subscription does not exist or is not active.');
    this.name = 'SubscriptionOwnerDepartmentInactiveError';
  }
}

/** The application of the plan is retired: a purchase of it is no longer declared (`US-04-01` AC-8, AC-9). */
export class SubscriptionApplicationRetiredError extends Error {
  constructor() {
    super('The application of the plan is retired: no subscription is declared for it.');
    this.name = 'SubscriptionApplicationRetiredError';
  }
}

export class SubscriptionPlanHasNoSubscriptionError extends Error {
  constructor() {
    super('A K5 plan of an internal application has no subscription.');
    this.name = 'SubscriptionPlanHasNoSubscriptionError';
  }
}

export class SubscriptionPerpetualNeedsLicensedApplicationError extends Error {
  constructor() {
    super('A perpetual purchase belongs to licensed software.');
    this.name = 'SubscriptionPerpetualNeedsLicensedApplicationError';
  }
}

export class SubscriptionPerpetualHasNoTermError extends Error {
  constructor(readonly fields: string[]) {
    super('A perpetual purchase has no end date, renewal, notice, billing cycle, auto renewal or mid-term reduction.');
    this.name = 'SubscriptionPerpetualHasNoTermError';
  }
}

export class SubscriptionDatesInvalidError extends Error {
  constructor(readonly reason: string) {
    super('The dates are not in order.');
    this.name = 'SubscriptionDatesInvalidError';
  }
}

export class SubscriptionUpdateEmptyError extends Error {
  constructor() {
    super('The update names no field to change.');
    this.name = 'SubscriptionUpdateEmptyError';
  }
}

/** The seats bought would go under the assignments that hold a seat: what was given out has to be taken back first. */
export class SubscriptionQuantityBelowOccupiedError extends Error {
  constructor(
    readonly occupied: number,
    readonly requested: number,
  ) {
    super(`${occupied} seats are taken: the number bought cannot go under it.`);
    this.name = 'SubscriptionQuantityBelowOccupiedError';
  }
}

export class SubscriptionStillDraftError extends Error {
  constructor(readonly missing: string[]) {
    super('The subscription still lacks data to be complete.');
    this.name = 'SubscriptionStillDraftError';
  }
}

/** A term subscription that becomes active names the months it commits to (`QĐ-103e`). */
export class SubscriptionCommitmentTermRequiredError extends Error {
  constructor() {
    super('A term subscription needs the months it commits to: 1 or 12.');
    this.name = 'SubscriptionCommitmentTermRequiredError';
  }
}

/** A perpetual purchase commits to no term (`QĐ-103e`). */
export class SubscriptionCommitmentTermNotAllowedError extends Error {
  constructor() {
    super('A perpetual purchase commits to no term.');
    this.name = 'SubscriptionCommitmentTermNotAllowedError';
  }
}

/** A K1 plan is bought for one month at a time and paid by the month (R-E01). */
export class SubscriptionK1MonthlyOnlyError extends Error {
  constructor() {
    super('A plan of provisioning type K1 commits to one month and is paid by the month.');
    this.name = 'SubscriptionK1MonthlyOnlyError';
  }
}

/** Paying by the year for a commitment of one month would bill what is not committed (R-G01). */
export class SubscriptionBillingLongerThanCommitmentError extends Error {
  constructor() {
    super('The billing cycle cannot be longer than the commitment.');
    this.name = 'SubscriptionBillingLongerThanCommitmentError';
  }
}

/** A new write takes only a monthly or an annual billing cycle (`Q-09`); data written earlier keeps its own. */
export class SubscriptionBillingCycleUnsupportedError extends Error {
  constructor(readonly billingCycle: string) {
    super('A subscription is paid by the month (MONTHLY) or by the year (ANNUAL).');
    this.name = 'SubscriptionBillingCycleUnsupportedError';
  }
}

/** An active subscription names the IT Admin who answers for it (`QĐ-103v`(4)). */
export class SubscriptionResponsibleRequiredError extends Error {
  constructor() {
    super('An active subscription needs the IT Admin who answers for it.');
    this.name = 'SubscriptionResponsibleRequiredError';
  }
}

/** The person named is not an IT Admin who works and can sign in. */
export class SubscriptionResponsibleNotItAdminError extends Error {
  constructor() {
    super('The person who answers for the subscription must be an IT Admin who works and can sign in.');
    this.name = 'SubscriptionResponsibleNotItAdminError';
  }
}

export type PrimaryRefusal = 'NOT_ACTIVE' | 'ALREADY_RENEWED';

/** Only an active subscription that no later period continues prices its plan (Q-04). */
export class SubscriptionPrimaryNotEligibleError extends Error {
  constructor(readonly reason: PrimaryRefusal) {
    super('Only an active subscription that is not renewed can price its plan.');
    this.name = 'SubscriptionPrimaryNotEligibleError';
  }
}

/** Another subscription became the one that prices the plan first; the unique index of the flag refused this one. */
export class SubscriptionPrimaryConflictError extends Error {
  constructor() {
    super('Another subscription of the plan was made the primary one at the same time. Read it again and retry.');
    this.name = 'SubscriptionPrimaryConflictError';
  }
}
