/**
 * Errors the identity-access facade throws that code outside the module may catch (the installation
 * command maps this one to its exit message). Errors that stay inside the module live in errors/.
 */
export class PasswordPolicyError extends Error {
  constructor(readonly violation: string) {
    super(`The password does not meet the policy: ${violation}`);
    this.name = 'PasswordPolicyError';
  }
}
