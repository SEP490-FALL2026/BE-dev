/** The lot does not exist. */
export class LicenseLotNotFoundError extends Error {
  constructor() {
    super('The license lot does not exist.');
    this.name = 'LicenseLotNotFoundError';
  }
}

/** The request already has its lot (one lot of purpose REQUEST for each request). */
export class LicenseLotRequestTakenError extends Error {
  constructor() {
    super('This request already has a lot of licenses.');
    this.name = 'LicenseLotRequestTakenError';
  }
}

/**
 * The lot does not fit its plan, workspace or contract: the plan is a K4 plan not bundled with the machine, a plan with an admin console has the
 * workspace of its vendor, the purpose fits how the plan binds the license, and the contract is the vendor's.
 */
export class LicenseLotMismatchError extends Error {
  constructor(
    readonly rule: 'PLAN' | 'WORKSPACE_REQUIRED' | 'WORKSPACE_VENDOR' | 'PURPOSE_BINDING' | 'CONTRACT_VENDOR',
  ) {
    super('The lot does not fit its plan, workspace or contract.');
    this.name = 'LicenseLotMismatchError';
  }
}

/** The plan, the purpose and the origin of a lot never change. */
export class LicenseLotFixedError extends Error {
  constructor() {
    super('The plan, the purpose and the origin of a lot never change.');
    this.name = 'LicenseLotFixedError';
  }
}

/** Only the IT Admin who answers for the lot changes it or puts keys in it: another IT Admin does not stand in for them. */
export class LicenseLotNotResponsibleError extends Error {
  constructor() {
    super('Only the IT Admin who answers for the lot can change it or put keys in it.');
    this.name = 'LicenseLotNotResponsibleError';
  }
}

/** The lot changed since the caller read it (`expectedUpdatedAt` no longer matches). */
export class LicenseLotStaleError extends Error {
  constructor(readonly currentUpdatedAt: Date) {
    super('The lot was changed by someone else since it was read: read it again before editing.');
    this.name = 'LicenseLotStaleError';
  }
}

/** The price of a lot is not changed once a key of it was given or an invoice of it was confirmed. */
export class LicenseLotPriceLockedError extends Error {
  constructor() {
    super('The price of the lot is not changed once a key of it was given or an invoice of it was confirmed.');
    this.name = 'LicenseLotPriceLockedError';
  }
}

/** Leaving a contract for another, or for none, names the reason. */
export class LicenseLotContractReasonRequiredError extends Error {
  constructor() {
    super('Changing the contract of a lot needs the reason.');
    this.name = 'LicenseLotContractReasonRequiredError';
  }
}

/** The plan of the lot is not a plan of license keys that is bought once (K4). */
export class LicenseLotPlanNotK4Error extends Error {
  constructor() {
    super('A lot is of a plan of license keys bought once.');
    this.name = 'LicenseLotPlanNotK4Error';
  }
}

/** This purpose does not fit how the plan binds its key (a request is for a key given to an account, a stock is for a key that goes on a machine, a bundled plan has no lot). */
export class LicenseLotPurposeNotAvailableError extends Error {
  constructor() {
    super('This purpose is not available for the plan of the lot.');
    this.name = 'LicenseLotPurposeNotAvailableError';
  }
}

/** A lot bought for a request names the request. */
export class LicenseLotRequestRequiredError extends Error {
  constructor() {
    super('A lot bought for a request names the request.');
    this.name = 'LicenseLotRequestRequiredError';
  }
}

/** The person named is not an IT Admin who works now. */
export class LicenseLotResponsibleNotItAdminError extends Error {
  constructor() {
    super('The person named is not an IT Admin who works now.');
    this.name = 'LicenseLotResponsibleNotItAdminError';
  }
}

/** The keys of a lot of a plan bound to an account would pass its licenses. */
export class LicenseLotKeysExceedLicensesError extends Error {
  constructor(
    readonly licenseCount: number,
    readonly keysNotWithdrawn: number,
  ) {
    super('The keys of the lot would pass its licenses: withdraw a key or add licenses first.');
    this.name = 'LicenseLotKeysExceedLicensesError';
  }
}

/** The price of a license is entered in dong; another currency is converted first and kept as the original price. */
export class LicenseLotPriceNotVndError extends Error {
  constructor(readonly currency: string) {
    super(
      'The price of a license is entered in dong (VND). Convert it first and keep the price quoted by the vendor as the original price.',
    );
    this.name = 'LicenseLotPriceNotVndError';
  }
}
