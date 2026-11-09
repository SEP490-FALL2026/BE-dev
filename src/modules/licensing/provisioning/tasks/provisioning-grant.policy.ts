/** What a grant task records as bought with it (`provisioning_tasks.purchase_*`). */
export interface GrantPurchase {
  kind: 'POOL_TOP_UP' | 'KEY_PURCHASE' | 'K1_SUBSCRIPTION';
  reason: string | null;
  purchasedAt: Date;
}

/**
 * What the grant bought (`BR-MF1-09b`, `BR-MF1-09d`): every K1 grant buys the seat of its holder (the quantity rises by one), so it
 * records `K1_SUBSCRIPTION` whether or not the IT Admin said so; a K2 or K4 grant records the purchase the pool allowed; one that took
 * its seat from the pool records none.
 */
export function grantPurchaseOf(
  provisioningType: string,
  decision: { purchased: false } | { purchased: true; kind: 'POOL_TOP_UP' | 'KEY_PURCHASE'; reason: string | null },
  now: Date,
): GrantPurchase | null {
  if (provisioningType === 'K1') return { kind: 'K1_SUBSCRIPTION', reason: null, purchasedAt: now };
  if (!decision.purchased) return null;

  return { kind: decision.kind, reason: decision.reason, purchasedAt: now };
}

/** Whether the request claimed in the transaction of the grant is still the one that was read before it: the same person, plan and kind of seat. */
export const claimMatchesAnswer = (
  claimed: { employeeId: string; planId: string; seat: string },
  answer: { employeeId: string; planId: string; seat: string },
): boolean =>
  claimed.employeeId === answer.employeeId && claimed.planId === answer.planId && claimed.seat === answer.seat;

/**
 * What the audit entry `PROVISIONING_TASK.CREATED` says: the request and the seat the task is for, its channel, and who is in charge by
 * default; and, when a person answers for the account, whether the IT Admin answered for it themselves.
 */
export function grantTaskAudit(
  requestId: string,
  assignmentId: string,
  task: { channel: string; defaultResponsibleEmployeeId: string | null },
  selfExecuted: boolean | null,
): { [key: string]: string | boolean | null } {
  return {
    requestId,
    assignmentId,
    channel: task.channel,
    defaultResponsibleEmployeeId: task.defaultResponsibleEmployeeId,
    ...(selfExecuted === null ? {} : { selfExecuted }),
  };
}

/** The department has nobody in charge of the queue of the IT Admin: the grant is made, and the warning says so. */
export const grantWarnings = (
  inCharge: { itAdminEmployeeId: string | null } | null,
): 'DEPARTMENT_WITHOUT_IT_ADMIN'[] =>
  inCharge && inCharge.itAdminEmployeeId === null ? ['DEPARTMENT_WITHOUT_IT_ADMIN'] : [];
