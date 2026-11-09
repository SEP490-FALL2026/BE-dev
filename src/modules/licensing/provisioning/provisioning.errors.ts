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
