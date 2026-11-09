import type { AuditValue } from '../../audit/public/audit.types';
import type { RequestEventKind } from './request-history.types';

/**
 * The audit actions the history of a request shows, each as the kind of entry a reader sees. Every other action of the trail (a read,
 * a reminder, a check of the budget, a reassignment of a step) is never read for it. The actions of one person of a request for a group
 * read as the kind of the whole request, with the person named on the entry.
 */
export const REQUEST_EVENT_ACTIONS: Readonly<Record<string, RequestEventKind>> = {
  'ACCESS_REQUEST.SUBMITTED': 'SUBMITTED',
  'ACCESS_REQUEST.SERVICE_ACCOUNT_SUBMITTED': 'SUBMITTED',
  'ACCESS_REQUEST.RENEWAL_SUBMITTED': 'SUBMITTED',
  'ACCESS_REQUEST.RESUBMITTED': 'RESUBMITTED',
  'ACCESS_REQUEST.NEED_APPROVED': 'NEED_APPROVED',
  'ACCESS_REQUEST.NEED_REJECTED': 'NEED_REJECTED',
  'ACCESS_REQUEST.LINE_NEED_DECIDED': 'LINE_NEED_DECIDED',
  'ACCESS_REQUEST.RESERVE_CONFIRMED': 'RESERVE_CONFIRMED',
  'ACCESS_REQUEST.SPEND_APPROVED': 'SPEND_APPROVED',
  'ACCESS_REQUEST.SPEND_REJECTED': 'SPEND_REJECTED',
  'ACCESS_REQUEST.LINE_SPEND_DECIDED': 'LINE_SPEND_DECIDED',
  'ACCESS_REQUEST.SPEND_RETURNED_AT_DECISION': 'RETURNED_TO_REQUESTER',
  'ACCESS_REQUEST.ASSESSMENT_COMPLETED': 'ASSESSMENT_COMPLETED',
  'ACCESS_REQUEST.ASSESSMENT_REJECTED': 'ASSESSMENT_REJECTED',
  'ACCESS_REQUEST.GRANT_STARTED': 'GRANT_STARTED',
  'ACCESS_REQUEST.LINE_GRANT_STARTED': 'GRANT_STARTED',
  'ACCESS_REQUEST.GRANT_COMPLETED': 'GRANT_COMPLETED',
  'ACCESS_REQUEST.LINE_GRANT_COMPLETED': 'GRANT_COMPLETED',
  'ACCESS_REQUEST.GRANT_FAILED': 'GRANT_FAILED',
  'ACCESS_REQUEST.LINE_GRANT_FAILED': 'GRANT_FAILED',
  'ACCESS_REQUEST.WITHDRAWAL_REQUESTED': 'WITHDRAWAL_REQUESTED',
  'ACCESS_REQUEST.LINE_WITHDRAWAL_REQUESTED': 'WITHDRAWAL_REQUESTED',
  'ACCESS_REQUEST.WITHDRAWN': 'WITHDRAWN',
  'ACCESS_REQUEST.LINE_WITHDRAWN': 'WITHDRAWN',
  'ACCESS_REQUEST.CANCELLED': 'CANCELLED',
  'ACCESS_REQUEST.LINE_CANCELLED': 'CANCELLED',
  'ACCESS_REQUEST.RENEWAL_APPLIED': 'RENEWAL_APPLIED',
};

/** The keys of `after` under which an action names the one person of a request for a group it is about. */
export const LINE_SUBJECT_KEYS = ['beneficiaryEmployeeId', 'employeeId'] as const;

/** The kinds whose `after.reason` is shown: a reason a person wrote when they refused, withdrew, closed, returned or used the reserve. */
const REASON_KINDS: readonly RequestEventKind[] = [
  'NEED_REJECTED',
  'SPEND_REJECTED',
  'ASSESSMENT_REJECTED',
  'WITHDRAWN',
  'CANCELLED',
  'RESERVE_CONFIRMED',
  'RETURNED_TO_REQUESTER',
  'LINE_NEED_DECIDED',
  'LINE_SPEND_DECIDED',
];

const text = (after: { [key: string]: AuditValue } | null, key: string): string | null => {
  const value = after?.[key];

  return typeof value === 'string' && value.length > 0 ? value : null;
};

/**
 * What one event of the trail says on the history of a request, picked from its allow-listed keys only: the kind, the person of a group
 * it is about, the role the decider acted in and the reason a person wrote. Nothing else of `after` (a figure of the budget, a snapshot,
 * an id of a check) leaves. Null for an action that is not shown.
 */
export function entryOf(event: {
  action: string;
  after: { [key: string]: AuditValue } | null;
}): { kind: RequestEventKind; lineEmployeeId: string | null; actorRole: string | null; reason: string | null } | null {
  const kind = REQUEST_EVENT_ACTIONS[event.action];
  if (kind === undefined) return null;
  const { after } = event;
  const lineEmployeeId =
    text(after, 'beneficiaryEmployeeId') ??
    (event.action.startsWith('ACCESS_REQUEST.LINE_') ? text(after, 'employeeId') : null);

  return {
    kind,
    lineEmployeeId,
    actorRole: text(after, 'deciderRole'),
    reason: REASON_KINDS.includes(kind) ? text(after, 'reason') : null,
  };
}
