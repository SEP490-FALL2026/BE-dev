/**
 * What the policy of a successor refuses, as a semantic code and the facts a person needs to put it right. The caller gives the code its
 * prefix on the wire (a head who must name a successor is `PERSONNEL.SUCCESSOR_REQUIRED` for a departure and a transfer alike).
 */
export interface SuccessorRefusal {
  code: string;
  details?: Record<string, unknown>;
}

/** How a person chosen to follow the head of a department stands on the day they would take it over. */
export interface SuccessorCandidate {
  /** The person who leaves the department (the one who is moved or who departs): nobody follows themselves. */
  isTransferee: boolean;
  memberOfOldDepartmentOnDay: boolean;
  stillWorking: boolean;
  holdsSuperAdmin: boolean;
  /** The account of the person holds a MANAGER grant that is in force; false when they have no account (QĐ-93a). */
  holdsManager: boolean;
  /** The account of the person holds the SPENDING_APPROVER grant, who never heads a department (QĐ-93b). */
  holdsSpendingApprover: boolean;
  /** Their own transfer waits: they would leave the department the head is handed to. */
  hasPendingTransfer: boolean;
}

/** What a change of the head of a department is judged on: whether it needs a successor, what was chosen, and for an employee how they stand. */
export interface SuccessorFacts {
  /** The person leaves a department they head, or are assigned to head, on their last day in it (a departure) or across the day before a transfer takes effect. */
  required: boolean;
  /** What the caller chose; undefined when nothing was said. */
  chosen: { kind: 'EMPLOYEE'; employeeId: string } | { kind: 'NONE' } | undefined;
  /** For a chosen employee: how they stand on the day. Read only when one is chosen. */
  candidate: SuccessorCandidate | null;
}

const notAMember = (reason: string): SuccessorRefusal => ({
  code: 'SUCCESSOR_NOT_A_MEMBER_ON_DATE',
  details: { reason },
});

/**
 * Whether the person chosen can take the department over on the day (`US-03-01` AC-8, `QĐ-66a`, `QĐ-93a/b`): a member of the old
 * department that day, who works, is not the person leaving, has no transfer of their own waiting, is not a Super Admin, and holds MANAGER
 * (the spending approver never does and is named for it). The first thing that is wrong wins, in the order a person would fix it.
 */
export function successorCandidateRefusal(candidate: SuccessorCandidate | null): SuccessorRefusal | null {
  if (candidate === null || !candidate.memberOfOldDepartmentOnDay) return notAMember('NOT_A_MEMBER_ON_DATE');
  if (candidate.isTransferee) return notAMember('SAME_PERSON');
  if (candidate.hasPendingTransfer) return notAMember('HAS_PENDING_TRANSFER');
  if (!candidate.stillWorking) return notAMember('EMPLOYEE_NOT_ACTIVE');
  if (candidate.holdsSuperAdmin) return notAMember('SUPER_ADMIN_CANNOT_HEAD');
  // The spending approver first: they never hold MANAGER (QĐ-93b), so judged second they would only hear that MANAGER is missing.
  if (candidate.holdsSpendingApprover) return notAMember('SPENDING_APPROVER_CANNOT_HEAD');
  if (!candidate.holdsManager) return notAMember('MANAGER_ROLE_REQUIRED');

  return null;
}

/**
 * The head of a department who leaves must name an employee to follow them (`QĐ-110h`): nothing given and nobody (`NONE`) are both
 * refused with `SUCCESSOR_REQUIRED`, and the employee named is judged by {@link successorCandidateRefusal}. A person who does not head
 * the department is asked nothing, whatever they gave. A Super Admin who finds no one holds MANAGER in the department changes the role of
 * one of its members first.
 */
export function successorRequiredRefusal(facts: SuccessorFacts): SuccessorRefusal | null {
  if (!facts.required) return null;
  if (facts.chosen === undefined || facts.chosen.kind === 'NONE') return { code: 'SUCCESSOR_REQUIRED' };

  return successorCandidateRefusal(facts.candidate);
}
