/** The application of the purchase is retired: no key is kept for it any more (`US-04-01` AC-8, AC-9, F23). */
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
