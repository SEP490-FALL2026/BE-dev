export type DirectionEnvironment = 'LOCAL_TEST' | 'SHARED';

/** What the operator typed for `activate`, parsed and trimmed. Nothing in it is inferred. */
export interface ActivateCommand {
  releaseEvidence: string;
  approvedBy: string;
  operator: string;
  environment: DirectionEnvironment;
}

/** What the operator typed for `link`, parsed and trimmed: ONE Cost Center and the department Finance approved for it. */
export interface LinkCommand {
  costCenterId: string;
  departmentCode: string;
  basis: string;
  approvedBy: string;
  operator: string;
  environment: DirectionEnvironment;
}

/** What `activate` answers: the organization and what happened, never the evidence, the approver or the operator. */
export interface ActivateResult {
  organizationId: string;
  outcome: 'ACTIVATED' | 'ALREADY_ACTIVATED';
}

/** What `link` answers: the two ids and what happened, never a name, a basis, an approver or an operator. */
export interface LinkResult {
  costCenterId: string;
  departmentId: string;
  outcome: 'LINKED' | 'ALREADY_LINKED';
}

export type ParsedDirectionArguments =
  | { help: true }
  | { help: false; mode: 'activate'; command: ActivateCommand }
  | { help: false; mode: 'link'; command: LinkCommand };
