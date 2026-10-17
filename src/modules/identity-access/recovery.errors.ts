export type RecoveryProblem =
  // The ticket itself
  | 'TICKET_REFERENCE_INVALID'
  | 'TICKET_OF_ANOTHER_KIND'
  | 'TICKET_PARAMETERS_DIFFER'
  | 'TICKET_SUPERSEDED'
  // Who runs it (US-01-09 AC-13)
  | 'APPROVER_IS_OPERATOR'
  | 'RECIPIENT_IS_OPERATOR'
  // The account it acts on
  | 'TARGET_NOT_FOUND'
  | 'TARGET_NOT_HOLDER'
  | 'TARGET_NOT_USABLE'
  | 'TARGET_NOT_LOCKED'
  | 'TARGET_EMPLOYEE_LEFT'
  | 'NEW_EMAIL_INVALID'
  | 'NEW_EMAIL_TAKEN'
  // Handing the role to someone else (US-01-09 AC-12)
  | 'HOLDER_STILL_USABLE'
  | 'HOLDER_NOT_FOUND'
  | 'SUCCESSOR_IS_HOLDER'
  | 'SUCCESSOR_NOT_FOUND'
  | 'SUCCESSOR_HAS_NO_EMAIL'
  | 'SUCCESSOR_EMAIL_TAKEN'
  | 'SUCCESSOR_NOT_ACTIVATED_YET'
  | 'SUCCESSOR_NOT_FOUND_ACCOUNT'
  | 'ACCOUNT_LOCKED'
  | 'EMPLOYEE_NOT_WORKING'
  | 'NOT_ACTIVATED'
  | 'EMAIL_NOT_VERIFIED'
  | 'WORK_ROLE_HELD'
  | 'APPROVAL_ROLE_HELD'
  | 'HEADS_DEPARTMENT';

/**
 * The recovery cannot be done as asked: nothing was changed, the ticket included (unless the message says it was
 * superseded). The problem is a stable code the command prints; it never carries a secret.
 */
export class RecoveryRefusedError extends Error {
  constructor(
    readonly problem: RecoveryProblem,
    message?: string,
  ) {
    super(message ?? `The recovery was refused: ${problem}.`);
    this.name = 'RecoveryRefusedError';
  }
}
