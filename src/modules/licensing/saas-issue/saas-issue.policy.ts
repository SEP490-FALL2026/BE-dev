import { addDays, type BusinessDate } from '../../../core/business-date';
import { addWorkingDays, type NonWorkingDates } from '../../../core/working-days';
import type { SaasIssueProblem } from './saas-issue.errors';

export const SAAS_ISSUE_STATES = [
  'NEW',
  'IN_PROGRESS',
  'WAITING_REPORTER',
  'WAITING_PROVIDER',
  'RESOLVED',
  'CLOSED',
  'DUPLICATE',
] as const;
export type SaasIssueState = (typeof SAAS_ISSUE_STATES)[number];

export const SAAS_ISSUE_CATEGORIES = [
  'NO_ACCESS',
  'INVITATION_OR_ACTIVATION',
  'MISSING_PLAN_FEATURE',
  'PROVIDER_OUTAGE',
  'OTHER',
] as const;
export type SaasIssueCategory = (typeof SAAS_ISSUE_CATEGORIES)[number];

export const SAAS_ISSUE_IMPACTS = ['UNUSABLE', 'PARTIAL', 'QUESTION_OR_OTHER'] as const;
export type SaasIssueImpact = (typeof SAAS_ISSUE_IMPACTS)[number];

/** What the form says about each category and each impact, for the person who fills it. */
export const SAAS_ISSUE_CATEGORY_LABELS: Readonly<Record<SaasIssueCategory, string>> = {
  NO_ACCESS: 'The software cannot be reached or signed in to.',
  INVITATION_OR_ACTIVATION: 'The invitation or the activation of the account did not arrive or did not work.',
  MISSING_PLAN_FEATURE: 'A feature the plan should give is missing.',
  PROVIDER_OUTAGE: 'The provider seems to be down.',
  OTHER: 'Another error.',
};
export const SAAS_ISSUE_IMPACT_LABELS: Readonly<Record<SaasIssueImpact, string>> = {
  UNUSABLE: 'The software cannot be used at all.',
  PARTIAL: 'The software works in part.',
  QUESTION_OR_OTHER: 'A question or another effect.',
};

/** The warning shown before the description is written. */
export const SAAS_ISSUE_SECRET_WARNING = {
  code: 'SAAS_ISSUE.NO_SECRETS',
  message: 'Do not put a password, a token or a secret key in the description.',
} as const;

export const DESCRIPTION_MAX_LENGTH = 2000;

/** The pointers to the work the result of a report may lead to; each is only kept, none opens anything. */
export interface LinkedWork {
  grantTaskId?: string;
  discrepancyId?: string;
  returnId?: string;
  requestId?: string;
}

/**
 * What a state may move to. The reporter reopens a resolved report (`RESOLVED → IN_PROGRESS`), the sweep closes it once the window
 * has gone (`RESOLVED → CLOSED`), and the IT Admin marks a duplicate; the rest is the IT Admin handling it.
 */
const GRAPH: Readonly<Record<SaasIssueState, readonly SaasIssueState[]>> = {
  NEW: ['IN_PROGRESS', 'DUPLICATE'],
  IN_PROGRESS: ['WAITING_REPORTER', 'WAITING_PROVIDER', 'RESOLVED', 'DUPLICATE'],
  WAITING_REPORTER: ['IN_PROGRESS', 'RESOLVED', 'DUPLICATE'],
  WAITING_PROVIDER: ['IN_PROGRESS', 'RESOLVED', 'DUPLICATE'],
  RESOLVED: ['IN_PROGRESS', 'CLOSED'],
  CLOSED: [],
  DUPLICATE: [],
};

export function canMove(from: SaasIssueState, to: SaasIssueState): boolean {
  return GRAPH[from].includes(to);
}

/** The states the IT Admin moves a report to by a transition; a duplicate, the reopening and the closing have their own paths. */
const HANDLING_TARGETS: ReadonlySet<SaasIssueState> = new Set([
  'IN_PROGRESS',
  'WAITING_REPORTER',
  'WAITING_PROVIDER',
  'RESOLVED',
]);

/** Whether the IT Admin may move a report from one state to another by a transition. */
export function canHandle(from: SaasIssueState, to: SaasIssueState): boolean {
  return from !== 'RESOLVED' && HANDLING_TARGETS.has(to) && canMove(from, to);
}

/** The problem with a transition of the IT Admin, or null: the graph, then the text each target needs. */
export function transitionProblem(input: {
  from: SaasIssueState;
  to: SaasIssueState;
  message: string | null;
  resolution: string | null;
}): SaasIssueProblem | null {
  if (!canHandle(input.from, input.to)) return 'INVALID_TRANSITION';
  if (input.to === 'RESOLVED' && !input.resolution) return 'RESOLUTION_REQUIRED';
  if (input.to === 'WAITING_REPORTER' && !input.message) return 'MESSAGE_REQUIRED';

  return null;
}

/** The right a person reports on, as the rules judge it. */
export interface ReportableAssignment {
  employeeId: string;
  kind: 'PERSONAL' | 'SERVICE';
  failedAt: Date | null;
  cancelledAt: Date | null;
  validUntil: BusinessDate | null;
}

/**
 * Whether the caller may report on the assignment (`US-07-10` AC-3): it is a personal right of theirs, not one of somebody else or a
 * service account, and it still holds (not failed, not cancelled, not ended). Null assignment and somebody else's are the same answer.
 */
export function assignmentProblem(input: {
  assignment: ReportableAssignment | null;
  actorEmployeeId: string;
  today: BusinessDate;
}): SaasIssueProblem | null {
  const { assignment } = input;
  if (!assignment || assignment.kind !== 'PERSONAL' || assignment.employeeId !== input.actorEmployeeId) {
    return 'ASSIGNMENT_NOT_YOURS';
  }
  if (assignment.failedAt || assignment.cancelledAt) return 'ASSIGNMENT_NOT_OPEN';
  if (assignment.validUntil !== null && assignment.validUntil <= input.today) return 'ASSIGNMENT_NOT_OPEN';

  return null;
}

/** A moment of the error in the future is not an error that happened. */
export function occurredProblem(occurredAt: Date, now: Date): SaasIssueProblem | null {
  return occurredAt.getTime() > now.getTime() ? 'OCCURRED_IN_FUTURE' : null;
}

/** The IT Admin a new report is given to: the one in charge of the department when they can act, else the first who can. */
export function assigneeOf(input: {
  inChargeEmployeeId: string | null;
  inChargeUsable: boolean;
  fallbackEmployeeId: string | null;
}): { employeeId: string; byFallback: boolean } | null {
  if (input.inChargeEmployeeId && input.inChargeUsable) {
    return { employeeId: input.inChargeEmployeeId, byFallback: false };
  }

  return input.fallbackEmployeeId ? { employeeId: input.fallbackEmployeeId, byFallback: true } : null;
}

/** The day by which a new report should be taken up. */
export function responseDueOn(today: BusinessDate, days: number, nonWorking: NonWorkingDates): BusinessDate {
  return addWorkingDays(today, days, nonWorking);
}

/** The last day the reporter may reopen a report resolved on `resolvedOn`. */
export function reopenUntil(resolvedOn: BusinessDate, days: number, nonWorking: NonWorkingDates): BusinessDate {
  return addWorkingDays(resolvedOn, days, nonWorking);
}

/** A report that waits for its first answer past the day it was due. */
export function isResponseOverdue(input: {
  state: SaasIssueState;
  responseDueOn: BusinessDate;
  today: BusinessDate;
}): boolean {
  return input.state === 'NEW' && input.today > input.responseDueOn;
}

/** The problem with reopening a report today, or null: it is resolved and today is not after the last day. */
export function reopenProblem(input: {
  state: SaasIssueState;
  reopenUntil: BusinessDate | null;
  today: BusinessDate;
}): SaasIssueProblem | null {
  if (input.state === 'CLOSED') return 'REOPEN_WINDOW_ENDED';
  if (input.state !== 'RESOLVED') return 'NOT_RESOLVED';
  if (input.reopenUntil !== null && input.today > input.reopenUntil) return 'REOPEN_WINDOW_ENDED';

  return null;
}

/** Whether a resolved report has passed the day it may be reopened until, so the sweep closes it. */
export function isReopenLapsed(input: {
  state: SaasIssueState;
  reopenUntil: BusinessDate | null;
  today: BusinessDate;
}): boolean {
  return input.state === 'RESOLVED' && input.reopenUntil !== null && input.today > input.reopenUntil;
}

/** A calendar window wide enough for the thirty working days of a parameter with the holidays in between. */
export const CALENDAR_WINDOW_DAYS = 90;

export function windowEnd(today: BusinessDate): BusinessDate {
  return addDays(today, CALENDAR_WINDOW_DAYS);
}

/** Only the reporter may say more on a waiting report to take it back, and no one adds to a report that is closed or a duplicate. */
export function messageProblem(state: SaasIssueState): SaasIssueProblem | null {
  return state === 'CLOSED' || state === 'DUPLICATE' ? 'CLOSED' : null;
}

/** A report may be marked a duplicate of another when that is a different report and is not itself a duplicate. */
export function duplicateTargetProblem(input: {
  issueId: string;
  original: { id: string; state: SaasIssueState } | null;
}): SaasIssueProblem | null {
  const { original } = input;
  if (!original || original.id === input.issueId || original.state === 'DUPLICATE') return 'DUPLICATE_TARGET_INVALID';

  return null;
}
