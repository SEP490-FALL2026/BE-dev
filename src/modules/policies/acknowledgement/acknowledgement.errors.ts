/** The version in force does not apply to any role the account holds, so there is nothing for it to acknowledge. */
export class PolicyAcknowledgementNotRequiredError extends Error {
  constructor() {
    super('The policy in force does not apply to any role of this account.');
    this.name = 'PolicyAcknowledgementNotRequiredError';
  }
}
