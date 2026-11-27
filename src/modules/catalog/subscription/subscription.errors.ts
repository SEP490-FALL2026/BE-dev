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

/** The application of the plan is retired: a purchase of it is no longer declared (`US-04-01` AC-8, AC-9). */
export class SubscriptionApplicationRetiredError extends Error {
  /** `planId` names the plan whose application is retired when a declaration holds several. */
  constructor(readonly planId?: string) {
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

/** The subscription changed after the client read it: its `updated_at` is no longer the one the edit was made on. */
export class SubscriptionStaleError extends Error {
  constructor(readonly currentUpdatedAt: Date) {
    super('The subscription was changed by someone else since it was read: read it again before editing.');
    this.name = 'SubscriptionStaleError';
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

/** A unit price is entered in dong only: the system has no exchange rate to turn another currency into it (`QĐ-111an`). */
export class SubscriptionPriceNotVndError extends Error {
  constructor(readonly currency: string) {
    super(
      'The unit price is entered in dong (VND). Convert it first and keep the price quoted by the vendor as the original price.',
    );
    this.name = 'SubscriptionPriceNotVndError';
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

/** A K4 plan is bought once: what is written for it is a perpetual purchase, never a term (B-5). */
export class SubscriptionK4PerpetualOnlyError extends Error {
  constructor() {
    super('A plan of provisioning type K4 is bought once: its subscription is a perpetual purchase, not a term.');
    this.name = 'SubscriptionK4PerpetualOnlyError';
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
/** The plan needs at least two different working IT Admins at the vendor once the seat baseline is closed: it is not activated. */
export class SubscriptionVendorAdminsRequiredError extends Error {
  constructor(
    readonly planId: string,
    readonly given: number,
    readonly required: number,
  ) {
    super(`The plan needs at least ${required} different working IT Admins who administer it at the vendor.`);
    this.name = 'SubscriptionVendorAdminsRequiredError';
  }
}

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

/**
 * Another live subscription of the same K2 or K4 plan exists after the seat baseline is closed (`QĐ-104k`(3), R-E02): the seats of a plan
 * are one pool, so the pool is topped up, not declared twice.
 */
export class SubscriptionDuplicatePlanError extends Error {
  constructor(readonly subscriptionIds: readonly string[]) {
    super('The plan already has a live subscription: add seats to it or renew it instead of declaring another.');
    this.name = 'SubscriptionDuplicatePlanError';
  }
}

export class SubscriptionVersionRequiredError extends Error {
  constructor() {
    super('Send expectedUpdatedAt from the last read when changing purchasedQuantity.');
    this.name = 'SubscriptionVersionRequiredError';
  }
}

export class SubscriptionMidTermReductionNotAllowedError extends Error {
  constructor() {
    super(
      'Reducing purchasedQuantity during a 12-month commitment is not allowed unless mid-term reduction is enabled.',
    );
    this.name = 'SubscriptionMidTermReductionNotAllowedError';
  }
}

export class SubscriptionQuantityReasonRequiredError extends Error {
  constructor() {
    super('A quantityChangeReason is required when increasing purchasedQuantity of an active K2 subscription.');
    this.name = 'SubscriptionQuantityReasonRequiredError';
  }
}

/** A subscription counted by its members commits for one month only (QĐ-115g, C4). */
export class SubscriptionMembersMonthlyOnlyError extends Error {
  constructor() {
    super('A subscription whose seats are the members the vendor counts commits for one month only.');
    this.name = 'SubscriptionMembersMonthlyOnlyError';
  }
}

/** An active subscription counted by its members names its payment day in renewalDate. */
export class SubscriptionMembersPaymentDayRequiredError extends Error {
  constructor() {
    super('An active subscription counted by its members needs renewalDate, its payment day.');
    this.name = 'SubscriptionMembersPaymentDayRequiredError';
  }
}

/** How the seats are counted does not change once the subscription is active. */
export class SubscriptionSeatCountingFixedError extends Error {
  constructor() {
    super('How the seats of an active subscription are counted cannot change.');
    this.name = 'SubscriptionSeatCountingFixedError';
  }
}

/**
 * The workspace of the subscription changed between the read that told which workspace to lock and the lock of the period (N5): the write
 * starts again with the workspace it now holds. Never reaches a caller: after three tries it is a SubscriptionStaleError.
 */
export class SubscriptionWorkspaceMovedError extends Error {
  constructor(readonly currentUpdatedAt: Date) {
    super('The subscription moved to another workspace while it was being written.');
    this.name = 'SubscriptionWorkspaceMovedError';
  }
}

export class SubscriptionPriceMismatchError extends Error {
  constructor(
    readonly expectedUnitPriceMinor: bigint,
    readonly currency = 'VND',
  ) {
    super('The provided unitPrice does not match monthlyUnitPrice multiplied by the billing cycle months.');
    this.name = 'SubscriptionPriceMismatchError';
  }
}

/** The seats of a subscription are not set by editing it: they are bought, corrected and reduced on the lines of the subscription, and counted from its ledger. */
export class SubscriptionSeatCountViaLedgerError extends Error {
  constructor(readonly routes: readonly string[]) {
    super('The seats of a subscription are not edited: buy, correct or reduce them on its lines.');
    this.name = 'SubscriptionSeatCountViaLedgerError';
  }
}

/** The subscription that prices its plan is no longer chosen by hand: the price of a plan is read from the line of the workspace. */
export class SubscriptionPrimaryRetiredError extends Error {
  constructor() {
    super('A subscription is no longer marked as the one that prices its plan.');
    this.name = 'SubscriptionPrimaryRetiredError';
  }
}

/** A plan of personal accounts (K1) is paid by the month for each account and has no subscription. */
export class SubscriptionK1HasNoSubscriptionError extends Error {
  constructor() {
    super('A plan of personal accounts has no subscription: its accounts are granted and paid one by one.');
    this.name = 'SubscriptionK1HasNoSubscriptionError';
  }
}

/** A purchase made once (K4) is a lot of licenses, not a subscription. */
export class SubscriptionPerpetualIsLicenseLotError extends Error {
  constructor() {
    super('A purchase made once is a lot of licenses: create it as a lot.');
    this.name = 'SubscriptionPerpetualIsLicenseLotError';
  }
}

export class SubscriptionLinesXorPlanError extends Error {
  constructor() {
    super('Send either lines or planId when declaring a subscription, never both or neither.');
    this.name = 'SubscriptionLinesXorPlanError';
  }
}

/** A subscription whose period already has plan lines keeps its price per line: change the price on the line instead. */
export class SubscriptionPriceOnLinesError extends Error {
  constructor() {
    super('This subscription period is priced per line: change the price on the line instead.');
    this.name = 'SubscriptionPriceOnLinesError';
  }
}

export class SubscriptionWorkspaceNotFoundError extends Error {
  constructor() {
    super('The workspace does not exist.');
    this.name = 'SubscriptionWorkspaceNotFoundError';
  }
}
