/**
 * Who holds an open step when the organization or an approval role changes, as pure decisions (`FR-3.16`, `US-05-12`,
 * `US-05-11`). Nobody picks the new holder (`FR-3.5`): the routing tables do, run again on today's data; this file only says
 * which steps an event may touch, and whether the holder stays, changes, or the step waits under control. Nothing here
 * approves, refuses or cancels a request, and an absence, a leave or a heavy backlog is not an event (`AC-5`).
 */

/** The kinds of step that are given to a person to decide. The task of the IT Admin to carry out a grant is not one of them (`BR-03.4`). */
export type ReassignableStepKind = 'NEED' | 'FINANCE_REVIEW' | 'SPEND_APPROVAL' | 'IT_ASSESSMENT';

/**
 * The events that make a step be looked at again. Closed: the four of `FR-3.16` (the department of the requester, the head of a
 * department, a holder who has left, an approval role changing hands), the day a change takes effect, and the retry of a step
 * that waits. There is no event for an absence, a leave or a backlog. `QD93_CONVERSION` is raised only by the conversion command
 * (`pnpm ops:approval-role-conversion`), never by the sweep or a listener, and moves only a step of the old rule (`isLegacyStep`).
 */
export const REASSIGNMENT_TRIGGERS = [
  'DEPARTMENT_CHANGED',
  'HEAD_CHANGED',
  'HOLDER_LEFT',
  'ROLE_HOLDER_CHANGED',
  'EFFECTIVE_DATE_REACHED',
  'WAITING_RETRY',
  'QD93_CONVERSION',
] as const;
export type ReassignmentTriggerKind = (typeof REASSIGNMENT_TRIGGERS)[number];

export interface ReassignmentTrigger {
  kind: ReassignmentTriggerKind;
  /** For `ROLE_HOLDER_CHANGED`, the person who held the role before: the steps they hold are looked at. Null otherwise. */
  employeeId: string | null;
}

/** An open step as the policy reads it. */
export interface OpenStep {
  kind: ReassignableStepKind;
  /** `PENDING` is held by somebody; `WAITING` is held by nobody and waits under control. */
  state: 'PENDING' | 'WAITING';
  holderEmployeeId: string | null;
  /** The holder has left the company: they no longer count as valid even though the step still names them. */
  holderGone: boolean;
  /** Why the step waits now; null while somebody holds it. */
  waitingReason: string | null;
  /**
   * The step is of the rule before `QĐ-93` (`isLegacyStep`): it stays still, whatever happens, until the conversion command
   * moves it (`QĐ-93k(2)`).
   */
  legacy: boolean;
}

/** Who the routing table gives the step on today's data: a person, or nobody and why. */
export type StepTarget =
  { assigneeEmployeeId: string; routingRow: number | null } | { assigneeEmployeeId: null; reason: WaitingReasonCode };

export type ReassignmentDecision =
  | { action: 'KEEP' }
  | { action: 'ASSIGN'; assigneeEmployeeId: string; routingRow: number | null }
  | { action: 'WAIT'; reason: WaitingReasonCode }
  /** A step that waits goes on waiting, for another reason: only the reason is written, the stretch and the deadline stay. */
  | { action: 'REWAIT'; reason: WaitingReasonCode };

/**
 * Every reason a step can be read waiting for. `NO_FALLBACK_APPROVER`, `FALLBACK_IS_REQUESTER` and `NO_CONFLICT_SUBSTITUTE` are
 * read only (`QĐ-93c`): nothing writes them any more, and a step that still has one is a step of the old rule until the
 * conversion command rewaits it. `SPENDING_APPROVER_IS_PARTY` is a transitional reason (a request of before the spending approver
 * stopped being a party). The column is text: no migration.
 */
export const WAITING_REASON_CODES = [
  'NO_SPENDING_APPROVER',
  'NO_DEPARTMENT_HEAD',
  'SPENDING_APPROVER_IS_PARTY',
  'NO_FINANCE_REVIEWER',
  'NO_IT_ADMIN_IN_CHARGE',
  'NO_FALLBACK_APPROVER',
  'FALLBACK_IS_REQUESTER',
  'NO_CONFLICT_SUBSTITUTE',
] as const;
export type WaitingReasonCode = (typeof WAITING_REASON_CODES)[number];

/** The reasons a step waited for under the rule before `QĐ-93`: a step that has one is frozen until the conversion. */
const LEGACY_WAITING_REASONS: ReadonlySet<string> = new Set([
  'NO_FALLBACK_APPROVER',
  'FALLBACK_IS_REQUESTER',
  'NO_CONFLICT_SUBSTITUTE',
  'SPENDING_APPROVER_IS_PARTY',
]);

/** What `isLegacyStep` reads of a step. */
export interface LegacyCandidate {
  kind: ReassignableStepKind;
  state: string;
  routingRow: number;
  assigneeEmployeeId: string | null;
  waitingReason: string | null;
}

/**
 * A step of the rule before `QĐ-93`: a need step that is pending on row 3 or 4 (the approver of last resort holds it); a step that
 * waits for one of the old reasons; a spend step that is pending with a holder who has **never** had a `SPENDING_APPROVER` grant,
 * revoked or not — the substitute for a conflict of interest. `spendingApproverGrantees` is who, among the holders of the pending
 * spend steps, has ever held that grant (`IdentityAccessApi.everHeldSpendingApproverAmong`).
 *
 * The dividing fact is the history of the grant and not who holds it now: revoking or transferring the role changes the second and
 * never the first, so a spend step of a former spending approver is not legacy and is handed over or made to wait as before
 * (`US-01-03` AC-3, `US-05-11` AC-10).
 */
export function isLegacyStep(step: LegacyCandidate, spendingApproverGrantees: ReadonlySet<string>): boolean {
  if (step.state === 'WAITING') return step.waitingReason !== null && LEGACY_WAITING_REASONS.has(step.waitingReason);
  if (step.state !== 'PENDING') return false;
  if (step.kind === 'NEED') return step.routingRow === 3 || step.routingRow === 4;
  if (step.kind === 'SPEND_APPROVAL') {
    return step.assigneeEmployeeId !== null && !spendingApproverGrantees.has(step.assigneeEmployeeId);
  }

  return false;
}

/**
 * Whether the event may take a step that somebody holds. The need step follows the department of the requester, the head of
 * the department and the day a change takes effect; every kind follows a holder who has left; the need step and the spend step
 * follow the person who held the role that named their holder. The review of Finance and the assessment of the IT Admin
 * change hands only when their holder leaves (and while they wait): Finance changing person pulls no step away from the person
 * who holds it.
 */
export function touchesHeldStep(step: OpenStep, trigger: ReassignmentTrigger): boolean {
  switch (trigger.kind) {
    case 'QD93_CONVERSION':
      return step.legacy;
    case 'DEPARTMENT_CHANGED':
    case 'HEAD_CHANGED':
    case 'EFFECTIVE_DATE_REACHED':
      return step.kind === 'NEED';
    case 'HOLDER_LEFT':
      return step.holderGone;
    case 'ROLE_HOLDER_CHANGED':
      return (
        (step.kind === 'NEED' || step.kind === 'SPEND_APPROVAL') &&
        trigger.employeeId !== null &&
        step.holderEmployeeId === trigger.employeeId
      );
    case 'WAITING_RETRY':
      return false;
  }
}

/**
 * Keep, give, wait or wait again. A step of the old rule stays still for every event but the conversion, and the conversion moves
 * nothing else (`QĐ-93k(2)`). A step that waits is tried again on every event: nobody holds it, so there is no holder to protect
 * and `FR-3.12` gives it as soon as somebody valid exists; when the table still names nobody but for another reason than the step
 * waits for, only the reason is written (`REWAIT`). A step somebody holds is looked at only when the event may touch it; then it
 * stays with the holder when the table still names them and the step is not of the old rule (the deadline is never reset by a
 * holder who stays), goes to the person the table names otherwise — a step of the old rule that the table still gives to its holder
 * is given again, to write its row — and waits when the table names nobody.
 */
export function decideReassignment(
  step: OpenStep,
  trigger: ReassignmentTrigger,
  target: StepTarget,
): ReassignmentDecision {
  if (step.legacy !== (trigger.kind === 'QD93_CONVERSION')) return { action: 'KEEP' };
  if (step.state === 'WAITING') {
    if (target.assigneeEmployeeId !== null) {
      return { action: 'ASSIGN', assigneeEmployeeId: target.assigneeEmployeeId, routingRow: target.routingRow };
    }

    return target.reason === step.waitingReason ? { action: 'KEEP' } : { action: 'REWAIT', reason: target.reason };
  }
  if (!touchesHeldStep(step, trigger)) return { action: 'KEEP' };
  if (target.assigneeEmployeeId === null) return { action: 'WAIT', reason: target.reason };
  if (target.assigneeEmployeeId === step.holderEmployeeId && !step.holderGone && !step.legacy) {
    return { action: 'KEEP' };
  }

  return { action: 'ASSIGN', assigneeEmployeeId: target.assigneeEmployeeId, routingRow: target.routingRow };
}

/**
 * What the Super Admin or the IT Admin does to end a wait: the configuration that is missing, by the reason the step waits.
 * `CONFIGURE_FALLBACK_APPROVER` and `CONFIGURE_CONFLICT_SUBSTITUTE` are historical (an alert written before `QĐ-93c`): nothing
 * produces them any more.
 */
export type ConfigurationHint =
  | 'CONFIGURE_SPENDING_APPROVER'
  | 'CONFIGURE_FALLBACK_APPROVER'
  | 'CONFIGURE_CONFLICT_SUBSTITUTE'
  | 'GRANT_FINANCE_ROLE'
  | 'ASSIGN_DEPARTMENT_HEAD'
  | 'NAME_IT_ADMIN_IN_CHARGE';

const HINTS: Record<WaitingReasonCode, ConfigurationHint> = {
  NO_SPENDING_APPROVER: 'CONFIGURE_SPENDING_APPROVER',
  NO_DEPARTMENT_HEAD: 'ASSIGN_DEPARTMENT_HEAD',
  // Transitional: the spending approver gets a grant (`QĐ-93d(1)`), the one thing a request of before is waiting for.
  SPENDING_APPROVER_IS_PARTY: 'CONFIGURE_SPENDING_APPROVER',
  // Read only (`QĐ-93c`): a step of the old rule is not asked to configure what is gone — the department needs a head, the
  // spending approver a grant.
  NO_FALLBACK_APPROVER: 'ASSIGN_DEPARTMENT_HEAD',
  FALLBACK_IS_REQUESTER: 'ASSIGN_DEPARTMENT_HEAD',
  NO_CONFLICT_SUBSTITUTE: 'CONFIGURE_SPENDING_APPROVER',
  NO_FINANCE_REVIEWER: 'GRANT_FINANCE_ROLE',
  NO_IT_ADMIN_IN_CHARGE: 'NAME_IT_ADMIN_IN_CHARGE',
};

/** The configuration that ends the wait; `null` for a reason this version does not know, so a row never carries a made-up hint. */
export function configurationHintOf(reason: string): ConfigurationHint | null {
  return (HINTS as Record<string, ConfigurationHint | undefined>)[reason] ?? null;
}

/**
 * Who is told that a step waits: always the Super Admin, who assigns the head and grants the roles (`US-05-11` AC-6, `D-S20`).
 * Nobody else: the IT Admin in charge was told only when a department had neither a head nor a fallback approver, and there is
 * no fallback approver any more (`QĐ-93c`). Never empty, so a stretch of waiting is always told to somebody.
 */
export function alertRecipientsOf(): ['SUPER_ADMIN'] {
  return ['SUPER_ADMIN'];
}

/**
 * The request state while the step is given or waits (the assessment of the IT Admin does not move the request): `null`
 * when the step kind leaves the state of the request as it is.
 */
export function requestStateFor(kind: ReassignableStepKind, held: boolean): string | null {
  if (kind === 'IT_ASSESSMENT') return null;
  if (!held) return 'WAITING_CONTROLLED';

  return kind === 'NEED'
    ? 'PENDING'
    : kind === 'FINANCE_REVIEW'
      ? 'AWAITING_FINANCE_REVIEW'
      : 'AWAITING_SPEND_DECISION';
}
