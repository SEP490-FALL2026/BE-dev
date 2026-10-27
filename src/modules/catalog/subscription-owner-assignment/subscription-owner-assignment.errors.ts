/** Why the command refuses; each is a stable word the operator can act on, and none carries data. */
export type AssignmentProblem =
  'SCHEMA_NOT_READY' | 'SUBSCRIPTION_NOT_FOUND' | 'DEPARTMENT_NOT_ACTIVE' | 'OWNER_ALREADY_SET';

/** The command did not write, and says why. */
export class AssignmentRefusedError extends Error {
  constructor(readonly problem: AssignmentProblem) {
    super(`The assignment was refused (${problem}).`);
    this.name = 'AssignmentRefusedError';
  }
}
