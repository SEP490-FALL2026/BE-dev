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

/**
 * `SPENDING_APPROVER_IS_PARTY` is a reason of the transition: only a Request made before the spending approver stopped being a party
 * of any Request (`D-S21`) can meet it, and the conversion command closes those. It is never given to the approver (`SoD-7`).
 */
export type WaitingSpendReason = 'NO_SPENDING_APPROVER' | 'SPENDING_APPROVER_IS_PARTY';

export type SpendAssignment =
  { outcome: 'ASSIGNED'; assigneeEmployeeId: string } | { outcome: 'WAITING'; reason: WaitingSpendReason };

/**
 * The spending approver holds the spend step, and nobody else does (`QĐ-93c`): with no approver who works it waits, and so it does
 * when the approver is the one who asked or one the request is for, which a Request sent now never is; no substitute takes it over.
 */
export function routeSpendStep(people: RequestPeople, spendingApproverEmployeeId: string | null): SpendAssignment {
  if (spendingApproverEmployeeId === null) return { outcome: 'WAITING', reason: 'NO_SPENDING_APPROVER' };
  if (isParty(people, spendingApproverEmployeeId)) return { outcome: 'WAITING', reason: 'SPENDING_APPROVER_IS_PARTY' };

  return { outcome: 'ASSIGNED', assigneeEmployeeId: spendingApproverEmployeeId };
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
