import type { DepartmentSoftwareItem } from './department-software.policy';

/** A place of the list of a department (`QĐ-110s`), as the table keeps it. */
export interface SoftwareEntry extends DepartmentSoftwareItem {
  id: string;
  organizationId: string;
  departmentId: string;
  note: string | null;
  addedAt: Date;
}

export type ProposalState = 'PENDING' | 'ACCEPTED' | 'REJECTED';

/** The proposal of the head of a department to add a place to its list (`QĐ-110t`), as the table keeps it. */
export interface SoftwareProposal extends DepartmentSoftwareItem {
  id: string;
  organizationId: string;
  departmentId: string;
  reason: string;
  state: ProposalState;
  proposedByEmployeeId: string;
  proposedAt: Date;
  decidedAt: Date | null;
  decisionReason: string | null;
}

/** A place to add to the list, with the note that goes with it. */
export interface SoftwareEntryDraft extends DepartmentSoftwareItem {
  note: string | null;
}

/** What the caller of a list of proposals asks for: the departments in scope (null = all of them), one department, one state. */
export interface ProposalFilter {
  departmentIds: readonly string[] | null;
  departmentId?: string;
  state?: ProposalState;
}
