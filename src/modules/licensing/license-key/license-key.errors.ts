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

/** The activations a key had when it was entered are told only while the installation phase is open (`QĐ-116n`): after it they come from the machines. */
export class LicenseKeyInitializationClosedError extends Error {
  constructor() {
    super('The activations already used can be told only while the installation phase is open.');
    this.name = 'LicenseKeyInitializationClosedError';
  }
}

/** The batch tells more activations already used than the cap it gives its keys (a key cannot start above its cap). */
export class LicenseKeyInitialActivationsExceedMaxError extends Error {
  constructor(
    readonly initialActivationsUsed: number,
    readonly maxActivations: number,
  ) {
    super('The activations already used cannot be more than the cap of activations of the keys.');
    this.name = 'LicenseKeyInitialActivationsExceedMaxError';
  }
}

/** The keys of a plan on an account have no machine to count their activations: only a plan whose keys go to machines starts with some used. */
export class LicenseKeyInitialActivationsOnAccountPlanError extends Error {
  constructor() {
    super('A plan whose keys go to an account cannot start with activations already used.');
    this.name = 'LicenseKeyInitialActivationsOnAccountPlanError';
  }
}

/** A plan bundled with the machine has no key to keep: the software comes with the machine. */
export class LicenseKeyPlanHasNoKeysError extends Error {
  constructor() {
    super('A plan bundled with the machine has no license keys.');
    this.name = 'LicenseKeyPlanHasNoKeysError';
  }
}

/** The cap of activations of a key only goes up (trigger `license_key_guard`). */
export class LicenseKeyMaxActivationsNotRaisedError extends Error {
  constructor(readonly current: number) {
    super('The cap of activations of a key can only be raised.');
    this.name = 'LicenseKeyMaxActivationsNotRaisedError';
  }
}

/** The key changed since the caller read it (`expectedUpdatedAt` no longer matches). */
export class LicenseKeyStaleError extends Error {
  constructor(readonly currentUpdatedAt: Date) {
    super('The license key was changed by someone else since it was read.');
    this.name = 'LicenseKeyStaleError';
  }
}
