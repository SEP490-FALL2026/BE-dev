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
