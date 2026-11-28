import type { BusinessDate } from '../../../core/business-date';

export type HandoverSourceKind = 'OFFBOARDING_CASE' | 'DEPARTMENT_TRANSFER';
export type ItHandoverState = 'PENDING' | 'DONE';
export type HandoverRefusal = 'SOURCE_CANCELLED' | 'NOTHING_TO_HAND_OVER';

/**
 * The day the technical work of the file begins and the hand-over is no longer the leaving IT Admin's alone (`R-26`): for a departure, the
 * first day it refuses the person (the block, or the day they left, whichever came first; null when it refuses nobody), for a transfer
 * the day it takes effect. Pure.
 */
export function milestoneDay(facts: {
  kind: HandoverSourceKind;
  blockedFrom: BusinessDate | null;
  leftOn: BusinessDate | null;
  effectiveOn: BusinessDate | null;
}): BusinessDate | null {
  if (facts.kind === 'DEPARTMENT_TRANSFER') return facts.effectiveOn;
  const days = [facts.blockedFrom, facts.leftOn].filter((day): day is BusinessDate => day !== null);

  return days.length === 0 ? null : days.reduce((first, day) => (day < first ? day : first));
}

export function milestoneReached(day: BusinessDate | null, today: BusinessDate): boolean {
  return day !== null && day <= today;
}

/**
 * Whether the Super Admin may hand over everything the leaving IT Admin answers for, judged in this order:
 * the file was cancelled; nothing is left to hand over. The role of the actor is judged before this.
 */
export function handoverRefusal(facts: {
  cancelled: boolean;
  milestoneReached?: boolean;
  actorEmployeeId?: string;
  leavingEmployeeId?: string;
  remaining: number;
}): HandoverRefusal | null {
  if (facts.cancelled) return 'SOURCE_CANCELLED';
  if (facts.remaining === 0) return 'NOTHING_TO_HAND_OVER';

  return null;
}

/** Pending while the person still answers for something; done when nothing is left, whether an IT Admin handed it over or it was moved one by one. */
export function handoverState(facts: { remaining: number }): ItHandoverState {
  return facts.remaining > 0 ? 'PENDING' : 'DONE';
}

/** Total catalog responsibilities held by an IT Admin across subscriptions, applications, workspaces, and license lots. */
export function remainingResponsibilities(counts?: {
  subscriptions: number;
  applications: number;
  workspaces?: number;
  licenseLots?: number;
}): number {
  if (!counts) return 0;

  return counts.subscriptions + counts.applications + (counts.workspaces ?? 0) + (counts.licenseLots ?? 0);
}

/**
 * The plans an admin at the vendor who leaves puts out of reach (`QĐ-110k`, SPEC T-IT, X-IT.6): those that nobody else who still works as an IT Admin
 * administers. Two or more left is fine and one left is only the flag a reader of the subscription sees; none left alerts the active subscription
 * IT Admins of the plan (or the usable Super Admin fallback).
 */
export function plansLeftWithoutAdmin<T extends { othersWorking: number }>(roles: readonly T[]): T[] {
  return roles.filter((role) => role.othersWorking === 0);
}

/** At the milestone of a file that was not cancelled, the Super Admin is told when the person still answers for something (`R-26`); it never blocks the file. */
export function pendingNoticeOwed(facts: {
  milestoneReached: boolean;
  cancelled: boolean;
  remaining: number;
}): boolean {
  return facts.milestoneReached && !facts.cancelled && facts.remaining > 0;
}
