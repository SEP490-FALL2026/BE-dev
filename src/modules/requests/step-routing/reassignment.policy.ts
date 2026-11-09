/**
 * Who holds an open step when the organization or an approval role changes, as pure decisions (`FR-3.16`, `US-05-12`,
 * `US-05-11`). Nobody picks the new holder (`FR-3.5`): the routing tables do, run again on today's data; this file only says
 * which steps an event may touch, and whether the holder stays, changes, or the step waits under control. Nothing here
 * approves, refuses or cancels a request, and an absence, a leave or a heavy backlog is not an event (`AC-5`).
 */

/** The kinds of step that are given to a person to decide. The task of the IT Admin to carry out a grant is not one of them (`BR-03.4`). */
export type ReassignableStepKind = 'NEED' | 'SPEND_APPROVAL' | 'IT_ASSESSMENT';

/**
 * The events that make a step be looked at again. Closed: the four of `FR-3.16` (the department of the requester, the head of a
 * department, a holder who has left, an approval role changing hands), the day a change takes effect, and the retry of a step
 * that waits. There is no event for an absence, a leave or a backlog.
 */
export const REASSIGNMENT_TRIGGERS = [
  'DEPARTMENT_CHANGED',
  'HEAD_CHANGED',
  'HOLDER_LEFT',
  'ROLE_HOLDER_CHANGED',
  'EFFECTIVE_DATE_REACHED',
  'WAITING_RETRY',
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
 * Every reason a step can be read waiting for. `SPENDING_APPROVER_IS_PARTY` is a current reason: the spend routing writes it when
 * the spending approver is a party of the request (`QĐ-93d(2)`). The column is text: no migration.
 */
export const WAITING_REASON_CODES = [
  'NO_SPENDING_APPROVER',
  'NO_DEPARTMENT_HEAD',
  'SPENDING_APPROVER_IS_PARTY',
  'NO_IT_ADMIN_IN_CHARGE',
] as const;
export type WaitingReasonCode = (typeof WAITING_REASON_CODES)[number];

/**
 * Whether the event may take a step that somebody holds. The need step follows the department of the requester, the head of
 * the department and the day a change takes effect; every kind follows a holder who has left; the need step and the spend step
 * follow the person who held the role that named their holder. The review of Finance and the assessment of the IT Admin
 * change hands only when their holder leaves (and while they wait): Finance changing person pulls no step away from the person
 * who holds it.
 */
export function touchesHeldStep(step: OpenStep, trigger: ReassignmentTrigger): boolean {
  switch (trigger.kind) {
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
 * Keep, give, wait or wait again. A step that waits is tried again on every event: nobody holds it, so there is no holder to
 * protect and `FR-3.12` gives it as soon as somebody valid exists; when the table still names nobody but for another reason than
 * the step waits for, only the reason is written (`REWAIT`). A step somebody holds is looked at only when the event may touch it;
 * then it stays with the holder when the table still names them (the deadline is never reset by a holder who stays), goes to the
 * person the table names otherwise, and waits when the table names nobody.
 */
export function decideReassignment(
  step: OpenStep,
  trigger: ReassignmentTrigger,
  target: StepTarget,
): ReassignmentDecision {
  if (step.state === 'WAITING') {
    if (target.assigneeEmployeeId !== null) {
      return { action: 'ASSIGN', assigneeEmployeeId: target.assigneeEmployeeId, routingRow: target.routingRow };
    }

    return target.reason === step.waitingReason ? { action: 'KEEP' } : { action: 'REWAIT', reason: target.reason };
  }
  if (!touchesHeldStep(step, trigger)) return { action: 'KEEP' };
  if (target.assigneeEmployeeId === null) return { action: 'WAIT', reason: target.reason };
  if (target.assigneeEmployeeId === step.holderEmployeeId && !step.holderGone) {
    return { action: 'KEEP' };
  }

  return { action: 'ASSIGN', assigneeEmployeeId: target.assigneeEmployeeId, routingRow: target.routingRow };
}

/**
 * What the Super Admin or the IT Admin does to end a wait: the configuration that is missing, by the reason the step waits.
 */
export type ConfigurationHint = 'CONFIGURE_SPENDING_APPROVER' | 'ASSIGN_DEPARTMENT_HEAD' | 'NAME_IT_ADMIN_IN_CHARGE';

const HINTS: Record<WaitingReasonCode, ConfigurationHint> = {
  NO_SPENDING_APPROVER: 'CONFIGURE_SPENDING_APPROVER',
  NO_DEPARTMENT_HEAD: 'ASSIGN_DEPARTMENT_HEAD',
  SPENDING_APPROVER_IS_PARTY: 'CONFIGURE_SPENDING_APPROVER',
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

  return kind === 'NEED' ? 'PENDING' : 'AWAITING_SPEND_DECISION';
}
