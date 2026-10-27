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

/** The people who have a file that waits are more than the list can take: narrow it to one person. */
export class ServiceAccountDutyTooManyError extends Error {
  constructor() {
    super('Too many people have a file that waits for the duties to be listed.');
    this.name = 'ServiceAccountDutyTooManyError';
  }
}
