/** A purchase was asked for a plan that is not bought seat by seat or key by key (`BR-MF1-09b`): only K2 and K4 have a pool to top up. */
export class PurchaseNotApplicableError extends Error {
  constructor() {
    super('Only a plan of the K2 or K4 kind has a pool a purchase can be recorded against.');
    this.name = 'PurchaseNotApplicableError';
  }
}

/** The pool still has a free seat or key of the plan, so no purchase is recorded (`BR-MF1-09a`); the IT Admin grants from the pool. */
export class PurchaseNotAllowedError extends Error {
  constructor(
    readonly freeSeats: number,
    readonly subscriptionIds: readonly string[],
  ) {
    super(`The pool still has ${freeSeats} free seat(s) of this plan: grant one of them instead of buying.`);
    this.name = 'PurchaseNotAllowedError';
  }
}

/** The pool is empty but a seat is still being taken back: buying then needs the reason why waiting was not enough (`BR-MF1-09a`). */
export class PurchaseReasonRequiredError extends Error {
  constructor() {
    super('The pool has only seats that are being taken back: a reason for buying is required.');
    this.name = 'PurchaseReasonRequiredError';
  }
}
