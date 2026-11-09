/** The routing fixed on submission. A future head does not hold the department today. */
export interface RoutingFacts {
  requesterEmployeeId: string;
  departmentHeadEmployeeId: string | null;
  spendingApproverEmployeeId: string | null;
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

export function routeNeedStep(facts: RoutingFacts): RoutingDecision {
  const head = facts.departmentHeadEmployeeId;
  if (head === null) return { outcome: 'NOT_REQUIRED', row: 4, reason: null, oneStepReason: 'NO_DEPARTMENT_HEAD' };
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
