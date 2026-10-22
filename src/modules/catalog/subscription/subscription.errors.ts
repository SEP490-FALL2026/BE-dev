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

/** A subscription whose plan is billed per seat takes no allocation, and neither does one whose pricing model is unknown. */
export class SubscriptionCostAllocationNotApplicableError extends Error {
  constructor(readonly reason: 'PER_SEAT' | 'PRICING_MODEL_UNDECLARED') {
    super(
      reason === 'PER_SEAT'
        ? 'The cost of a per-seat plan follows the people who hold the seats: it takes no allocation.'
        : 'The pricing model of the plan is not declared, so it is not known to take an allocation.',
    );
    this.name = 'SubscriptionCostAllocationNotApplicableError';
  }
}
