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
 * The key of a K4 grant (`BR-MF1-09`, `QĐ-103d`): the completion of a K4 grant names the key of the store it gives the seat, and the
 * completion of any other kind names none.
 */
export class ProvisioningKeyError extends Error {
  constructor(readonly problem: 'KEY_REQUIRED' | 'KEY_NOT_APPLICABLE') {
    super(
      problem === 'KEY_REQUIRED'
        ? 'The grant of a K4 seat is completed with the key of the store it gives (licenseKeyId).'
        : 'Only the grant of a K4 seat is completed with a license key.',
    );
    this.name = 'ProvisioningKeyError';
  }
}
