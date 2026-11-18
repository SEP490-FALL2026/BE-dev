/** Why the command refuses; each is a stable word the operator can act on, and none carries data. */
export type DirectionProblem =
  | 'SCHEMA_NOT_READY'
  | 'NOT_INSTALLED'
  | 'RELEASE_EVIDENCE_INVALID'
  | 'BASIS_INVALID'
  | 'APPROVER_IS_OPERATOR'
  | 'COST_CENTER_NOT_FOUND'
  | 'COST_CENTER_ALREADY_LINKED'
  | 'DEPARTMENT_NOT_FOUND'
  | 'DEPARTMENT_NOT_ACTIVE'
  | 'DEPARTMENT_ALREADY_HAS_ACTIVE_COST_CENTER'
  | 'COST_CENTER_REFERENCES_CONFLICT';

/** The command did not write, and says why. */
export class DirectionRefusedError extends Error {
  constructor(readonly problem: DirectionProblem) {
    super(`The command was refused (${problem}).`);
    this.name = 'DirectionRefusedError';
  }
}
