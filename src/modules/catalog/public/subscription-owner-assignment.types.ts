/** What the operator typed, parsed and trimmed. Nothing in it is inferred. */
export interface AssignmentCommand {
  subscriptionId: string;
  departmentCode: string;
  basis: string;
  operator: string;
  environment: 'LOCAL_TEST' | 'SHARED';
}

/** What the command answers: the two ids and what happened, never a name, a basis or an operator. */
export interface AssignmentResult {
  subscriptionId: string;
  departmentId: string;
  outcome: 'ASSIGNED' | 'ALREADY_ASSIGNED';
}
