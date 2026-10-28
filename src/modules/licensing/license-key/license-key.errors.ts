/** The application of the purchase is retired: no key is kept for it any more (`US-04-01` AC-8, AC-9, F23). */
export class LicenseKeyApplicationRetiredError extends Error {
  constructor() {
    super('The application of the purchase is retired: no license key is kept for it.');
    this.name = 'LicenseKeyApplicationRetiredError';
  }
}
