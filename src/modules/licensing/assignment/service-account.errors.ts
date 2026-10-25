import type { BusinessDate } from '../../../core/business-date';

/**
 * The person responsible for a service account is being replaced after the day the file of the person takes effect (`US-03-01`
 * AC-9, `US-03-08`): the change has to come no later than that day while the file still waits.
 */
export class AssignmentResponsibleAfterDeadlineError extends Error {
  constructor(readonly dueOn: BusinessDate) {
    super(`The change of the person responsible comes after the day the file takes effect (${dueOn}).`);
    this.name = 'AssignmentResponsibleAfterDeadlineError';
  }
}

export type ServiceAccountMoveProblem =
  | 'NOT_FOUND'
  /** The caller is not the head of the receiving department, nor the fallback approver when it has no head. */
  | 'NOT_CONFIRMER'
  | 'NOT_PENDING'
  /** The day the move takes effect has passed: it has to be proposed again. */
  | 'MOVE_EFFECTIVE_DATE_PASSED'
  | 'PENDING_EXISTS'
  | 'TARGET_DEPARTMENT_INVALID'
  | 'RESPONSIBLE_INVALID'
  | 'REASON_REQUIRED';

/** A proposal to move a service account to another department was refused; nothing is written. `reason` says what to put right. */
export class ServiceAccountMoveError extends Error {
  constructor(
    readonly problem: ServiceAccountMoveProblem,
    readonly reason?: string,
  ) {
    super(`The move of the service account was refused: ${problem}${reason ? ` (${reason})` : ''}.`);
    this.name = 'ServiceAccountMoveError';
  }
}

/** The people who have a file that waits are more than the list can take: narrow it to one person. */
export class ServiceAccountDutyTooManyError extends Error {
  constructor() {
    super('Too many people have a file that waits for the duties to be listed.');
    this.name = 'ServiceAccountDutyTooManyError';
  }
}
