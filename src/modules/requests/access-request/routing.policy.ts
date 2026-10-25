/**
 * The routing table of the need step (`US-05-03`), as a pure decision. Nobody picks or changes who holds the step
 * (`FR-3.5`): the table does, from who sent the request and who holds which role on the day it is sent. The step is never
 * given to the person who asked (`SoD-4`, `INV-08`), never up a management line, and never to a role that only
 * administers (`SoD-1`, `SoD-3`, `SoD-5`): the only people it can reach are the head of the department, the spending
 * approver and the fallback approver.
 */

/** Who may hold the need step, and the facts the table reads. A person who has left is not passed in: the caller leaves them out. */
export interface RoutingFacts {
  requesterEmployeeId: string;
  /** The head of the department of the requester on the day of sending; null when it has none or the head has left. */
  departmentHeadEmployeeId: string | null;
  /** The one spending approver; null when none is set or the holder has left. */
  spendingApproverEmployeeId: string | null;
  /** The fallback approver (`R0`); null when none is set or the holder has left. */
  fallbackApproverEmployeeId: string | null;
  /** Whether the chain of this request has a spend step: only then can one person hold both steps. */
  chainHasSpendStep: boolean;
}

export type RoutedRole = 'MANAGER' | 'SPENDING_APPROVER' | 'FALLBACK_APPROVER';

/** Why nobody holds the step: the request waits under control (`US-05-11`), deciding and refusing nothing. */
export type WaitingReason = 'NO_SPENDING_APPROVER' | 'NO_FALLBACK_APPROVER' | 'FALLBACK_IS_REQUESTER';

export type RoutingDecision =
  | {
      outcome: 'ASSIGNED';
      /** The row of the table of `US-05-03`: 1 head, 2 head sending for themselves, 3 head who is the approver, 4 no head. */
      row: 1 | 2 | 3 | 4;
      assigneeEmployeeId: string;
      role: RoutedRole;
      /** The same person holds this step and the spend step: both are flagged. */
      samePersonAsSpend: boolean;
    }
  | { outcome: 'WAITING'; row: 8; reason: WaitingReason };

const assigned = (
  facts: RoutingFacts,
  row: 1 | 2 | 3 | 4,
  assigneeEmployeeId: string,
  role: RoutedRole,
): RoutingDecision => ({
  outcome: 'ASSIGNED',
  row,
  assigneeEmployeeId,
  role,
  samePersonAsSpend: facts.chainHasSpendStep && facts.spendingApproverEmployeeId === assigneeEmployeeId,
});

const waiting = (reason: WaitingReason): RoutingDecision => ({ outcome: 'WAITING', row: 8, reason });

/** The fallback approver for the two rows that name them (3 and 4); a fallback who is the requester decides nothing of their own request. */
function fallbackFor(facts: RoutingFacts, row: 3 | 4): RoutingDecision {
  const fallback = facts.fallbackApproverEmployeeId;
  if (fallback === null) return waiting('NO_FALLBACK_APPROVER');
  if (fallback === facts.requesterEmployeeId) return waiting('FALLBACK_IS_REQUESTER');

  return assigned(facts, row, fallback, 'FALLBACK_APPROVER');
}

/** Rows 1 to 4 and 8 of the routing table for one person asking for themselves. */
export function routeNeedStep(facts: RoutingFacts): RoutingDecision {
  const head = facts.departmentHeadEmployeeId;
  if (head === null) return fallbackFor(facts, 4);
  if (head !== facts.requesterEmployeeId) return assigned(facts, 1, head, 'MANAGER');

  // The head asks for themselves: the spending approver decides the need. With no spending approver set the request waits
  // and is not handed to the fallback approver (`QĐ-66k`); the fallback covers only the head who is the approver.
  const approver = facts.spendingApproverEmployeeId;
  if (approver === null) return waiting('NO_SPENDING_APPROVER');
  if (approver === facts.requesterEmployeeId) return fallbackFor(facts, 3);

  return assigned(facts, 2, approver, 'SPENDING_APPROVER');
}
