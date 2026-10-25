/**
 * Who holds the steps after the check of the budget, as pure decisions (`US-06-13`, `US-06-01`, `FR-3.15`). Nobody picks the
 * holder (`FR-3.5`): the roles do. Nobody decides a request of their own or one they are given, whatever role they hold
 * (`SoD-4`), and a step nobody valid can hold waits under control and is never given to someone else (`US-05-11`).
 */

/** The people a request is about: the one who sent it and the ones it is for. */
export interface RequestPeople {
  requesterEmployeeId: string;
  beneficiaryEmployeeIds: readonly string[];
}

const isParty = (people: RequestPeople, employeeId: string): boolean =>
  people.requesterEmployeeId === employeeId || people.beneficiaryEmployeeIds.includes(employeeId);

export type WaitingSpendReason = 'NO_SPENDING_APPROVER' | 'NO_CONFLICT_SUBSTITUTE';

export type SpendAssignment =
  | { outcome: 'ASSIGNED'; assigneeEmployeeId: string; substituted: boolean }
  | { outcome: 'WAITING'; reason: WaitingSpendReason };

/**
 * The spending approver holds the spend step. When they are the one who asked or one the request is for, the substitute for a
 * conflict of interest holds it instead (`US-06-14` AC-7); with no substitute that can decide it, it waits.
 */
export function routeSpendStep(
  people: RequestPeople,
  holders: { spendingApproverEmployeeId: string | null; conflictSubstituteEmployeeId: string | null },
): SpendAssignment {
  const approver = holders.spendingApproverEmployeeId;
  if (approver === null) return { outcome: 'WAITING', reason: 'NO_SPENDING_APPROVER' };
  if (!isParty(people, approver)) return { outcome: 'ASSIGNED', assigneeEmployeeId: approver, substituted: false };

  const substitute = holders.conflictSubstituteEmployeeId;
  if (substitute === null || isParty(people, substitute))
    return { outcome: 'WAITING', reason: 'NO_CONFLICT_SUBSTITUTE' };

  return { outcome: 'ASSIGNED', assigneeEmployeeId: substitute, substituted: true };
}

export const NO_FINANCE_REVIEWER = 'NO_FINANCE_REVIEWER';

export type ReviewAssignment =
  | { outcome: 'ASSIGNED'; assigneeEmployeeId: string }
  /** Nobody who can act holds the role of Finance now: the request waits and Finance is not replaced (`US-06-13` AC-6). */
  | { outcome: 'WAITING'; reason: typeof NO_FINANCE_REVIEWER }
  /** Finance is the one the request is for: there is nobody independent to review it (`US-06-13` AC-5). */
  | { outcome: 'SKIPPED' };

export function routeFinanceReview(people: RequestPeople, financeEmployeeId: string | null): ReviewAssignment {
  if (financeEmployeeId === null) return { outcome: 'WAITING', reason: NO_FINANCE_REVIEWER };
  if (isParty(people, financeEmployeeId)) return { outcome: 'SKIPPED' };

  return { outcome: 'ASSIGNED', assigneeEmployeeId: financeEmployeeId };
}
