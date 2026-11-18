/** The routing fixed on submission. A future head does not hold the department today. */
export interface RoutingFacts {
  requesterEmployeeId: string;
  /** The head of the department on the day who can still act; null when it has none (a successor named for a later day is not one). */
  departmentHeadEmployeeId: string | null;
  spendingApproverEmployeeId: string | null;
  /**
   * Whether the chain of the request has a spend step: paid software of the catalog and a proposal of software that is not in it (whose
   * price is unknown when it is sent) have one; free internal software has none (`QĐ-50a`).
   */
  chainHasSpendStep: boolean;
}
export type RoutedRole = 'MANAGER' | 'SPENDING_APPROVER';
export type WaitingReason = 'NO_SPENDING_APPROVER' | 'NO_DEPARTMENT_HEAD';
export type OneStepReason = 'REQUESTER_IS_HEAD' | 'NO_DEPARTMENT_HEAD' | 'HEAD_LEFT';
export interface RequestRouting {
  mode: 'VIA_HEAD' | 'ONE_STEP';
  oneStepReason: OneStepReason | null;
}
export type RoutingDecision =
  | { outcome: 'ASSIGNED'; row: 1; assigneeEmployeeId: string; role: 'MANAGER' }
  | { outcome: 'NOT_REQUIRED'; row: 2 | 4; reason: null; oneStepReason: OneStepReason }
  | { outcome: 'WAITING'; row: 4 | 8; reason: WaitingReason };

/**
 * The need step of a request, in the five cases of a department that may have no head (`QĐ-110i`, `QĐ-111bc`, `R-43`):
 * 1. a paid request of an employee of a department with no head waits at the need step (`NO_DEPARTMENT_HEAD`); it is never sent on in one step;
 * 2. so does a proposal of software that is not in the catalog (case B), which does not know yet whether it ends free or paid: it never goes
 *    on to the assessment of the IT Admin without the need being decided;
 * 3. the head asking for themselves goes in one step, whatever the request is;
 * 4. free internal software already in the catalog costs nothing, so with no head it goes straight to the IT Admin; the one-step reason
 *    `NO_DEPARTMENT_HEAD` is what the audit flag for the Super Admin reads (`NO_NEED_APPROVER`);
 * 5. a department with a head sends the request of a member to the head.
 */
export function routeNeedStep(facts: RoutingFacts): RoutingDecision {
  const head = facts.departmentHeadEmployeeId;
  if (head === null) {
    return facts.chainHasSpendStep
      ? { outcome: 'WAITING', row: 4, reason: 'NO_DEPARTMENT_HEAD' }
      : { outcome: 'NOT_REQUIRED', row: 4, reason: null, oneStepReason: 'NO_DEPARTMENT_HEAD' };
  }
  if (head === facts.requesterEmployeeId)
    return { outcome: 'NOT_REQUIRED', row: 2, reason: null, oneStepReason: 'REQUESTER_IS_HEAD' };
  return { outcome: 'ASSIGNED', row: 1, assigneeEmployeeId: head, role: 'MANAGER' };
}
export const routeRequest = routeNeedStep;
export function requestRoutingOf(decision: RoutingDecision): RequestRouting {
  return decision.outcome === 'NOT_REQUIRED'
    ? { mode: 'ONE_STEP', oneStepReason: decision.oneStepReason }
    : { mode: 'VIA_HEAD', oneStepReason: null };
}
