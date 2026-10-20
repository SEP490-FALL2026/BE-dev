export type ApprovalRoleHolderProblem = 'EMPLOYEE_NOT_ACTIVE' | 'NO_USABLE_ACCOUNT' | 'SUPER_ADMIN_CANNOT_HOLD';

/** The person chosen cannot hold an approval role (US-01-03 AC-2, AC-6). */
export class ApprovalRoleHolderInvalidError extends Error {
  constructor(readonly problem: ApprovalRoleHolderProblem) {
    super(`The person cannot hold an approval role: ${problem}.`);
    this.name = 'ApprovalRoleHolderInvalidError';
  }
}

/** The substitute and the spending approver must be two people (US-01-03 AC-7, BR-13.12). */
export class ApprovalRolePairingError extends Error {
  constructor() {
    super('The substitute for a conflict of interest cannot be the spending approver.');
    this.name = 'ApprovalRolePairingError';
  }
}
