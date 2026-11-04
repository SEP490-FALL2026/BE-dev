/**
 * The routing table of the need step (`US-05-03`), as a pure decision. Nobody picks or changes who holds the step
 * (`FR-3.5`): the table does, from who sent the request and who holds which role on the day it is sent. The step is never
 * given to the person who asked (`SoD-4`, `INV-08`), never up a management line, and never to a role that only
 * administers (`SoD-1`, `SoD-3`, `SoD-5`): the only people it can reach are the head of the department and the spending
 * approver. There is no fallback approver (`QĐ-93c`): a department with no head waits for one (`FR-3.12`).
 */

/** Who may hold the need step, and the facts the table reads. A person who has left is not passed in: the caller leaves them out. */
export interface RoutingFacts {
  requesterEmployeeId: string;
  /** The head of the department of the requester on the day of sending; null when it has none or the head has left. */
  departmentHeadEmployeeId: string | null;
  /** The one spending approver; null when none is set or the holder has left. */
  spendingApproverEmployeeId: string | null;
  /** Whether the chain of this request has a spend step: only then can one person hold both steps. */
  chainHasSpendStep: boolean;
}

export type RoutedRole = 'MANAGER' | 'SPENDING_APPROVER';

/** Why nobody holds the step: the request waits under control (`US-05-11`), deciding and refusing nothing. */
export type WaitingReason = 'NO_SPENDING_APPROVER' | 'NO_DEPARTMENT_HEAD';

export type RoutingDecision =
  | {
      outcome: 'ASSIGNED';
      /** The row of the table of `US-05-03`: 1 head, 2 head sending for themselves. */
      row: 1 | 2;
      assigneeEmployeeId: string;
      role: RoutedRole;
      /** The same person holds this step and the spend step: both are flagged. */
      samePersonAsSpend: boolean;
    }
  /** Row 4: the department has no head. Row 8: the head sends for themselves and no spending approver can decide it. */
  | { outcome: 'WAITING'; row: 4 | 8; reason: WaitingReason };

const assigned = (facts: RoutingFacts, row: 1 | 2, assigneeEmployeeId: string, role: RoutedRole): RoutingDecision => ({
  outcome: 'ASSIGNED',
  row,
  assigneeEmployeeId,
  role,
  samePersonAsSpend: facts.chainHasSpendStep && facts.spendingApproverEmployeeId === assigneeEmployeeId,
});

/** Rows 1, 2, 4 and 8 of the routing table for one person asking for themselves. */
export function routeNeedStep(facts: RoutingFacts): RoutingDecision {
  const head = facts.departmentHeadEmployeeId;
  if (head === null) return { outcome: 'WAITING', row: 4, reason: 'NO_DEPARTMENT_HEAD' };
  if (head !== facts.requesterEmployeeId) return assigned(facts, 1, head, 'MANAGER');

  // The head asks for themselves: the spending approver decides the need. With no spending approver set the request waits
  // (`QĐ-66k`). The head who is also the spending approver cannot be (`QĐ-93b`); data from before that still waits, as it
  // has no approver who may decide their own request.
  const approver = facts.spendingApproverEmployeeId;
  if (approver === null || approver === facts.requesterEmployeeId) {
    return { outcome: 'WAITING', row: 8, reason: 'NO_SPENDING_APPROVER' };
  }

  return assigned(facts, 2, approver, 'SPENDING_APPROVER');
}
