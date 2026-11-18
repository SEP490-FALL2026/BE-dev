/** The application of the purchase is retired: no key is kept for it any more (`US-04-01` AC-8, AC-9). */
export class LicenseKeyApplicationRetiredError extends Error {
  constructor() {
    super('The application of the purchase is retired: no license key is kept for it.');
    this.name = 'LicenseKeyApplicationRetiredError';
  }
}

/** A sealed key that does not open: an unknown key id, a ciphertext of another row, or one that was touched. */
export class LicenseKeyDecryptionError extends Error {
  constructor() {
    super('A license key could not be decrypted.');
    this.name = 'LicenseKeyDecryptionError';
  }
}

/**
 * Why a key cannot be given out or withdrawn now (`QĐ-103d`, `QĐ-103v`): it is not free in the store, it was withdrawn from it, it is
 * assigned, it was withdrawn already, or it belongs to another purchase than the seat it is given to.
 */
export type LicenseKeyStateProblem =
  'NOT_IN_STORE' | 'WITHDRAWN' | 'ASSIGNED' | 'ALREADY_WITHDRAWN' | 'SUBSCRIPTION_MISMATCH';

export class LicenseKeyStateError extends Error {
  constructor(readonly problem: LicenseKeyStateProblem) {
    super(`The license key cannot be used this way: ${problem}.`);
    this.name = 'LicenseKeyStateError';
  }
}
