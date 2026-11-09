/**
 * The person who works the provisioning queue is not an IT Admin (`QĐ-87a`, `SoD-1`): the role is checked by the policy of
 * the work itself, so no caller that skips the role guard of a route reaches a task. Answered as the guard answers it.
 */
export class ProvisioningItAdminRequiredError extends Error {
  constructor() {
    super('Only an IT Admin works the provisioning queue.');
    this.name = 'ProvisioningItAdminRequiredError';
  }
}

/**
 * Pkg 9 (MF1-F): Pool has free seats; purchase not allowed (AC-2, QĐ-104j).
 */
export class PurchaseNotAllowedError extends Error {
  constructor(freeSeats: number) {
    super(`Cannot purchase when pool has ${freeSeats} free seats available.`);
    this.name = 'PurchaseNotAllowedError';
  }
}

/**
 * Pkg 9 (MF1-F): Pool exhausted but no purchase reason given (AC-3, QĐ-104k).
 */
export class PurchaseReasonRequiredError extends Error {
  constructor() {
    super('Purchase reason is required when pool is exhausted and pending revocation exists.');
    this.name = 'PurchaseReasonRequiredError';
  }
}
